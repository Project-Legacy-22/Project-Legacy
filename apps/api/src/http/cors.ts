import type { RequestHandler } from 'express';

// The front-end is served from the API's own origin in every environment: the
// Vite dev server proxies /auth and /items to the API (apps/web/vite.config.ts),
// and in production the API serves the built assets itself. So no legitimate
// browser client is ever cross-origin, and this middleware exists to say so --
// it grants the cross-origin headers to exactly one configured origin and to no
// other, and it never answers with a wildcard, which could not carry
// credentials anyway.
//
// Same shape as rate-limit.ts: a factory that takes its configuration and
// returns the handler, so the allowed origin is injected rather than read from
// the environment here.
export function cors(allowedOrigin: string): RequestHandler {
    return (req, res, next) => {
        // The response varies by Origin whether or not this one is allowed, so
        // a shared cache must key on it.
        res.setHeader('Vary', 'Origin');

        const allowed = req.headers.origin === allowedOrigin;
        if (allowed) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }

        // A preflight is answered here and never reaches a route. An allowed
        // origin gets the headers set above; any other gets a bare 204 with no
        // Access-Control-Allow-Origin, which the browser treats as a refusal.
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }

        next();
    };
}
