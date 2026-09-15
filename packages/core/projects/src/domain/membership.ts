import type { ProjectRole } from './project.js';

// Who is in a project, and at what title.
//
// The address is part of it, and that is a deliberate disclosure rather than an
// oversight: the users table holds no display name, so naming a member to the
// others means naming their address. #352 declares it in the privacy policy
// and in the register.
//
// What this must never become is a way to learn who has an account. A
// membership is read per project, by someone already in it; nothing here, and
// nothing anywhere else, lists or searches accounts.
export interface Membership {
    userId: string;
    email: string;
    role: ProjectRole;
}
