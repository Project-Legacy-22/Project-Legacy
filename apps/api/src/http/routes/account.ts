import { DeleteAccountBody, PersonalDataExportDto } from '@legacy/contracts';
import { Router } from 'express';
import type { RequestHandler } from 'express';

import type { AccountUseCases, AuthUseCases } from '../../composition-root.js';
import { accountOf, clearSessionCookies, requireAccount } from '../session.js';

export interface AccountRoutesOptions {
    secureCookie: boolean;
}

// The name the export is saved under. Fixed, and deliberately impersonal: a
// file named after the address it belongs to would carry that address into
// whatever the browser does with a download, including a shared folder.
const EXPORT_FILENAME = 'legacy-22-personal-data-export.json';

// The two rights of US-13, on the resource that already designates the caller's
// own account. GET /auth/me answers who you are; these two hand back everything
// held about you, and remove it.
//
// Both are mounted behind requireAccount and name the account they resolved to.
// Neither takes an identifier from the request: an endpoint that accepted one
// would be an endpoint that could be aimed at somebody else.
export function accountRouter(
    useCases: AccountUseCases,
    auth: AuthUseCases,
    options: AccountRoutesOptions,
): Router {
    const router = Router();

    const exportPersonalData: RequestHandler = (_req, res, next) => {
        useCases
            .exportPersonalData(accountOf(res).id)
            // Parsed through the contract on the way out rather than mapped
            // field by field. The check is the point: a shape that stopped
            // matching what the schema describes fails here instead of
            // reaching a person as a file they cannot use, and any field a
            // later change adds to the domain is dropped rather than leaked.
            .then(data => {
                // Parsed before a single header is set, so a document that
                // failed the check leaves through the error middleware as a
                // plain problem response and not as an attachment announcing a
                // file that is not there.
                const document = PersonalDataExportDto.parse(data);

                res.type('application/json')
                    .set('Content-Disposition', `attachment; filename="${EXPORT_FILENAME}"`)
                    .send(document);
            })
            .catch(next);
    };

    const eraseAccount: RequestHandler = (req, res, next) => {
        const body = DeleteAccountBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .eraseAccount(accountOf(res), body.data.confirmation)
            .then(() => {
                clearSessionCookies(res, options.secureCookie);
                // Nothing to return: there is no longer an account to describe,
                // and a body echoing what was deleted would be a last copy of
                // it.
                res.status(204).end();
            })
            .catch(next);
    };

    const session = requireAccount(auth, options.secureCookie);

    router.get('/auth/me/export', session, exportPersonalData);
    router.delete('/auth/me', session, eraseAccount);

    return router;
}
