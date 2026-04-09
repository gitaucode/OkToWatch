function allowedOrigins(request, env) {
  const origins = new Set();

  try {
    origins.add(new URL(request.url).origin);
  } catch {}

  const raw = [
    env?.ALLOWED_ORIGINS,
    env?.APP_ORIGIN,
    env?.PUBLIC_APP_ORIGIN,
    env?.SITE_URL,
    env?.URL
  ].filter(Boolean).join(',');

  raw.split(',').map((value) => value.trim()).filter(Boolean).forEach((value) => {
    origins.add(value.replace(/\/+$/, ''));
  });

  return origins;
}

export function corsHeaders(request, env, options = {}) {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(request, env);

  if (origin && allowed.has(origin.replace(/\/+$/, ''))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  if (options.methods) {
    headers.set('Access-Control-Allow-Methods', Array.isArray(options.methods) ? options.methods.join(', ') : options.methods);
  }
  if (options.headers) {
    headers.set('Access-Control-Allow-Headers', Array.isArray(options.headers) ? options.headers.join(', ') : options.headers);
  }
  if (options.maxAge) {
    headers.set('Access-Control-Max-Age', String(options.maxAge));
  }

  return headers;
}

export function withCors(response, request, env, options = {}) {
  const out = new Response(response.body, response);
  const extra = corsHeaders(request, env, options);
  extra.forEach((value, key) => {
    out.headers.set(key, value);
  });
  return out;
}

export function jsonWithCors(data, request, env, options = {}) {
  const response = new Response(JSON.stringify(data), {
    status: options.status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...(options.cacheControl ? { 'Cache-Control': options.cacheControl } : {})
    }
  });
  return withCors(response, request, env, options);
}

export function optionsResponse(request, env, options = {}) {
  return withCors(new Response(null, { status: 204 }), request, env, options);
}
