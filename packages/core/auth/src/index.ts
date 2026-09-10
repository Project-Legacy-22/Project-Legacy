export {
    AccountNotFound,
    AuthError,
    CompromisedPassword,
    ErasureNotConfirmed,
    InvalidCredentials,
    InvalidEmailAddress,
    InvalidResetToken,
    SessionExpired,
    SessionRequired,
    WeakPassword,
} from './domain/account.js';
export type { Account } from './domain/account.js';

export type {
    ExportedAccount,
    ExportedItem,
    ExportedNotification,
    PersonalData,
    PersonalDataExport,
} from './domain/personal-data.js';

export { emailAddress, normalizeEmailAddress } from './domain/email-address.js';
export { checkedPassword, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from './domain/password-policy.js';

export type {
    IdentityProvider,
    PasswordResetOutcome,
    RegistrationOutcome,
    Session,
} from './ports/identity-provider.js';
export type { CompromisedPasswordRegistry } from './ports/compromised-password-registry.js';
export type { PersonalDataStore } from './ports/personal-data-store.js';

export { makeRegisterAccount } from './application/register-account.js';
export { makeSignIn } from './application/sign-in.js';
export { makeIdentifyCaller } from './application/identify-caller.js';
export { makeRenewSession } from './application/renew-session.js';
export { makeExportPersonalData } from './application/export-personal-data.js';
export type { ExportPersonalDataDependencies } from './application/export-personal-data.js';
export { makeEraseAccount } from './application/erase-account.js';
export type { EraseAccountDependencies } from './application/erase-account.js';
export { makeRequestPasswordReset } from './application/request-password-reset.js';
export { makeResetPassword } from './application/reset-password.js';
export { makeSignOut } from './application/sign-out.js';
