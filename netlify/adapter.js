// Wraps a Vercel-style module ({ GET, POST } Web handlers) as a Netlify Functions v2 handler.
export function adapt(mod) {
  return async (request) => {
    const handler = mod[request.method];
    if (!handler) return new Response('Method not allowed', { status: 405 });
    return handler(request);
  };
}
