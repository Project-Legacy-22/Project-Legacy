import { AccountDto, ProblemDetails } from '@legacy/contracts';
import type { RegisterAccountBody, SignInBody } from '@legacy/contracts';

import { labels } from '../labels';
import { ApiError } from './items-api';

export type { AccountDto } from '@legacy/contracts';

// The session never passes through this module. The API replies to a sign-in
// with an httpOnly cookie, which the browser stores and resends on its own;
// nothing here reads or keeps a token, because anything JavaScript can read,
// a script injected into the page can read too.
export interface AuthApi {
    register: (body: RegisterAccountBody) => Promise<void>;
    signIn: (body: SignInBody) => Promise<AccountDto>;
    // Resolves to null when there is no valid session, rather than throwing:
    // arriving without one is the ordinary case on first visit, not a failure.
    currentAccount: (signal: AbortSignal) => Promise<AccountDto | null>;
}

const jsonHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
};

async function problemDetail(response: Response, fallback: string): Promise<string> {
    try {
        const body: unknown = await response.json();
        const problem = ProblemDetails.safeParse(body);
        return problem.success ? problem.data.detail : fallback;
    } catch {
        return fallback;
    }
}

export const authApi: AuthApi = {
    async register(body) {
        const response = await fetch('/auth/register', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new ApiError(
                response.status,
                await problemDetail(response, labels.registerFailed),
            );
        }
    },

    async signIn(body) {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // One message whatever the server said, because the server itself
            // refuses to say which of the two was wrong. Repeating a more
            // precise reason here would undo that on the only screen where it
            // is visible.
            throw new ApiError(response.status, labels.signInRejected);
        }

        try {
            return AccountDto.parse(await response.json());
        } catch {
            throw new ApiError(502, labels.unreadableResponse);
        }
    },

    async currentAccount(signal) {
        const response = await fetch('/auth/me', { headers: { Accept: 'application/json' }, signal });

        if (response.status === 401) return null;
        if (!response.ok) {
            throw new ApiError(response.status, labels.sessionCheckFailed);
        }

        try {
            return AccountDto.parse(await response.json());
        } catch {
            throw new ApiError(502, labels.unreadableResponse);
        }
    },
};
