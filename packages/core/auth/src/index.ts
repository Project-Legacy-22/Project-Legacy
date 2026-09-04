export {
    AuthError,
    InvalidCredentials,
    InvalidEmailAddress,
    SessionRequired,
    WeakPassword,
} from './domain/account.js';
export type { Account } from './domain/account.js';

export { emailAddress, normalizeEmailAddress } from './domain/email-address.js';
export { checkedPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './domain/password-policy.js';

export type { IdentityProvider, RegistrationOutcome, Session } from './ports/identity-provider.js';

export { makeRegisterAccount } from './application/register-account.js';
export { makeSignIn } from './application/sign-in.js';
export { makeIdentifyCaller } from './application/identify-caller.js';
