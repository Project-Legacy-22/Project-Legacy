import { v7 as uuid } from 'uuid';
import {
    createHibpPasswordRegistry,
    createLogger,
    createRedisEventBus,
    createSupabaseIdentityProvider,
    createSupabaseItemStore,
    createSupabaseNotificationStore,
    createSupabaseOutboxStore,
    createSupabasePersonalDataStore,
    createSupabaseProjectRepository,
    deliverPending,
    relayOnce,
} from '@legacy/infra';
import type {
    DeliveryPassResult,
    EventBus,
    ItemStore,
    NotificationStore,
    OutboxStore,
    RelayDependencies,
} from '@legacy/infra';
import type { Logger } from '@legacy/contracts';
import {
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
import { makeListItems, makeAddItem, makeChangeItem, makeMoveItem, makeRemoveItem } from '@legacy/core-items';
import {
    makeCountUnreadNotifications,
    makeListNotifications,
    makeMarkNotificationRead,
} from '@legacy/core-notifications';
import { makeAddProject, makeListProjects, makeRemoveProject } from '@legacy/core-projects';

import type { Config } from './config.js';

export interface ItemUseCases {
    listItems: ReturnType<typeof makeListItems>;
    addItem: ReturnType<typeof makeAddItem>;
    changeItem: ReturnType<typeof makeChangeItem>;
    moveItem: ReturnType<typeof makeMoveItem>;
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
}

export interface NotificationUseCases {
    listNotifications: ReturnType<typeof makeListNotifications>;
    markNotificationRead: ReturnType<typeof makeMarkNotificationRead>;
    countUnread: ReturnType<typeof makeCountUnreadNotifications>;
    // Une passe de livraison, demandee au lieu d etre planifiee. Sur une cible
    // sans processus long, personne ne fait tourner le relais : la route qui
    // lit les notifications et le workflow planifie l appellent.
    deliverPending: () => Promise<DeliveryPassResult>;
}

export interface AppUseCases {
    items: ItemUseCases;
    auth: AuthUseCases;
    account: AccountUseCases;
    projects: ProjectUseCases;
    notifications: NotificationUseCases;
}

// How often the relay drains the outbox. Short enough that the effect looks
// immediate in a demonstration, long enough not to hammer the database while
// nothing happens.
const RELAY_INTERVAL_MS = 1_000;

export interface Application {
    useCases: AppUseCases;
    logger: Logger;
    start(): Promise<void>;
    stop(): Promise<void>;
}

interface Adapters {
    store: ItemStore;
    identity: ReturnType<typeof createSupabaseIdentityProvider>;
    personalData: ReturnType<typeof createSupabasePersonalDataStore>;
    projects: ReturnType<typeof createSupabaseProjectRepository>;
    outbox: OutboxStore;
    notifications: NotificationStore;
    // Absent when no broker is configured. Serving HTTP does not need one; the
    // relay does, and start() is where that is enforced.
    bus: EventBus | undefined;
}

// Every adapter the application talks to, built in one place. Extracted from
// compose so that reading it answers "what does this application depend on"
// without wading through how the use cases are assembled.
function createAdapters(config: Config): Adapters {
    const supabase = { url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey };

    return {
        store: createSupabaseItemStore(supabase),
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
        outbox: createSupabaseOutboxStore(supabase),
        notifications: createSupabaseNotificationStore(supabase),
        bus:
            config.redisUrl === undefined
                ? undefined
                : createRedisEventBus({ url: config.redisUrl }),
    };
}

// A pass that outlives its interval must not have a second one start behind it:
// both would read the same unpublished rows and publish them twice, in an order
// neither controls. The flag makes the tick skip instead, and the skipped work
// is still there on the next one.
function startRelay(dependencies: RelayDependencies): NodeJS.Timeout {
    let relaying = false;

    const timer = setInterval(() => {
        if (relaying) return;
        relaying = true;

        void relayOnce(dependencies)
            .catch((err: unknown) => {
                dependencies.logger.warn({ err }, 'relay pass failed, will retry');
            })
            .finally(() => {
                relaying = false;
            });
    }, RELAY_INTERVAL_MS);

    // Does not hold the process open on its own.
    timer.unref();
    return timer;
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
    };
}

// Rien a livrer quand aucun courtier n est configure : servir du HTTP n en
// demande pas, et la passe doit alors ne rien faire plutot que d echouer.
function makeDeliverPending(dependencies: {
    outbox: OutboxStore;
    bus: EventBus | undefined;
    notifications: NotificationStore;
    logger: Logger;
}): () => Promise<DeliveryPassResult> {
    const { bus } = dependencies;

    if (bus === undefined) return () => Promise.resolve({ published: 0, consumed: 0 });

    return () => deliverPending({ ...dependencies, bus });
}

export function compose(config: Config): Application {
    const { store, identity, personalData, projects, outbox, notifications, bus } = createAdapters(config);
    const logger = createLogger(config.logLevel);
    const compromisedPasswords = createHibpPasswordRegistry({ logger });

    // The relay lives with the writer, not with the consumer: it reads a table
    // only this process is meant to touch. Stopping the worker therefore makes
    // the broker queue grow, which is exactly what ADR-0007 wants to be able to
    // show.
    let relay: NodeJS.Timeout | undefined;

    return {
        logger,
        useCases: {
            items: {
                listItems: makeListItems(store),
                addItem: makeAddItem({ repository: store, newId: uuid, now: () => new Date() }),
                changeItem: makeChangeItem(store),
                moveItem: makeMoveItem(store),
                removeItem: makeRemoveItem(store),
            },
            auth: authUseCases(identity, compromisedPasswords),
            account: {
                exportPersonalData: makeExportPersonalData({
                    store: personalData,
                    now: () => new Date(),
                }),
                eraseAccount: makeEraseAccount({ store: personalData, identity }),
            },
            projects: {
                listProjects: makeListProjects(projects),
                addProject: makeAddProject({ repository: projects, newId: uuid }),
                removeProject: makeRemoveProject(projects),
            },
            notifications: {
                listNotifications: makeListNotifications(notifications),
                markNotificationRead: makeMarkNotificationRead(notifications),
                countUnread: makeCountUnreadNotifications(notifications),
                deliverPending: makeDeliverPending({ outbox, bus, notifications, logger }),
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
