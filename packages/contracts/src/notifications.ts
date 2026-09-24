import { z } from 'zod';

// The shapes accepted and served at the HTTP boundary for US-18. Notifications
// carry no message text (see the outbox migration): what crosses here is
// identifiers and dates, and the interface supplies the wording.

export const NotificationIdParams = z.object({
    id: z.uuid(),
});

// Named after the event that produces it, without its version (see the
// notifications migration of 15 September).
export const NotificationKind = z.enum(['item.created', 'membership.created', 'invitation.created']);

export const InvitationStatus = z.enum(['pending', 'accepted', 'declined']);

export const NotificationDto = z.object({
    id: z.uuid(),
    // What the row is about. The interface words each kind, and until #401 it
    // could not tell them apart: every notification read as a created task.
    kind: NotificationKind,
    // Nullable since notifications may name a project instead of a task. What
    // a row names is decided by its kind, and the check constraint in the
    // database refuses a row naming neither.
    itemId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    // Read at display time from the project, never stored in the row: a
    // renamed project is shown under its current name.
    projectName: z.string().nullable(),
    // For an invitation: which one, and whether it still waits for an answer,
    // so the screen offers Accept and Decline only while they mean something.
    invitationId: z.uuid().nullable(),
    invitationStatus: InvitationStatus.nullable(),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
});

export const NotificationListDto = z.array(NotificationDto);

// Same bounds and the same opaque-cursor posture as items' own pagination:
// only the adapter that minted a cursor knows how to read it.
export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 100;

const CURSOR_MAX_LENGTH = 256;

const pageSize = z.coerce.number().int().min(1).max(MAX_NOTIFICATION_PAGE_SIZE);

export const ListNotificationsQuery = z.object({
    limit: pageSize.default(DEFAULT_NOTIFICATION_PAGE_SIZE),
    cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});

export const NotificationPageDto = z.object({
    notifications: NotificationListDto,
    nextCursor: z.string().nullable(),
});

export type NotificationIdParams = z.infer<typeof NotificationIdParams>;
export type NotificationKind = z.infer<typeof NotificationKind>;
export type InvitationStatus = z.infer<typeof InvitationStatus>;
export type NotificationDto = z.infer<typeof NotificationDto>;
export type NotificationListDto = z.infer<typeof NotificationListDto>;
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;
export type NotificationPageDto = z.infer<typeof NotificationPageDto>;

// Ce que l interface lit pour montrer l effet du flux evenementiel de US-10 en
// dehors de la liste elle meme -- le bandeau de session (US-18). Un compte,
// pas la liste : l ecran affiche un rappel, la liste vit derriere son propre
// ecran.
export const NotificationSummaryDto = z.object({
    unread: z.number().int().nonnegative(),
});

export type NotificationSummaryDto = z.infer<typeof NotificationSummaryDto>;
