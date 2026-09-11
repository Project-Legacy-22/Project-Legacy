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

// A password that is strong in shape but known to have leaked. US-28 requires
// the check; the message names the rule, never the password.
export class CompromisedPassword extends AuthError {
    constructor() {
        super(
            'compromised_password',
            400,
            'Password has appeared in a known data breach. Choose a different one.',
        );
    }
}

// One message for an unknown token, a consumed one and an expired one.
// Telling them apart would say whether a link ever existed for an address.
export class InvalidResetToken extends AuthError {
    constructor() {
        super(
            'invalid_reset_token',
            400,
            'This password reset link is invalid or has expired. Request a new one.',
        );
    }
}

// The current password given to a signed-in password change does not match.
// The caller already holds a valid session, so naming the rule discloses
// nothing an attacker with that session could not already learn; a vague
// message would only puzzle a legitimate user who mistyped.
export class IncorrectCurrentPassword extends AuthError {
    constructor() {
        super('incorrect_current_password', 403, 'The current password is incorrect.');
    }
}

// One message for an unknown, spent or expired email-change confirmation link,
// like InvalidResetToken: telling the three apart would say whether a change
// was ever started for an address.
export class InvalidEmailChangeToken extends AuthError {
    constructor() {
        super(
            'invalid_email_change_token',
            400,
            'This confirmation link is invalid or has expired. Start the change again.',
        );
    }
}

export class SessionRequired extends AuthError {
    constructor() {
        super('session_required', 401, 'This request requires a valid session.');
    }
}

// A session that existed and will not be renewed: its refresh token was
// consumed, revoked or is past its lifetime. Told apart from SessionRequired
// because the two owe the caller different sentences -- one asks a visitor to
// sign in, the other tells someone who was signed in why they no longer are
// (US-27). Neither ever names the token that was presented.
export class SessionExpired extends AuthError {
    constructor() {
        super('session_expired', 401, 'Your session has expired. Sign in again.');
    }
}

// A session vouched for an account the application no longer holds. It means
// the two stores have drifted, not that the caller did anything wrong, so it is
// reported as an absent resource and never as a rejected credential.
export class AccountNotFound extends AuthError {
    constructor() {
        super('account_not_found', 404, 'This account no longer exists.');
    }
}

// The address retyped to confirm an erasure is not the one the session belongs
// to. The message names the rule and not the value that was submitted: an error
// body must not echo back what a person typed.
export class ErasureNotConfirmed extends AuthError {
    constructor() {
        super(
            'erasure_not_confirmed',
            422,
            'Deleting the account requires confirming its email address.',
        );
    }
}
