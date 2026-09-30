import { v7 as uuid } from 'uuid';
import {
    createHibpPasswordRegistry,
    createSupabaseAttentionReader,
    createLogger,
    createRedisEventBus,
    createSupabaseIdentityProvider,
    createSupabaseItemStore,
    createSupabaseMembershipRepository,
    createSupabaseInvitationRepository,
    createSupabaseNotificationStore,
    createSupabaseOutboxStore,
    createSupabasePersonalDataStore,
    createSupabaseProjectRepository,
    createSupabaseRetentionStore,
    createBuildStateReading,
    createBusStateReadings,
    createPrometheusMetrics,
    createSupabaseStateReadings,
    createHealthProbes,
    startRelay,
    deliverPending,
    purgeExpired,
} from '@legacy/infra';
import type {
    DeliveryPassResult,
    EventBus,
    ItemStore,
    NotificationStore,
    OutboxStore,
} from '@legacy/infra';
import type { Logger, Metrics, PurgeResult, StateReading } from '@legacy/contracts';
import type { HealthProbes } from './http/health.js';
import {
    makeChangeEmail,
    makeChangePassword,
    makeConfirmEmailChange,
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRenewSession,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
    makeSignOut,
} from '@legacy/core-auth';
import {
    makeListItems,
    makeAddItem,
    makeChangeItem,
    makeMoveItem,
    makeReorderItem,
    makeRemoveItem,
    makeListAttention,
} from '@legacy/core-items';
import type { ItemRepository } from '@legacy/core-items';
import {
    makeCountUnreadNotifications,
    makeListNotifications,
    makeMarkNotificationRead,
} from '@legacy/core-notifications';
import {
    makeAddProject,
    makeListProjectMembers,
    makeListProjects,
    makeRemoveProject,
    makeRenameProject,
    makeRemoveProjectMember,
    makeInviteProjectMember,
    makeListInvitations,
    makeRespondToInvitation,
} from '@legacy/core-projects';

import { afterWrite } from './after-write.js';
import { correlateInvitationEvents, correlateItemEvents } from './event-correlation.js';
import type { Config } from './config.js';

export interface ItemUseCases {
    listItems: ReturnType<typeof makeListItems>;
    addItem: ReturnType<typeof makeAddItem>;
    changeItem: ReturnType<typeof makeChangeItem>;
    moveItem: ReturnType<typeof makeMoveItem>;
    reorderItem: ReturnType<typeof makeReorderItem>;
    removeItem: ReturnType<typeof makeRemoveItem>;
}

export interface AuthUseCases {
    registerAccount: ReturnType<typeof makeRegisterAccount>;
    signIn: ReturnType<typeof makeSignIn>;
    identifyCaller: ReturnType<typeof makeIdentifyCaller>;
    renewSession: ReturnType<typeof makeRenewSession>;
    requestPasswordReset: ReturnType<typeof makeRequestPasswordReset>;
    resetPassword: ReturnType<typeof makeResetPassword>;
    signOut: ReturnType<typeof makeSignOut>;
    changePassword: ReturnType<typeof makeChangePassword>;
    changeEmail: ReturnType<typeof makeChangeEmail>;
    confirmEmailChange: ReturnType<typeof makeConfirmEmailChange>;
}

// Kept apart from AuthUseCases, which requireAccount receives on every request
// that needs a session. Erasing an account has no business being reachable from
// there.
export interface AccountUseCases {
    exportPersonalData: ReturnType<typeof makeExportPersonalData>;
    eraseAccount: ReturnType<typeof makeEraseAccount>;
}

export interface ProjectUseCases {
    listProjects: ReturnType<typeof makeListProjects>;
    addProject: ReturnType<typeof makeAddProject>;
    removeProject: ReturnType<typeof makeRemoveProject>;
    renameProject: ReturnType<typeof makeRenameProject>;
    listProjectMembers: ReturnType<typeof makeListProjectMembers>;
    removeProjectMember: ReturnType<typeof makeRemoveProjectMember>;
    inviteProjectMember: ReturnType<typeof makeInviteProjectMember>;
    listInvitations: ReturnType<typeof makeListInvitations>;
    respondToInvitation: ReturnType<typeof makeRespondToInvitation>;
}

export interface NotificationUseCases {
    listNotifications: ReturnType<typeof makeListNotifications>;
    markNotificationRead: ReturnType<typeof makeMarkNotificationRead>;
    countUnread: ReturnType<typeof makeCountUnreadNotifications>;
    // A delivery pass, requested instead of scheduled. On a target without a long-running process,
    // nobody runs the relay: the route that reads the notifications and the scheduled workflow call
    // it.
    deliverPending: () => Promise<DeliveryPassResult>;
    // The retention purge (US-39), triggered like the pass above.
    purgeExpired: () => Promise<PurgeResult>;
}

// Its own group: it reads items across projects through its own port, and
// none of the item use cases above shares that adapter.
export interface AttentionUseCases {
    listAttention: ReturnType<typeof makeListAttention>;
}

export interface AppUseCases {
    items: ItemUseCases;
    attention: AttentionUseCases;
    auth: AuthUseCases;
    account: AccountUseCases;
    projects: ProjectUseCases;
    notifications: NotificationUseCases;
}

export interface Application {
    useCases: AppUseCases;
    logger: Logger;
    // Built here because this layer is the only one that reaches an adapter.
    metrics: Metrics;
    health: HealthProbes;
    start(): Promise<void>;
    stop(): Promise<void>;
}

interface Adapters {
    store: ItemStore;
    attention: ReturnType<typeof createSupabaseAttentionReader>;
    identity: ReturnType<typeof createSupabaseIdentityProvider>;
    personalData: ReturnType<typeof createSupabasePersonalDataStore>;
    projects: ReturnType<typeof createSupabaseProjectRepository>;
    // Memberships have their own port: project_memberships has no policy for reading the other
    // members, so the use case decides who may read the list.
    memberships: ReturnType<typeof createSupabaseMembershipRepository>;
    invitations: ReturnType<typeof createSupabaseInvitationRepository>;
    outbox: OutboxStore;
    notifications: NotificationStore;
    retention: ReturnType<typeof createSupabaseRetentionStore>;
    // Absent when no broker is configured. Serving HTTP does not need one; the
    // relay does, and start() is where that is enforced.
    bus: EventBus | undefined;
    // What the metrics endpoint reads when it is asked, rather than what the
    // process counted. Built here because a reading reaches an adapter, and
    // this is the only place allowed to.
    stateReadings: readonly StateReading[];
}

// Every adapter the application talks to, built in one place. Extracted from
// compose so that reading it answers "what does this application depend on"
// without wading through how the use cases are assembled.
function createAdapters(config: Config): Adapters {
    const supabase = { url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey };
    // Hoisted out of the object below because the readings need it too. A
    // second createRedisEventBus would open a second connection to the same
    // queue, and the depth one of them reports would not be the depth the
    // relay sees.
    const bus =
        config.redisUrl === undefined ? undefined : createRedisEventBus({ url: config.redisUrl });

    return {
        store: createSupabaseItemStore(supabase),
        attention: createSupabaseAttentionReader(supabase),
        // A second client, with the public key: sign-up and sign-in are the
        // endpoints that apply the project's password policy, and the
        // service-role key would bypass it.
        identity: createSupabaseIdentityProvider({
            url: config.supabaseUrl,
            anonKey: config.supabaseAnonKey,
            serviceRoleKey: config.supabaseServiceRoleKey,
        }),
        // A third adapter on the same database as the item store, behind its
        // own port: it reads and clears the tables of every domain at once
        // (US-13), which no single domain's repository is allowed to know about.
        personalData: createSupabasePersonalDataStore(supabase),
        projects: createSupabaseProjectRepository(supabase),
        memberships: createSupabaseMembershipRepository(supabase),
        invitations: createSupabaseInvitationRepository(supabase),
        outbox: createSupabaseOutboxStore(supabase),
        notifications: createSupabaseNotificationStore(supabase),
        retention: createSupabaseRetentionStore(supabase),
        bus,
        stateReadings: [
            // First because it depends on nothing: it answers even when the database and the broker
            // are silent, which makes it the only one that can tell which deployment went silent.
            createBuildStateReading(config.deployment),
            ...createSupabaseStateReadings(supabase),
            ...(bus === undefined ? [] : createBusStateReadings(bus)),
        ],
    };
}

// Assembled apart from compose, which stays a list of what is wired to what:
// this is the group that gains a use case with every authentication story, and
// it is the only one whose members all share a single adapter.
function authUseCases(
    identity: Adapters['identity'],
    compromisedPasswords: ReturnType<typeof createHibpPasswordRegistry>,
): AuthUseCases {
    return {
        registerAccount: makeRegisterAccount(identity),
        signIn: makeSignIn(identity),
        identifyCaller: makeIdentifyCaller(identity),
        renewSession: makeRenewSession(identity),
        requestPasswordReset: makeRequestPasswordReset(identity),
        resetPassword: makeResetPassword({ provider: identity, compromisedPasswords }),
        signOut: makeSignOut(identity),
        changePassword: makeChangePassword({ provider: identity, compromisedPasswords }),
        changeEmail: makeChangeEmail(identity),
        confirmEmailChange: makeConfirmEmailChange(identity),
    };
}

// Nothing to deliver when no broker is configured: serving HTTP does not need one, and the pass
// must then do nothing rather than fail.
function makeDeliverPending(dependencies: {
    outbox: OutboxStore;
    bus: EventBus | undefined;
    notifications: NotificationStore;
    logger: Logger;
}): () => Promise<DeliveryPassResult> {
    const { bus } = dependencies;

    if (bus === undefined) return () => Promise.resolve({ published: 0, consumed: 0, failed: 0 });

    return () => deliverPending({ ...dependencies, bus });
}

// Creating a task and inviting are the event producers: the delivery trigger lives as close as
// possible to the written fact. See after-write.ts.
export function itemUseCases(
    // A repository, not a store: these use cases open and close nothing.
    store: ItemRepository,
    deliver: () => Promise<unknown>,
    logger: Logger,
): ItemUseCases {
    const correlatedStore = correlateItemEvents(store, logger);
    return {
        listItems: makeListItems(correlatedStore),
        addItem: afterWrite(
            makeAddItem({ repository: correlatedStore, newId: uuid, now: () => new Date() }),
            deliver,
            logger,
        ),
        changeItem: makeChangeItem(correlatedStore),
        moveItem: makeMoveItem(correlatedStore),
        reorderItem: makeReorderItem(correlatedStore),
        removeItem: makeRemoveItem(correlatedStore),
    };
}

// Projects, their members and invitations, assembled apart so that compose
// stays a list of groups rather than the detail of each (#401). Inviting
// delivers after its write, like adding a task: without it the invitation
// waited for the scheduled sweep (#410).
export function projectUseCases(
    { projects, memberships, invitations }: Pick<Adapters, 'projects' | 'memberships' | 'invitations'>,
    deliver: () => Promise<unknown>,
    logger: Logger,
): ProjectUseCases {
    const correlatedInvitations = correlateInvitationEvents(invitations, logger);
    return {
        listProjects: makeListProjects(projects),
        addProject: makeAddProject({ repository: projects, newId: uuid }),
        removeProject: makeRemoveProject(projects),
        renameProject: makeRenameProject(projects),
        listProjectMembers: makeListProjectMembers(memberships),
        removeProjectMember: makeRemoveProjectMember(memberships),
        inviteProjectMember: afterWrite(
            makeInviteProjectMember({ repository: correlatedInvitations, newId: uuid, now: () => new Date() }),
            deliver,
            logger,
        ),
        listInvitations: makeListInvitations(invitations),
        respondToInvitation: makeRespondToInvitation(invitations),
    };
}

export function compose(config: Config): Application {
    const adapters = createAdapters(config);
    const { store, attention, identity, personalData, outbox, notifications, retention, bus } = adapters;
    const { stateReadings } = adapters;
    const logger = createLogger(config.logLevel);
    const deliver = makeDeliverPending({ outbox, bus, notifications, logger });
    const metrics = createPrometheusMetrics({ readings: stateReadings, logger });
    const health = createHealthProbes(
        { url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey },
        bus,
    );
    const compromisedPasswords = createHibpPasswordRegistry({ logger });

    // The relay lives with the writer, not with the consumer: it reads a table
    // only this process is meant to touch. Stopping the worker therefore makes
    // the broker queue grow, which is exactly what ADR-0007 wants to be able to
    // show.
    let relay: NodeJS.Timeout | undefined;

    return {
        logger,
        metrics,
        health,
        useCases: {
            items: itemUseCases(store, deliver, logger),
            attention: { listAttention: makeListAttention(attention) },
            auth: authUseCases(identity, compromisedPasswords),
            account: {
                exportPersonalData: makeExportPersonalData({
                    store: personalData,
                    now: () => new Date(),
                }),
                eraseAccount: makeEraseAccount({ store: personalData, identity }),
            },
            projects: projectUseCases(adapters, deliver, logger),
            notifications: {
                listNotifications: makeListNotifications(notifications),
                markNotificationRead: makeMarkNotificationRead(notifications),
                countUnread: makeCountUnreadNotifications(notifications),
                deliverPending: deliver,
                purgeExpired: () => purgeExpired(retention, logger),
            },
        },
        // start() no longer creates the schema -- that is what migrations are
        // for. It checks the connection so a misconfigured deployment fails
        // loudly at boot instead of on the first request.
        start: async () => {
            // The broker is what the relay publishes through, so a process
            // that relays and has none is misconfigured, not degraded. It says
            // so here rather than filling the outbox with events nobody
            // delivers.
            if (bus === undefined) {
                throw new Error('REDIS_URL is required to relay the outbox');
            }

            // Two independent services: waiting for one before dialling the
            // other only adds their latencies together
            // (standards/02-code-style.md section 7).
            await Promise.all([store.connect(), bus.connect()]);

            // A failed pass is logged and retried on the next tick: the outbox
            // still holds what was not published, so nothing is lost by a
            // broker that is briefly unreachable.
            relay = startRelay({ outbox, bus, logger });
        },
        stop: async () => {
            if (relay !== undefined) clearInterval(relay);
            await Promise.all([bus?.disconnect(), store.disconnect()]);
        },
    };
}
