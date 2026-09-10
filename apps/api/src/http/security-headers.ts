import helmet from 'helmet';
import type { RequestHandler } from 'express';

// Every response, the app shell included, carries the same set of security
// headers. helmet owns the ones whose correct value is a fixed string --
// nosniff, Referrer-Policy, HSTS, the cross-origin isolation trio -- and its
// defaults are what we want there. The content security policy is spelled out
// in full rather than extended from the default, because it is the one header
// whose right value depends on how this application's front-end is built.
//
// The Vite production build emits hashed asset files and references them with
// external <script type="module"> and <link rel="stylesheet"> tags. It injects
// no inline script and no inline style, and apps/web styles every component
// through external CSS files, so 'self' alone is enough for both. If a future
// build step introduces an inline bootstrap script, this is where its hash goes.
export function securityHeaders(): RequestHandler {
    return helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                'default-src': ["'self'"],
                'script-src': ["'self'"],
                'style-src': ["'self'"],
                'img-src': ["'self'", 'data:'],
                'font-src': ["'self'"],
                'connect-src': ["'self'"],
                'object-src': ["'none'"],
                'base-uri': ["'self'"],
                'form-action': ["'self'"],
                'frame-ancestors': ["'none'"],
                'upgrade-insecure-requests': [],
            },
        },
    });
}
