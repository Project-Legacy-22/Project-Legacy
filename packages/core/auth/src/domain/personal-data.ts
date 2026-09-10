// Everything the application holds about one account, as the domain sees it.
// Like every domain file this one imports nothing: what an export contains is a
// rule about personal data, and it has to be statable without a database, a
// framework or a serialisation format.
//
// The shape lists the tables that carry an account today. It is the same list
// the erasure works through, and keeping the two in one place is deliberate: a
// table added to one and forgotten in the other is exactly the failure this
// story exists to prevent, an export that omits data the application still
// holds, or an erasure that leaves some behind.

export interface ExportedAccount {
    id: string;
    email: string;
    createdAt: string;
}

export interface ExportedItem {
    id: string;
    projectId: string;
    name: string | null;
    completed: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ExportedProject {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface ExportedProjectMembership {
    projectId: string;
    role: 'owner' | 'member';
    createdAt: string;
}

export interface ExportedNotification {
    id: string;
    itemId: string;
    eventId: string;
    readAt: string | null;
    createdAt: string;
}

export interface PersonalData {
    account: ExportedAccount;
    projects: ExportedProject[];
    projectMemberships: ExportedProjectMembership[];
    items: ExportedItem[];
    notifications: ExportedNotification[];
}

// A copy of the above, plus the moment it was taken. The two are separate types
// because they are separate facts: what is stored is a property of the account,
// when a copy was made is a property of the request that asked for one.
export interface PersonalDataExport extends PersonalData {
    exportedAt: string;
}
