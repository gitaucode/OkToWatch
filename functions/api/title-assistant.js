const CATEGORY_HINTS = [
  { key: 'horror', label: 'Scary moments', match: /(scary|scared|fear|horror|creepy|intense|nightmare|fright)/i },
  { key: 'violence', label: 'Violence', match: /(violence|violent|fight|fighting|blood|gore|weapon|kill|battle|action)/i },
  { key: 'language', label: 'Bad language', match: /(swear|swearing|curse|cursing|profanity|bad words|foul language)/i },
  { key: 'sex', label: 'Sex and nudity', match: /(sex|sexual|nudity|nude|romance|kissing|make out)/i },
  { key: 'drugs', label: 'Drugs and alcohol', match: /(drugs|drug|alcohol|drinking|smoking|weed|substance)/i },
  { key: 'themes', label: 'Themes', match: /(theme|themes|message|messages|bullying|abuse|grief|sad|self-harm|mature)/i }
];

export async function onRequestPost(context) {
  const { request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const question = String(body.question || '').trim();
  const providedContext = body.context && typeof body.context === 'object' ? body.context : null;
  const selectedId = body.tmdb_id ? String(body.tmdb_id) : (providedContext?.tmdb_id ? String(providedContext.tmdb_id) : '');
  const selectedType = body.media_type || providedContext?.media_type || '';

  if (!question) {
    return json({
      mode: 'need_title',
      title: 'Hi there',
      message: 'Which movie or show would you like help with?'
    }, 400);
  }

  try {
    if (providedContext?.analysis && providedContext?.title && !isSupportedFollowUp(question)) {
      return json({
        mode: 'need_title',
        title: 'Let’s keep it title-based',
        message: 'I can help with movie or show safety questions, quick summaries, and follow-up questions once we have a title.'
      });
    }

    if (providedContext?.analysis && providedContext?.title) {
      const answer = buildAssistantAnswer(question, providedContext, extractAge(question));
      return json({ mode: 'answer', ...answer, context: providedContext });
    }

    let titleContext = null;
    if (selectedId && selectedType) {
      titleContext = await loadTitleContext({ request, tmdbId: selectedId, mediaType: selectedType, question });
    } else {
      const extracted = extractSearchQuery(question);
      if (!extracted) {
        return json({
          mode: 'need_title',
          title: 'Hi there',
          message: 'Which movie or show are you asking about?'
        });
      }

      const matches = await searchTitles({ request, query: extracted });
      if (!matches.length) {
        return json({
          mode: 'need_title',
          title: 'I couldn’t find that one yet',
          message: `I couldn’t match "${extracted}" to a movie or show. Try the exact title and I’ll take it from there.`
        });
      }

      const exactMatches = matches.filter((item) => normalizeTitle(item.title || item.name) === normalizeTitle(extracted));
      if (exactMatches.length > 1) {
        return json({
          mode: 'choose_title',
          title: 'A few titles match',
          message: `I found a few matches for "${extracted}". Which one did you mean?`,
          candidates: exactMatches.slice(0, 5).map(toCandidate)
        });
      }

      if (!exactMatches.length && matches.length > 1) {
        return json({
          mode: 'choose_title',
          title: 'A few titles came up',
          message: `I found a few close matches for "${extracted}". Pick the right one and I’ll break it down.`,
          candidates: matches.slice(0, 5).map(toCandidate)
        });
      }

      const chosen = exactMatches[0] || matches[0];
      titleContext = await loadTitleContext({
        request,
        tmdbId: String(chosen.id),
        mediaType: chosen.media_type,
        question
      });
    }

    if (!titleContext) {
      return json({
        mode: 'need_title',
        title: 'Just a moment',
        message: 'I couldn’t load that title right now. Try again in a moment.'
      }, 500);
    }

    const answer = buildAssistantAnswer(question, titleContext, extractAge(question));
    return json({ mode: 'answer', ...answer, context: titleContext, usage: titleContext.usage || null });
  } catch (error) {
    console.error('title-assistant error', error);
    if (String(error.message).includes('guest_limit')) {
      return json({ mode: 'limit', error: 'guest_limit', resetsAt: error.resetsAt || null }, 429);
    }
    if (String(error.message).includes('rate_limit')) {
      return json({ mode: 'limit', error: 'rate_limit' }, 429);
    }
    return json({ error: 'Assistant unavailable right now.' }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

async function searchTitles({ request, query }) {
  const url = new URL('/api/tmdb/search/multi', request.url);
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('include_adult', 'false');
  const res = await fetch(url.toString(), { headers: forwardedAuthHeaders(request) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).filter((item) => item.media_type === 'movie' || item.media_type === 'tv');
}

async function loadTitleContext({ request, tmdbId, mediaType, question }) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const [details, ratings] = await Promise.all([
    fetchLocalJson(request, `/api/tmdb/${endpoint}/${tmdbId}?append_to_response=credits,keywords`),
    mediaType === 'movie'
      ? fetchLocalJson(request, `/api/tmdb/movie/${tmdbId}/release_dates`)
      : fetchLocalJson(request, `/api/tmdb/tv/${tmdbId}/content_ratings`)
  ]);

  const title = details.title || details.name || '';
  const year = (details.release_date || details.first_air_date || '').slice(0, 4);
  const overview = details.overview || '';
  const genres = (details.genres || []).map((g) => g.name).join(', ');
  const keywords = ((details.keywords?.keywords || details.keywords?.results) || [])
    .map((k) => k.name)
    .slice(0, 20)
    .join(', ');
  const certRating = getCertRating(mediaType, ratings);
  const childAge = extractAge(question);

  const analyzeRes = await fetch(new URL('/api/analyze', request.url).toString(), {
    method: 'POST',
    headers: {
      ...forwardedAuthHeaders(request),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tmdb_id: tmdbId,
      media_type: mediaType,
      title,
      year,
      overview,
      genres,
      certRating,
      keywords,
      type: mediaType,
      childAge
    })
  });

  const analyzeData = await analyzeRes.json().catch(() => ({}));
  if (analyzeData.error) {
    const err = new Error(analyzeData.error);
    if (analyzeData.resetsAt) err.resetsAt = analyzeData.resetsAt;
    throw err;
  }
  if (!analyzeRes.ok) throw new Error('analyze_failed');

  const analysis = parseAnalyzePayload(analyzeData);
  return {
    tmdb_id: String(tmdbId),
    media_type: mediaType,
    title,
    year,
    certRating,
    original_language: details.original_language || '',
    spoken_languages: Array.isArray(details.spoken_languages) ? details.spoken_languages : [],
    original_title: details.original_title || details.original_name || title,
    analysis,
    usage: analyzeData._usage || null
  };
}

function buildAssistantAnswer(question, context, requestedAge) {
  const analysis = context.analysis || {};
  const audienceKey = getAudienceKey(requestedAge);
  const verdict = analysis.verdicts?.[audienceKey] || analysis.verdicts?.young || null;
  const categories = Array.isArray(analysis.categories) ? analysis.categories : [];
  const languageQuestion = isAudioLanguageQuestion(question);
  const categoryIntent = CATEGORY_HINTS.find((item) => item.match.test(question));
  const topConcerns = categories
    .filter((cat) => cat.level && cat.level !== 'none')
    .slice()
    .sort((a, b) => levelWeight(b.level) - levelWeight(a.level))
    .slice(0, 3);

  let responseTitle = `${context.title}`;
  let tldr = analysis.summary || `Here’s the quick read on ${context.title}.`;
  let bullets = [];

  if (languageQuestion) {
    const languageInfo = describeLanguageInfo(context);
    responseTitle = `Language in ${context.title}`;
    tldr = languageInfo.summary;
    bullets = languageInfo.bullets;
  } else if (categoryIntent) {
    const matched = categories.find((cat) => normalizeTitle(cat.name).includes(categoryIntent.key)) || null;
    responseTitle = `${categoryIntent.label} in ${context.title}`;
    if (matched) {
      tldr = `${context.title} has ${matched.level} concern for ${matched.name.toLowerCase()}.`;
      bullets = [
        matched.note || matched.description || `The main thing flagged here is ${matched.name.toLowerCase()}.`,
        verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
        topConcerns.length > 1 ? `Other things to keep an eye on: ${topConcerns.slice(0, 3).map((item) => item.name).join(', ')}.` : null
      ].filter(Boolean);
    } else {
      tldr = `I don’t see a major flag for ${categoryIntent.label.toLowerCase()} in the current breakdown for ${context.title}.`;
      bullets = [
        verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
        topConcerns.length ? `The bigger concerns here are ${topConcerns.map((item) => item.name.toLowerCase()).join(', ')}.` : 'The breakdown doesn’t flag any major concerns.'
      ].filter(Boolean);
    }
  } else if (/(tldr|summary|quick|bullet|bullets|main concerns|break down|breakdown)/i.test(question) || !categories.length) {
    responseTitle = `Quick take on ${context.title}`;
    bullets = [
      verdict ? `For ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}${verdict.sub ? ` - ${verdict.sub}.` : '.'}` : null,
      topConcerns[0] ? `Biggest concern: ${topConcerns[0].name} (${topConcerns[0].level}).` : 'No major concerns were highlighted in the main categories.',
      topConcerns[1] ? `Also worth noting: ${topConcerns[1].name} (${topConcerns[1].level}).` : null
    ].filter(Boolean);
  } else if (/(sensitive|gets scared easily|easily scared|nervous kid)/i.test(question)) {
    responseTitle = `For a sensitive viewer`;
    tldr = verdict
      ? `${context.title} may feel ${verdict.level || 'a bit'} intense depending on what your child reacts to most.`
      : `Here’s the quick read for a more sensitive viewer.`;
    bullets = [
      topConcerns.find((item) => /horror|fear|violence/i.test(item.name))
        ? `The biggest likely trigger is ${topConcerns.find((item) => /horror|fear|violence/i.test(item.name)).name.toLowerCase()}.`
        : 'I don’t see a major fear-based trigger called out in the top categories.',
      verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
      analysis.summary || null
    ].filter(Boolean);
  } else {
    responseTitle = `Quick answer on ${context.title}`;
    bullets = [
      verdict ? `For ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
      topConcerns.length ? `Main things to watch: ${topConcerns.map((item) => `${item.name} (${item.level})`).join(', ')}.` : 'The breakdown doesn’t flag any major concerns.',
      analysis.summary || null
    ].filter(Boolean);
  }

  return {
    title: responseTitle,
    tldr,
    bullets,
    followUps: languageQuestion
      ? ['Any bad language?', 'Give me the TL;DR', 'Would this work for a sensitive child?']
      : categoryIntent
        ? ['Give me the TL;DR', 'How scary is it?', 'Any bad language?']
        : ['Give me the TL;DR', 'How scary is it?', 'Would this work for a sensitive child?']
  };
}

function parseAnalyzePayload(analyzeData) {
  let rawContent = analyzeData.content ?? analyzeData.choices?.[0]?.message?.content ?? '';
  if (Array.isArray(rawContent)) rawContent = rawContent.map((c) => c.text || '').join('');
  rawContent = String(rawContent).replace(/```json|```/gi, '').trim();
  const jsonStart = rawContent.indexOf('{');
  const jsonEnd = rawContent.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('invalid_analysis_payload');
  const parsed = JSON.parse(rawContent.slice(jsonStart, jsonEnd + 1));
  if (!parsed.summary) parsed.summary = '';
  return parsed;
}

function extractSearchQuery(question) {
  if (isGenericTitlePrompt(question)) return '';

  const quoted = question.match(/["“”']([^"“”']{2,80})["“”']/);
  if (quoted?.[1]) return quoted[1].trim();

  let query = question.trim();
  query = query.replace(/\b(is|was|are|do you think|can you tell me if|can you tell me|tell me if|tell me about|what about|is there anything about|would)\b/gi, ' ');
  query = query.replace(/\b(okay|ok|safe|appropriate|good|fine|too scary|good for|work for|right for)\b.*$/i, ' ');
  query = query.replace(/\bfor my\b.*$/i, ' ');
  query = query.replace(/\bfor a\b.*$/i, ' ');
  query = query.replace(/\bwho\b.*$/i, ' ');
  query = query.replace(/[?!.]/g, ' ');
  query = query.replace(/\s+/g, ' ').trim();
  return query.length >= 2 ? query : '';
}

function extractAge(question) {
  const match = question.match(/(\d{1,2})\s*(?:year old|years old|yo\b|yr old|y\/o|age)\b/i) || question.match(/\bfor\s+(\d{1,2})\b/i);
  const age = Number(match?.[1] || 0);
  return age > 0 && age < 19 ? age : null;
}

function isSupportedFollowUp(question) {
  return /(tldr|summary|quick|bullet|bullets|breakdown|main concerns|scary|scared|fear|horror|intense|violence|violent|blood|gore|language|english|spanish|dubbed|dub|subtitle|subtitles|audio|original language|swear|curse|profanity|sex|sexual|nudity|romance|drugs|alcohol|smoking|themes|bullying|abuse|grief|self-harm|mature|safe|okay|appropriate|suitable|bad language|work for|kid|child|year old|sensitive)/i.test(String(question || ''));
}

function isGenericTitlePrompt(question) {
  return /^(summarize a movie for me|summarize a movie|summarize a show|summarize something|help me with a movie|help me with a show|tell me about a movie|tell me about a show|recommend a movie|recommend a show|is it okay for a \d{1,2}-year-old|what are the main concerns|how scary is it|give me the tldr)$/i.test(String(question || '').trim());
}

function isAudioLanguageQuestion(question) {
  return /(what language|which language|is it english|is it spanish|spanish|english|dubbed|dub|subtitles|subtitle|audio|original language|spoken language)/i.test(String(question || ''));
}

function describeLanguageInfo(context) {
  const spokenLanguages = Array.isArray(context.spoken_languages) ? context.spoken_languages : [];
  const spokenNames = spokenLanguages
    .map((item) => item?.english_name || item?.name || '')
    .filter(Boolean);
  const primaryLanguage = spokenNames[0] || languageNameFromCode(context.original_language);
  const originalTitle = context.original_title || context.title;
  const isDifferentOriginalTitle = originalTitle && originalTitle !== context.title;

  const bullets = [];
  if (primaryLanguage) {
    bullets.push(`The main spoken language listed for this title is ${primaryLanguage}.`);
  }
  if (spokenNames.length > 1) {
    bullets.push(`Other listed spoken languages: ${spokenNames.slice(1, 4).join(', ')}.`);
  }
  if (isDifferentOriginalTitle) {
    bullets.push(`Its original title is "${originalTitle}", which can be a clue that some releases are dubbed or localized.`);
  }
  bullets.push('Whether a specific streaming app has dubbed audio or subtitles can vary by platform and region.');

  return {
    summary: primaryLanguage
      ? `${context.title} is primarily listed as ${primaryLanguage}.`
      : `I can tell you about the title’s listed original language, but dubbing and subtitles can vary depending on where you watch it.`,
    bullets
  };
}

function languageNameFromCode(code) {
  const map = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    pt: 'Portuguese',
    hi: 'Hindi'
  };
  return map[String(code || '').toLowerCase()] || '';
}

function getAudienceKey(age) {
  if (typeof age !== 'number' || Number.isNaN(age)) return 'young';
  if (age <= 10) return 'young';
  if (age <= 17) return 'teens';
  return 'adults';
}

function audienceLabel(audienceKey, age) {
  if (typeof age === 'number' && age > 0) return `a ${age}-year-old`;
  if (audienceKey === 'teens') return 'teens';
  if (audienceKey === 'adults') return 'adults';
  return 'younger kids';
}

function levelWeight(level) {
  return { none: 0, mild: 1, moderate: 2, strong: 3 }[level] || 0;
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toCandidate(item) {
  return {
    tmdb_id: String(item.id),
    media_type: item.media_type,
    title: item.title || item.name || 'Unknown title',
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    poster_path: item.poster_path || ''
  };
}

function getCertRating(mediaType, ratings) {
  if (mediaType === 'movie') {
    const us = (ratings.results || []).find((r) => r.iso_3166_1 === 'US');
    if (!us) return '';
    const cert = us.release_dates?.find((d) => d.certification);
    return cert?.certification || '';
  }
  const us = (ratings.results || []).find((r) => r.iso_3166_1 === 'US');
  return us?.rating || '';
}

async function fetchLocalJson(request, path) {
  const res = await fetch(new URL(path, request.url).toString(), {
    headers: forwardedAuthHeaders(request)
  });
  if (!res.ok) throw new Error(`local_fetch_failed:${path}`);
  return res.json();
}

function forwardedAuthHeaders(request) {
  const headers = {};
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers.Authorization = authHeader;
  return headers;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
