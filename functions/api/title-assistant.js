const CATEGORY_HINTS = [
  { key: 'horror', label: 'Scary moments', match: /(scary|scared|fear|horror|creepy|intense|nightmare|fright)/i },
  { key: 'violence', label: 'Violence', match: /(violence|violent|fight|fighting|blood|gore|weapon|kill|battle|action)/i },
  { key: 'language', label: 'Bad language', match: /(swear|swearing|curse|cursing|profanity|bad words|foul language)/i },
  { key: 'sex', label: 'Sex and nudity', match: /(sex|sexual|nudity|nude|romance|kissing|make out)/i },
  { key: 'drugs', label: 'Drugs and alcohol', match: /(drugs|drug|alcohol|drinking|smoking|weed|substance)/i },
  { key: 'themes', label: 'Themes', match: /(theme|themes|message|messages|bullying|abuse|grief|sad|self-harm|mature)/i }
];

const EXTRACTION_MODEL = 'llama-3.1-8b-instant';

export async function onRequestPost(context) {
  const { request, env } = context;

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
    if (isGreetingOnly(question)) {
      return json({
        mode: 'need_title',
        title: 'Hi there',
        message: 'Happy to help. Which movie or show are you asking about?'
      });
    }

    if (providedContext?.analysis && providedContext?.title && !isSupportedFollowUp(question)) {
      return json({
        mode: 'need_title',
        title: 'Let’s keep it title-based',
        message: 'I can help with movie or show safety questions, quick summaries, and follow-up questions once we have a title.'
      });
    }

    let interpreted = null;

    if (providedContext?.analysis && providedContext?.title) {
      interpreted = await interpretQuestion(question, env);
      if (isAmbiguousLanguageQuestion(question)) {
        return json({
          mode: 'choose_prompt',
          title: 'Which kind of language do you mean?',
          message: `For ${providedContext.title}, are you asking about spoken language or bad language?`,
          context: providedContext,
          options: [
            { label: 'Spoken language / dubbing', prompt: `What spoken language is ${providedContext.title} in?` },
            { label: 'Bad language / swearing', prompt: `Is there bad language in ${providedContext.title}?` }
          ]
        });
      }
      const requestedAge = interpreted?.age ?? extractAge(question);
      if (shouldAskAgeClarification(question, interpreted, requestedAge, providedContext)) {
        return buildAgePromptResponse(providedContext);
      }
      const answer = buildAssistantAnswer(question, providedContext, requestedAge, interpreted);
      return json({ mode: 'answer', ...answer, context: providedContext });
    }

    interpreted = await interpretQuestion(question, env);

    let titleContext = null;
    if (selectedId && selectedType) {
      titleContext = await loadTitleContext({
        request,
        tmdbId: selectedId,
        mediaType: selectedType,
        question,
        childAge: interpreted?.age ?? extractAge(question)
      });
    } else {
      const searchTitle = firstNonEmpty(
        interpreted?.searchTitle,
        interpreted?.alternateTitle,
        extractSearchQuery(question)
      );

      if (!searchTitle) {
        return json({
          mode: 'need_title',
          title: 'Hi there',
          message: interpreted?.clarificationPrompt || 'Which movie or show are you asking about?'
        });
      }

      let matches = await searchTitles({ request, query: searchTitle });
      if (!matches.length && interpreted?.alternateTitle && interpreted.alternateTitle !== searchTitle) {
        matches = await searchTitles({ request, query: interpreted.alternateTitle });
      }

      if (!matches.length) {
        return json({
          mode: 'need_title',
          title: 'I couldn’t find that one yet',
          message: `I couldn’t match "${searchTitle}" to a movie or show. Try the exact title and I’ll take it from there.`
        });
      }

      const selected = chooseCandidate(matches, searchTitle, interpreted);
      if (selected.mode === 'confirm') {
        const decoratedCandidates = await decorateCandidates(request, selected.candidates || []);
        const decoratedCandidate = decoratedCandidates.find((item) => item.tmdb_id === selected.candidate?.tmdb_id && item.media_type === selected.candidate?.media_type)
          || selected.candidate;
        return json({
          mode: 'confirm_title',
          title: selected.title,
          message: selected.message,
          candidate: decoratedCandidate,
          candidates: decoratedCandidates
        });
      }
      if (selected.mode === 'choose') {
        const decoratedCandidates = await decorateCandidates(request, selected.candidates || []);
        return json({
          mode: 'choose_title',
          title: selected.title,
          message: selected.message,
          candidates: decoratedCandidates
        });
      }

      titleContext = await loadTitleContext({
        request,
        tmdbId: String(selected.item.id),
        mediaType: selected.item.media_type,
        question,
        childAge: interpreted?.age ?? extractAge(question)
      });
    }

    if (!titleContext) {
      return json({
        mode: 'need_title',
        title: 'Just a moment',
        message: 'I couldn’t load that title right now. Try again in a moment.'
      }, 500);
    }

    if (isAmbiguousLanguageQuestion(question)) {
      return json({
        mode: 'choose_prompt',
        title: 'Which kind of language do you mean?',
        message: `For ${titleContext.title}, are you asking about spoken language or bad language?`,
        context: titleContext,
        options: [
          { label: 'Spoken language / dubbing', prompt: `What spoken language is ${titleContext.title} in?` },
          { label: 'Bad language / swearing', prompt: `Is there bad language in ${titleContext.title}?` }
        ]
      });
    }

    const requestedAge = interpreted?.age ?? extractAge(question);
    if (shouldAskAgeClarification(question, interpreted, requestedAge, titleContext)) {
      return buildAgePromptResponse(titleContext);
    }
    const answer = buildAssistantAnswer(question, titleContext, requestedAge, interpreted);
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

async function interpretQuestion(question, env) {
  if (!env.GROQ_API_KEY) {
    return heuristicInterpretQuestion(question);
  }

  const system = [
    'You extract the likely movie or TV title and user intent from a parent safety question.',
    'Respond with valid JSON only.',
    'Never invent title facts.',
    'If the user did not provide a title, leave searchTitle empty.',
    'requestType must be one of: summary, suitability, scary, bad_language, violence, sex, drugs, themes, audio_language, sensitive_child.',
    'clarificationPrompt should be short, friendly, and only ask for the missing title or missing distinction.'
  ].join(' ');

  const user = [
    'Question: ' + question,
    '',
    'Return this JSON shape exactly:',
    '{',
    '  "searchTitle": "best guess title string or empty string",',
    '  "alternateTitle": "optional alternate guess or empty string",',
    '  "requestType": "summary|suitability|scary|bad_language|violence|sex|drugs|themes|audio_language|sensitive_child",',
    '  "age": null,',
    '  "needsClarification": false,',
    '  "clarificationPrompt": "short friendly prompt or empty string"',
    '}'
  ].join('\n');

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.GROQ_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        temperature: 0,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!groqRes.ok) {
      return heuristicInterpretQuestion(question);
    }

    const groqData = await groqRes.json();
    let raw = groqData.choices?.[0]?.message?.content || '';
    if (Array.isArray(raw)) raw = raw.map((item) => item?.text || '').join('');
    raw = String(raw).replace(/```json|```/gi, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return heuristicInterpretQuestion(question);
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      searchTitle: String(parsed.searchTitle || '').trim(),
      alternateTitle: String(parsed.alternateTitle || '').trim(),
      requestType: normalizeRequestType(parsed.requestType),
      age: normalizeAge(parsed.age),
      needsClarification: !!parsed.needsClarification,
      clarificationPrompt: String(parsed.clarificationPrompt || '').trim()
    };
  } catch {
    return heuristicInterpretQuestion(question);
  }
}

function heuristicInterpretQuestion(question) {
  return {
    searchTitle: extractSearchQuery(question),
    alternateTitle: '',
    requestType: inferRequestType(question),
    age: extractAge(question),
    needsClarification: false,
    clarificationPrompt: 'Which movie or show are you asking about?'
  };
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

function chooseCandidate(matches, searchTitle, interpreted) {
  const normalizedSearch = normalizeTitle(searchTitle);
  const exactMatches = matches.filter((item) => normalizeTitle(item.title || item.name) === normalizedSearch);
  if (exactMatches.length === 1) {
    return { mode: 'selected', item: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return {
      mode: 'choose',
      title: 'A few titles match',
      message: `I found a few matches for "${searchTitle}". Which one did you mean?`,
      candidates: exactMatches.slice(0, 5).map(toCandidate)
    };
  }

  const strongPrefixMatches = matches.filter((item) => {
    const title = normalizeTitle(item.title || item.name);
    return title.startsWith(normalizedSearch) || normalizedSearch.startsWith(title);
  });

  if (strongPrefixMatches.length === 1 && !interpreted?.needsClarification) {
    return { mode: 'selected', item: strongPrefixMatches[0] };
  }

  const scoredMatches = matches
    .map((item) => ({ item, score: scoreCandidate(item, searchTitle) }))
    .sort((a, b) => b.score - a.score);

  const topMatch = scoredMatches[0];
  const secondMatch = scoredMatches[1];
  if (
    topMatch &&
    !interpreted?.needsClarification &&
    topMatch.score >= 0.88 &&
    (!secondMatch || topMatch.score - secondMatch.score >= 0.12)
  ) {
    return {
      mode: 'confirm',
      title: 'Did you mean this one?',
      message: `I found a strong match for "${searchTitle}".`,
      candidate: toCandidate(topMatch.item),
      candidates: scoredMatches.slice(0, 5).map((entry) => toCandidate(entry.item))
    };
  }

  return {
    mode: 'choose',
    title: 'A few titles came up',
    message: `I found a few close matches for "${searchTitle}". Pick the right one and I'll break it down.`,
    candidates: matches.slice(0, 5).map(toCandidate)
  };
}

async function loadTitleContext({ request, tmdbId, mediaType, question, childAge }) {
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

function buildAssistantAnswer(question, context, requestedAge, interpreted) {
  const analysis = context.analysis || {};
  const displayTitle = context.year ? `${context.title} (${context.year})` : context.title;
  const audienceKey = getAudienceKey(requestedAge);
  const verdict = analysis.verdicts?.[audienceKey] || analysis.verdicts?.young || null;
  const categories = Array.isArray(analysis.categories) ? analysis.categories : [];
  const requestType = normalizeRequestType(interpreted?.requestType) || inferRequestType(question);
  const categoryIntent = findCategoryIntent(question, requestType);
  const topConcerns = categories
    .filter((cat) => cat.level && cat.level !== 'none')
    .slice()
    .sort((a, b) => levelWeight(b.level) - levelWeight(a.level))
    .slice(0, 3);

  let responseTitle = `About ${displayTitle}`;
  let tldr = analysis.summary || `Here's the quick read on ${displayTitle}.`;
  let bullets = [];

  if (requestType === 'audio_language') {
    const languageInfo = describeLanguageInfo(context);
    responseTitle = `Language in ${displayTitle}`;
    tldr = languageInfo.summary;
    bullets = languageInfo.bullets;
  } else if (categoryIntent) {
    const matched = categories.find((cat) => normalizeTitle(cat.name).includes(categoryIntent.key)) || null;
    responseTitle = `${categoryIntent.label} in ${displayTitle}`;
    if (matched) {
      tldr = `${displayTitle} has ${matched.level} concern for ${matched.name.toLowerCase()}.`;
      bullets = [
        matched.note || matched.description || `The main thing flagged here is ${matched.name.toLowerCase()}.`,
        verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
        topConcerns.length > 1 ? `Other things to keep an eye on: ${topConcerns.slice(0, 3).map((item) => item.name).join(', ')}.` : null
      ].filter(Boolean);
    } else {
      tldr = `I don't see a major flag for ${categoryIntent.label.toLowerCase()} in the current breakdown for ${displayTitle}.`;
      bullets = [
        verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
        topConcerns.length ? `The bigger concerns here are ${topConcerns.map((item) => item.name.toLowerCase()).join(', ')}.` : `The breakdown doesn't flag any major concerns.`
      ].filter(Boolean);
    }
  } else if (requestType === 'sensitive_child') {
    responseTitle = `For a sensitive viewer: ${displayTitle}`;
    tldr = verdict
      ? `${displayTitle} may feel a bit intense depending on what your child reacts to most.`
      : `Here's the quick read for a more sensitive viewer.`;
    bullets = [
      topConcerns.find((item) => /horror|fear|violence/i.test(item.name))
        ? `The biggest likely trigger is ${topConcerns.find((item) => /horror|fear|violence/i.test(item.name)).name.toLowerCase()}.`
        : `I don't see a major fear-based trigger called out in the top categories.`,
      verdict ? `Overall verdict for ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
      analysis.summary || null
    ].filter(Boolean);
  } else if (requestType === 'summary' || requestType === 'suitability') {
    responseTitle = `Quick take on ${displayTitle}`;
    bullets = [
      verdict ? `For ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}${verdict.sub ? ` - ${verdict.sub}.` : `.`}` : null,
      topConcerns[0] ? `Biggest concern: ${topConcerns[0].name} (${topConcerns[0].level}).` : 'No major concerns were highlighted in the main categories.',
      topConcerns[1] ? `Also worth noting: ${topConcerns[1].name} (${topConcerns[1].level}).` : null
    ].filter(Boolean);
  } else {
    responseTitle = `Quick answer on ${displayTitle}`;
    bullets = [
      verdict ? `For ${audienceLabel(audienceKey, requestedAge)}: ${verdict.text}.` : null,
      topConcerns.length ? `Main things to watch: ${topConcerns.map((item) => `${item.name} (${item.level})`).join(', ')}.` : `The breakdown doesn't flag any major concerns.`,
      analysis.summary || null
    ].filter(Boolean);
  }

  return {
    title: responseTitle,
    tldr,
    bullets,
    followUps: getFollowUps(requestType)
  };
}

function shouldAskAgeClarification(question, interpreted, requestedAge, context) {
  if (requestedAge) return false;
  const requestType = normalizeRequestType(interpreted?.requestType) || inferRequestType(question);
  if (!['summary', 'suitability', 'scary', 'violence', 'bad_language'].includes(requestType)) return false;
  const verdicts = context?.analysis?.verdicts || {};
  const young = verdicts.young?.text || '';
  const teens = verdicts.teens?.text || '';
  if (!young || !teens) return false;
  return young !== teens;
}

function buildAgePromptResponse(context) {
  const displayTitle = context?.year ? `${context.title} (${context.year})` : context?.title || 'this title';
  return json({
    mode: 'choose_prompt',
    title: 'What age are you asking about?',
    message: `I can make this more specific for ${displayTitle}.`,
    context,
    options: [
      { label: 'Age 6', prompt: `Is ${context.title} okay for a 6-year-old?` },
      { label: 'Age 9', prompt: `Is ${context.title} okay for a 9-year-old?` },
      { label: 'Age 13', prompt: `Is ${context.title} okay for a 13-year-old?` },
      { label: 'Just general', prompt: `Give me the general quick take on ${context.title}` }
    ]
  });
}

function getFollowUps(requestType) {
  if (requestType === 'audio_language') {
    return ['Any bad language?', 'Give me the TL;DR', 'Would this work for a sensitive child?'];
  }
  if (requestType === 'scary') {
    return ['Give me the TL;DR', 'Any bad language?', 'Would this work for a sensitive child?'];
  }
  return ['Give me the TL;DR', 'How scary is it?', 'Any bad language?'];
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

  let query = String(question || '').trim();
  query = query.replace(/\b(is|was|are|do you think|can you tell me if|can you tell me|tell me if|tell me about|what about|is there anything about|would|how is)\b/gi, ' ');
  query = query.replace(/\b(okay|ok|safe|appropriate|good|fine|too scary|good for|work for|right for)\b.*$/i, ' ');
  query = query.replace(/\bfor my\b.*$/i, ' ');
  query = query.replace(/\bfor a\b.*$/i, ' ');
  query = query.replace(/\bwho\b.*$/i, ' ');
  query = query.replace(/[?!.]/g, ' ');
  query = query.replace(/\s+/g, ' ').trim();
  return query.length >= 2 ? query : '';
}

function extractAge(question) {
  const match = String(question || '').match(/(\d{1,2})\s*(?:year old|years old|yo\b|yr old|y\/o|age)\b/i) || String(question || '').match(/\bfor\s+(\d{1,2})\b/i);
  const age = Number(match?.[1] || 0);
  return age > 0 && age < 19 ? age : null;
}

function isSupportedFollowUp(question) {
  return /(tldr|summary|quick|bullet|bullets|breakdown|main concerns|scary|scared|fear|horror|intense|violence|violent|blood|gore|language|english|spanish|dubbed|dub|subtitle|subtitles|audio|original language|spoken language|swear|curse|profanity|sex|sexual|nudity|romance|drugs|alcohol|smoking|themes|bullying|abuse|grief|self-harm|mature|safe|okay|appropriate|suitable|bad language|work for|kid|child|year old|sensitive)/i.test(String(question || ''));
}

function isGenericTitlePrompt(question) {
  return /^(summarize a movie for me|summarize a movie|summarize a show|summarize something|help me with a movie|help me with a show|tell me about a movie|tell me about a show|recommend a movie|recommend a show|is it okay for a \d{1,2}-year-old|what are the main concerns|how scary is it|give me the tldr)$/i.test(String(question || '').trim());
}

function isGreetingOnly(question) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|howdy|hola|hi there|hello there)$/i.test(String(question || '').trim());
}

function isAmbiguousLanguageQuestion(question) {
  const value = String(question || '').trim();
  return /\blanguage\b/i.test(value) &&
    !/(spoken language|original language|english|spanish|dubbed|dub|subtitle|subtitles|audio|bad language|swear|swearing|curse|cursing|profanity|foul language)/i.test(value);
}

function inferRequestType(question) {
  const value = String(question || '');
  if (/(what language|which language|is it english|is it spanish|spanish|english|dubbed|dub|subtitles|subtitle|audio|original language|spoken language)/i.test(value)) return 'audio_language';
  if (/(sensitive|gets scared easily|easily scared|nervous kid)/i.test(value)) return 'sensitive_child';
  if (/(scary|scared|fear|horror|creepy|intense|nightmare|fright)/i.test(value)) return 'scary';
  if (/(swear|swearing|curse|cursing|profanity|bad words|foul language)/i.test(value)) return 'bad_language';
  if (/(violence|violent|fight|fighting|blood|gore|weapon|kill|battle|action)/i.test(value)) return 'violence';
  if (/(sex|sexual|nudity|nude|romance|kissing|make out)/i.test(value)) return 'sex';
  if (/(drugs|drug|alcohol|drinking|smoking|weed|substance)/i.test(value)) return 'drugs';
  if (/(theme|themes|message|messages|bullying|abuse|grief|sad|self-harm|mature)/i.test(value)) return 'themes';
  if (/(okay|ok|safe|appropriate|good for|work for|right for|suitable)/i.test(value)) return 'suitability';
  return 'summary';
}

function normalizeRequestType(value) {
  const allowed = new Set(['summary', 'suitability', 'scary', 'bad_language', 'violence', 'sex', 'drugs', 'themes', 'audio_language', 'sensitive_child']);
  return allowed.has(value) ? value : 'summary';
}

function findCategoryIntent(question, requestType) {
  if (requestType === 'bad_language') return CATEGORY_HINTS.find((item) => item.key === 'language');
  if (requestType === 'violence') return CATEGORY_HINTS.find((item) => item.key === 'violence');
  if (requestType === 'sex') return CATEGORY_HINTS.find((item) => item.key === 'sex');
  if (requestType === 'drugs') return CATEGORY_HINTS.find((item) => item.key === 'drugs');
  if (requestType === 'themes') return CATEGORY_HINTS.find((item) => item.key === 'themes');
  if (requestType === 'scary') return CATEGORY_HINTS.find((item) => item.key === 'horror');
  return CATEGORY_HINTS.find((item) => item.match.test(question));
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

function scoreCandidate(item, searchTitle) {
  const normalizedSearch = normalizeTitle(searchTitle);
  const normalizedTitle = normalizeTitle(item.title || item.name);
  if (!normalizedSearch || !normalizedTitle) return 0;
  if (normalizedTitle === normalizedSearch) return 1;
  if (normalizedTitle.startsWith(normalizedSearch) || normalizedSearch.startsWith(normalizedTitle)) return 0.94;

  const searchTokens = normalizedSearch.split(' ').filter(Boolean);
  const titleTokens = normalizedTitle.split(' ').filter(Boolean);
  const overlap = searchTokens.filter((token) => titleTokens.includes(token)).length;
  const coverage = searchTokens.length ? overlap / searchTokens.length : 0;
  const density = titleTokens.length ? overlap / titleTokens.length : 0;
  return Number((coverage * 0.7 + density * 0.3).toFixed(2));
}

function toCandidate(item) {
  return {
    tmdb_id: String(item.id),
    media_type: item.media_type,
    title: item.title || item.name || 'Unknown title',
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    poster_path: item.poster_path || '',
    genre_ids: Array.isArray(item.genre_ids) ? item.genre_ids : [],
    is_animated: Array.isArray(item.genre_ids) ? item.genre_ids.includes(16) : false,
    studio_hint: '',
    hint_label: ''
  };
}

async function decorateCandidates(request, candidates) {
  const list = Array.isArray(candidates) ? candidates.slice(0, 5) : [];
  return Promise.all(list.map(async (candidate) => {
    try {
      const endpoint = candidate.media_type === 'tv' ? 'tv' : 'movie';
      const details = await fetchLocalJson(request, `/api/tmdb/${endpoint}/${candidate.tmdb_id}`);
      const companies = Array.isArray(details.production_companies) ? details.production_companies : [];
      const studio = companies.find((company) => /disney|pixar|marvel|lucasfilm/i.test(String(company.name || '')))
        || companies[0]
        || null;
      const isAnimated = Array.isArray(details.genres) ? details.genres.some((genre) => Number(genre.id) === 16 || /animation/i.test(String(genre.name || ''))) : candidate.is_animated;
      const studioHint = studio?.name || '';
      const hintParts = [
        candidate.year ? String(candidate.year) : '',
        isAnimated ? 'Animated' : '',
        studioHint
      ].filter(Boolean);
      return {
        ...candidate,
        is_animated: !!isAnimated,
        studio_hint: studioHint,
        hint_label: hintParts.join(' • ')
      };
    } catch {
      const hintParts = [
        candidate.year ? String(candidate.year) : '',
        candidate.is_animated ? 'Animated' : ''
      ].filter(Boolean);
      return {
        ...candidate,
        hint_label: hintParts.join(' • ')
      };
    }
  }));
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

function firstNonEmpty(...values) {
  for (const value of values) {
    const stringValue = String(value || '').trim();
    if (stringValue) return stringValue;
  }
  return '';
}

function normalizeAge(value) {
  const age = Number(value);
  return age > 0 && age < 19 ? age : null;
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
