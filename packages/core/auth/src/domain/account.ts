// The authentication domain. Like every domain file it imports nothing: these
// rules have to be testable without a provider, a framework or a database, and
// they must survive replacing Supabase Auth with something else (ADR-0008).

// Who the caller is, once a token has been vouched for. Credentials belong to
// the identity provider; this is the only part of a user the rest of the
// application ever sees, and the only part that may reach a response.
export interface Account {
    id: string;
    email: string;
}

export class AuthError extends Error {
    constructor(
        readonly code: string,
        readonly httpStatus: number,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

// One failure for both halves of a sign-in. Saying which of the two was wrong
// would tell anyone which addresses have an account here.
export class InvalidCredentials extends AuthError {
    constructor() {
        super('invalid_credentials', 401, 'Email address or password is incorrect.');
    }
}

export class InvalidEmailAddress extends AuthError {
    constructor(reason: string) {
        super('invalid_email_address', 400, `Email address ${reason}`);
    }
}

// The reason names the rule that was broken, never the password that broke it.
export class WeakPassword extends AuthError {
    constructor(reason: string) {
        super('weak_password', 400, `Password ${reason}`);
    }
}

export class SessionRequired extends AuthError {
    constructor() {
        super('session_required', 401, 'This request requires a valid session.');
    }
}
