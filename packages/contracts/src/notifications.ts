import { z } from 'zod';

// The shapes accepted and served at the HTTP boundary for US-18. Notifications
// carry no message text (see the outbox migration): what crosses here is
// identifiers and dates, and the interface supplies the wording.

export const NotificationIdParams = z.object({
    id: z.uuid(),
});

export const NotificationDto = z.object({
    id: z.uuid(),
    itemId: z.uuid(),
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
