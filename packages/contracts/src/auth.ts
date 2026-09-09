import { z } from 'zod';

// The shapes accepted at the authentication boundary, and the password policy
// the interface has to state before anything is typed (US-11).
//
// The policy lives with the contracts rather than in the auth domain because
// both sides need it: the API enforces it, apps/web announces it, and
// packages/contracts is the only package they are both allowed to import.
export const PASSWORD_POLICY = {
    minimumLength: 12,
    // GoTrue hashes with bcrypt, which ignores everything past 72 bytes.
    // Refusing a longer password is honest; accepting it would silently
    // truncate and let a shorter prefix unlock the account.
    maximumLengthInBytes: 72,
    requiresLowerCase: true,
    requiresUpperCase: true,
    requiresDigit: true,
} as const;

// One canonical form for an address, so that Foo@Example.com and
// foo@example.com cannot become two accounts.
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const RegisterAccountBody = z.object({
    email: emailSchema,
    password: z.string().min(PASSWORD_POLICY.minimumLength),
});

// Signing in only requires a non-empty password. An account created under an
// earlier policy must still be able to log in, and the strength of a password
// that already exists is not the boundary's business.
export const SignInBody = z.object({
    email: emailSchema,
    password: z.string().min(1),
});

// Erasure is immediate and has no grace period (Sprint Planning 2 decision), so
// the request itself has to carry the confirmation: the caller retypes the
// address the session belongs to. A mis-click, a replayed request or a stray
// DELETE cannot produce that value, and there is no later window in which to
// take the deletion back.
export const DeleteAccountBody = z.object({
    confirmation: emailSchema,
});

// Asking for a reset link only needs an address. The reply is the same whether
// or not it is registered (US-28), so nothing here may reject a well-formed
// address that simply has no account.
export const RequestPasswordResetBody = z.object({
    email: emailSchema,
});

// Completing a reset carries the token from the email and the new password. The
// token is opaque: its shape is the identity provider's business, so the
// boundary only checks that something was sent. The password is held to the
// full policy, unlike sign-in: this password does not exist yet.
export const ResetPasswordBody = z.object({
    token: z.string().min(1),
    password: z.string().min(PASSWORD_POLICY.minimumLength),
});

// What a caller may learn about itself. There is no endpoint that returns
// anybody else's account.
export const AccountDto = z.object({
    id: z.uuid(),
    email: z.string(),
});

export type RegisterAccountBody = z.infer<typeof RegisterAccountBody>;
export type SignInBody = z.infer<typeof SignInBody>;
export type DeleteAccountBody = z.infer<typeof DeleteAccountBody>;
export type RequestPasswordResetBody = z.infer<typeof RequestPasswordResetBody>;
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;
export type AccountDto = z.infer<typeof AccountDto>;
