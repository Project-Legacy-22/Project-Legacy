import { z } from 'zod';

import { ProjectRole } from './projects.js';
import { ItemDueDate, ItemPriority, ItemStatus } from './items.js';

// The copy of an account handed back by the portability endpoint (US-13).
//
// This is a response shape rather than an input one, and it is declared here
// all the same: it is the document a person receives and keeps, so it is a
// contract like any other. A schema is also the only description of it that
// cannot drift from what is served, since the route parses through it.
//
// Dates are ISO 8601 instants, the same form the rest of the API uses. The
// export is meant to be readable by the person who asked for it and reusable by
// another application, which rules out database-shaped column names.

const ExportedAccount = z.object({
    id: z.uuid(),
    email: z.string(),
    createdAt: z.iso.datetime(),
});

const ExportedItem = z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    name: z.string().nullable(),
    status: ItemStatus,
    version: z.number().int().positive(),
    priority: ItemPriority,
    dueDate: ItemDueDate.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

const ExportedProject = z.object({
    id: z.uuid(),
    name: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

// Only the caller's membership rows are exported. Including the identifiers of
// other members would disclose somebody else's personal data in this copy.
const ExportedProjectMembership = z.object({
    projectId: z.uuid(),
    role: ProjectRole,
    createdAt: z.iso.datetime(),
});

// Notifications carry no message text: the wording belongs to the interface
// (see the outbox migration). What is exported is therefore what the row
// actually holds, identifiers and dates, not a rendered sentence.
const ExportedNotification = z.object({
    id: z.uuid(),
    itemId: z.uuid(),
    eventId: z.uuid(),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
});

export const PersonalDataExportDto = z.object({
    // Names the moment the copy was taken. Two exports of the same account are
    // otherwise indistinguishable, and a person comparing them cannot tell
    // which is the recent one.
    exportedAt: z.iso.datetime(),
    account: ExportedAccount,
    projects: z.array(ExportedProject),
    projectMemberships: z.array(ExportedProjectMembership),
    items: z.array(ExportedItem),
    notifications: z.array(ExportedNotification),
});

export type PersonalDataExportDto = z.infer<typeof PersonalDataExportDto>;
