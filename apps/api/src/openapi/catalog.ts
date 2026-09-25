import { z } from 'zod';
import {
    AccountDto,
    AttentionDto,
    AttentionQuery,
    ChangeEmailBody,
    ChangePasswordBody,
    ConfirmEmailChangeBody,
    CreateItemBody,
    CreateProjectBody,
    DeleteAccountBody,
    InvitationIdParams,
    InvitationOutcomeDto,
    InviteMemberBody,
    ItemDto,
    ItemPageDto,
    ListItemsQuery,
    ListNotificationsQuery,
    ListProjectsQuery,
    MoveItemBody,
    NotificationIdParams,
    NotificationPageDto,
    NotificationSummaryDto,
    PendingInvitationListDto,
    PersonalDataExportDto,
    ProjectDto,
    ProjectIdParams,
    ProjectItemIdParams,
    ProjectMemberIdParams,
    ProjectMemberListDto,
    ProjectPageDto,
    RegisterAccountBody,
    ReorderItemBody,
    RequestPasswordResetBody,
    ResetPasswordBody,
    SignInBody,
    UpdateItemBody,
} from '@legacy/contracts';

// Every route the API serves, described by the validation schemas it really
// applies (#45). Nothing here restates a shape: a body, a query or a response
// is the zod schema the handler parses or the DTO it sends, so the document
// cannot drift from the code without the schema itself changing. The test next
// to this file compares the list with the routes the application mounts.

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type Access = 'public' | 'session' | 'relay';

export interface Operation {
    method: Method;
    path: string;
    tag: string;
    summary: string;
    access: Access;
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodType;
    success: { status: number; description: string; schema?: z.ZodType; contentType?: string };
    // Refusals this route produces on its own, beyond those every route of its
    // access level can answer (see the builder).
    errors?: readonly number[];
}

const noContent = (description: string) => ({ status: 204, description });
const json = (schema: z.ZodType, description = 'Success', status = 200) => ({ status, description, schema });

const AUTH: readonly Operation[] = [
    { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Create an account', access: 'public', body: RegisterAccountBody, success: { status: 201, description: 'Account created; a confirmation e-mail is sent. Also answered for an address already registered, so the form reveals nothing.' }, errors: [429] },
    { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in and receive the session cookies', access: 'public', body: SignInBody, success: json(AccountDto, 'Signed in; Set-Cookie carries the session'), errors: [401, 429] },
    { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'The signed-in account', access: 'session', success: json(AccountDto) },
    { method: 'post', path: '/auth/password/forgot', tag: 'Auth', summary: 'Ask for a password reset link', access: 'public', body: RequestPasswordResetBody, success: { status: 202, description: 'Accepted, whether or not the address has an account' }, errors: [429] },
    { method: 'post', path: '/auth/password/reset', tag: 'Auth', summary: 'Set a new password from a reset link', access: 'public', body: ResetPasswordBody, success: noContent('Password changed; every session of the account is ended'), errors: [429] },
    { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Sign out and clear the session cookies', access: 'public', success: noContent('Signed out') },
    { method: 'put', path: '/auth/me/password', tag: 'Account', summary: 'Change the password', access: 'session', body: ChangePasswordBody, success: noContent('Password changed'), errors: [403, 429] },
    { method: 'put', path: '/auth/me/email', tag: 'Account', summary: 'Start an e-mail address change', access: 'session', body: ChangeEmailBody, success: { status: 202, description: 'A confirmation link is sent to the new address' }, errors: [429] },
    { method: 'post', path: '/auth/me/email/confirm', tag: 'Account', summary: 'Confirm an e-mail address change', access: 'public', body: ConfirmEmailChangeBody, success: noContent('Address changed'), errors: [429] },
    { method: 'get', path: '/auth/me/export', tag: 'Account', summary: 'Export every personal data of the account', access: 'session', success: json(PersonalDataExportDto, 'The export, as a JSON document to download'), errors: [404] },
    { method: 'delete', path: '/auth/me', tag: 'Account', summary: 'Delete the account and its personal data', access: 'session', body: DeleteAccountBody, success: noContent('Account deleted'), errors: [404, 422] },
];

const PROJECTS: readonly Operation[] = [
    { method: 'get', path: '/projects', tag: 'Projects', summary: 'The projects of the caller, a page at a time', access: 'session', query: ListProjectsQuery, success: json(ProjectPageDto) },
    { method: 'post', path: '/projects', tag: 'Projects', summary: 'Create a project owned by the caller', access: 'session', body: CreateProjectBody, success: json(ProjectDto) },
    { method: 'delete', path: '/projects/:projectId', tag: 'Projects', summary: 'Delete a project the caller owns', access: 'session', params: ProjectIdParams, success: { status: 200, description: 'Deleted' }, errors: [404] },
    { method: 'get', path: '/projects/:projectId/members', tag: 'Projects', summary: 'Who is in a project, and with which role', access: 'session', params: ProjectIdParams, success: json(ProjectMemberListDto), errors: [404] },
    { method: 'delete', path: '/projects/:projectId/members/:userId', tag: 'Projects', summary: 'Remove a member; their tasks stay in the project', access: 'session', params: ProjectMemberIdParams, success: noContent('Removed'), errors: [403, 404, 409] },
    { method: 'get', path: '/projects/attention', tag: 'Projects', summary: 'What needs attention across the caller\'s projects', access: 'session', query: AttentionQuery, success: json(AttentionDto) },
    { method: 'post', path: '/projects/:projectId/invitations', tag: 'Projects', summary: 'Invite a person into a project by their address; the owner only', access: 'session', params: ProjectIdParams, body: InviteMemberBody, success: json(InvitationOutcomeDto, 'Invited (201), or already a member or already invited (200): nothing is created twice', 201), errors: [403, 404, 429] },
    { method: 'get', path: '/projects/invitations', tag: 'Projects', summary: 'The invitations waiting for the caller\'s answer', access: 'session', success: json(PendingInvitationListDto) },
    { method: 'post', path: '/projects/invitations/:invitationId/accept', tag: 'Projects', summary: 'Accept an invitation; the caller joins the project as a member', access: 'session', params: InvitationIdParams, success: noContent('Accepted'), errors: [404, 409] },
    { method: 'post', path: '/projects/invitations/:invitationId/decline', tag: 'Projects', summary: 'Decline an invitation', access: 'session', params: InvitationIdParams, success: noContent('Declined'), errors: [404, 409] },
];

const ITEMS: readonly Operation[] = [
    { method: 'get', path: '/projects/:projectId/items', tag: 'Tasks', summary: 'The tasks of a project, searched, filtered and paged', access: 'session', params: ProjectIdParams, query: ListItemsQuery, success: json(ItemPageDto), errors: [404] },
    { method: 'post', path: '/projects/:projectId/items', tag: 'Tasks', summary: 'Create a task; publishes item.created.v1', access: 'session', params: ProjectIdParams, body: CreateItemBody, success: json(ItemDto), errors: [404] },
    { method: 'put', path: '/projects/:projectId/items/:id', tag: 'Tasks', summary: 'Change the name, priority, due date or assignees of a task', access: 'session', params: ProjectItemIdParams, body: UpdateItemBody, success: json(ItemDto), errors: [404] },
    { method: 'patch', path: '/projects/:projectId/items/:id/status', tag: 'Tasks', summary: 'Move a task to another Kanban column', access: 'session', params: ProjectItemIdParams, body: MoveItemBody, success: json(ItemDto), errors: [404, 409] },
    { method: 'patch', path: '/projects/:projectId/items/:id/position', tag: 'Tasks', summary: 'Swap a task with its neighbour in its column', access: 'session', params: ProjectItemIdParams, body: ReorderItemBody, success: json(ItemDto), errors: [404, 409] },
    { method: 'delete', path: '/projects/:projectId/items/:id', tag: 'Tasks', summary: 'Delete a task', access: 'session', params: ProjectItemIdParams, success: noContent('Deleted'), errors: [404] },
];

const NOTIFICATIONS: readonly Operation[] = [
    { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'The caller\'s notifications, newest first', access: 'session', query: ListNotificationsQuery, success: json(NotificationPageDto) },
    { method: 'get', path: '/notifications/unread-count', tag: 'Notifications', summary: 'How many notifications are unread', access: 'session', success: json(NotificationSummaryDto) },
    { method: 'patch', path: '/notifications/:id/read', tag: 'Notifications', summary: 'Mark a notification as read', access: 'session', params: NotificationIdParams, success: noContent('Marked as read'), errors: [404] },
];

const OPERATIONS_ROUTES: readonly Operation[] = [
    { method: 'post', path: '/internal/relay', tag: 'Operations', summary: 'Run one delivery pass of the event outbox', access: 'relay', success: { status: 200, description: 'What the pass published, consumed and failed' } },
    { method: 'post', path: '/internal/purge', tag: 'Operations', summary: 'Run one pass of the retention purge', access: 'relay', success: { status: 200, description: 'Rows deleted per treatment; no personal data' } },
    { method: 'get', path: '/internal/state', tag: 'Operations', summary: 'The current gauges as one JSON row, for a live dashboard', access: 'relay', success: { status: 200, description: 'Gauge name to value; no personal data' } },
    { method: 'get', path: '/internal/metrics', tag: 'Operations', summary: 'Metrics in the Prometheus text format', access: 'relay', success: { status: 200, description: 'Prometheus exposition format', contentType: 'text/plain' } },
];

export const OPERATIONS: readonly Operation[] = [...AUTH, ...PROJECTS, ...ITEMS, ...NOTIFICATIONS, ...OPERATIONS_ROUTES];
