import { ApiError } from './items-api';

// Once somebody is signed in, a 401 from one of the clients behind the session
// means one thing: the session ended between two requests. The API renews on
// its own everything that can be renewed (US-27), so a refusal that reaches the
// browser is final, and the interface has to stop asking.
//
// Wrapping the client rather than teaching each hook about 401 keeps that rule
// in one place and covers the endpoints a later story adds. The authentication
// client is deliberately left unwrapped: arriving without a session is the
// ordinary first visit, not an expiry.

type Call = (...args: never[]) => unknown;

function guard(call: Call, onExpired: () => void): Call {
    return (...args) => {
        const outcome: unknown = call(...args);

        // Only a request can come back 401, so anything else is handed back
        // untouched rather than assumed to be one.
        if (!(outcome instanceof Promise)) return outcome;

        return outcome.catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 401) onExpired();

            // Rethrown, not swallowed: the hook that made the call still owes
            // its own screen an answer, and the session ending is not the only
            // thing it may have to report.
            throw error;
        });
    };
}

export function guardSession<T extends object>(api: T, onExpired: () => void): T {
    // Object.entries types the values of a generic object as `any`. Reading
    // them as unknown is what makes the check below a real one.
    const membres = Object.entries(api) as [string, unknown][];

    const guarded = membres.map(([name, member]): [string, unknown] => [
        name,
        // The assertion is on the call signature only: every member of an API
        // client is a method, and its arguments are passed straight through.
        typeof member === 'function' ? guard(member as Call, onExpired) : member,
    ]);

    // fromEntries widens to Record<string, unknown>. The entries are the ones
    // just read off `api`, each function replaced by one of the same signature,
    // so the shape is unchanged and only the compiler cannot see it.
    return Object.fromEntries(guarded) as T;
}
