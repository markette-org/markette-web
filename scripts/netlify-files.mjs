// Writes Netlify's _redirects and _headers into the build output.
// The browser talks to the Markette server through Netlify (same origin, no CORS):
// /api, /media, /admin, /static, /mcp and the OAuth metadata are proxied to MARKETTE_API_ORIGIN.
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'dist/frontend/browser';
const origin = (process.env.MARKETTE_API_ORIGIN || '').trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(origin)) {
  console.error('Set MARKETTE_API_ORIGIN to the server origin, e.g. https://api.markette.org');
  process.exit(1);
}

const proxied = ['api', 'media', 'admin', 'static', 'mcp', 'downloads'];
const redirects = [
  ...proxied.flatMap((p) => [`/${p}  ${origin}/${p}  200!`, `/${p}/*  ${origin}/${p}/:splat  200!`]),
  `/.well-known/oauth-protected-resource/*  ${origin}/.well-known/oauth-protected-resource/:splat  200!`,
  `/.well-known/oauth-protected-resource  ${origin}/.well-known/oauth-protected-resource  200!`,
  // Single-page app: every other path is the Angular app.
  '/*  /index.html  200',
];
writeFileSync(`${out}/_redirects`, redirects.join('\n') + '\n');

const headers = `/index.html
  Cache-Control: no-cache
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
`;
writeFileSync(`${out}/_headers`, headers);
console.log(`Netlify files written to ${out} (API at ${origin})`);
