// XS Salon edge worker (Cloudflare) — salon.xelorsoft.com
// Serves the built app from the `deploy` branch of abzops/xs-saloon (written by
// .github/workflows/deploy.yml), with security headers and SPA routing.
// Hashed files under /assets/ are immutable; index.html is revalidated.
const ORIGIN = 'https://raw.githubusercontent.com/abzops/xs-saloon/deploy';
const TYPES = {
  js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', woff2: 'font/woff2', woff: 'font/woff', webmanifest: 'application/manifest+json', json: 'application/json', txt: 'text/plain',
};
const SEC = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'strict-transport-security': 'max-age=31536000; includeSubDomains',
};

async function fromOrigin(path, ttl) {
  const r = await fetch(`${ORIGIN}${path}`, { cf: { cacheTtl: ttl, cacheEverything: true } });
  return r.ok ? r : null;
}

export default {
  async fetch(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const { pathname } = new URL(req.url);
    if (pathname === '/healthz') return new Response('ok');
    if (pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /book/\nDisallow: /\n', { headers: { 'content-type': TYPES.txt } });
    const ext = (pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    if (ext && TYPES[ext]) {
      if (!/^\/(assets|brand)\/[\w.@-]+$|^\/(theme\.js|manifest\.webmanifest)$/.test(pathname)) return new Response('Not found', { status: 404 });
      const immutable = pathname.startsWith('/assets/');
      const r = await fromOrigin(pathname, immutable ? 31536000 : 300);
      if (!r) return new Response('Not found', { status: 404 });
      return new Response(r.body, { headers: { ...SEC, 'content-type': TYPES[ext], 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300' } });
    }
    // Bust GitHub's raw CDN cache every 30 s so a new deploy shows within a minute.
    const r = await fromOrigin(`/index.html?v=${Math.floor(Date.now() / 30000)}`, 30);
    if (!r) return new Response('XS Salon is updating. Please refresh in a moment.', { status: 503 });
    return new Response(r.body, { headers: { ...SEC, 'content-type': TYPES.html, 'cache-control': 'no-cache', 'content-security-policy': "frame-ancestors 'none'" } });
  },
};
