// Lets the same handlers in /api run on Netlify.
//
// Vercel calls a handler like  handler(req, res)  (Node-style objects).
// Netlify Functions (v2) call   handler(request) → Response  (web-standard objects).
// This wrapper translates one into the other, so the real logic lives in one place (/api).

export function adapt(handler) {
  return async (request) => {
    const url = new URL(request.url);
    const req = {
      url: url.pathname + url.search,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      query: Object.fromEntries(url.searchParams),
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      try { req.body = JSON.parse(text); } catch { req.body = text; }
    }

    const headers = new Headers();
    let status = 200;
    return new Promise((resolve) => {
      const res = {
        get statusCode() { return status; },
        set statusCode(v) { status = v; },
        setHeader: (k, v) => headers.set(k, v),
        end: (body) => resolve(new Response(body ?? null, { status, headers })),
      };
      Promise.resolve(handler(req, res)).catch((err) => resolve(
        new Response(JSON.stringify({ error: String(err.message || err) }), { status: 500, headers: { 'content-type': 'application/json' } }),
      ));
    });
  };
}
