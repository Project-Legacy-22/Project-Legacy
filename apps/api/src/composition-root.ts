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
    relayOnce,
} from '@legacy/infra';
import type { EventBus, ItemStore, NotificationStore, OutboxStore } from '@legacy/infra';
import type { Logger } from '@legacy/contracts';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
} from '@legacy/core-auth';
import { makeListItems, makeAddItem, makeChangeItem, makeRemoveItem } from '@legacy/core-items';

import type { Config } from './config.js';

export interface ItemUseCases {
    listItems: ReturnType<typeof makeListItems>;
    addItem: ReturnType<typeof makeAddItem>;
    changeItem: ReturnType<typeof makeChangeItem>;
    removeItem: ReturnType<typeof makeRemoveItem>;
}

export interface AuthUseCases {
    registerAccount: ReturnType<typeof makeRegisterAccount>;
    signIn: ReturnType<typeof makeSignIn>;
    identifyCaller: ReturnType<typeof makeIdentifyCaller>;
    requestPasswordReset: ReturnType<typeof makeRequestPasswordReset>;
    resetPassword: ReturnType<typeof makeResetPassword>;
}

// Kept apart from AuthUseCases, which requireAccount receives on every request
// that needs a session. Erasing an account has no business being reachable from
// there.
export interface AccountUseCases {
    exportPersonalData: ReturnType<typeof makeExportPersonalData>;
    eraseAccount: ReturnType<typeof makeEraseAccount>;
}

export interface NotificationUseCases {
    countUnread: (userId: string) => Promise<number>;
}

export interface AppUseCases {
    items: ItemUseCases;
    auth: AuthUseCases;
    account: AccountUseCases;
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
    outbox: OutboxStore;
    notifications: NotificationStore;
    bus: EventBus;
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
        outbox: createSupabaseOutboxStore(supabase),
        notifications: createSupabaseNotificationStore(supabase),
        bus: createRedisEventBus({ url: config.redisUrl }),
    };
}

export function compose(config: Config): Application {
    const { store, identity, personalData, outbox, notifications, bus } = createAdapters(config);
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
                removeItem: makeRemoveItem(store),
            },
            auth: {
                registerAccount: makeRegisterAccount(identity),
                signIn: makeSignIn(identity),
                identifyCaller: makeIdentifyCaller(identity),
                requestPasswordReset: makeRequestPasswordReset(identity),
                resetPassword: makeResetPassword({ provider: identity, compromisedPasswords }),
            },
            account: {
                exportPersonalData: makeExportPersonalData({
                    store: personalData,
                    now: () => new Date(),
                }),
                eraseAccount: makeEraseAccount({ store: personalData, identity }),
            },
            notifications: {
                countUnread: userId => notifications.countUnread(userId),
            },
        },
        // start() no longer creates the schema -- that is what migrations are
        // for. It checks the connection so a misconfigured deployment fails
        // loudly at boot instead of on the first request.
        start: async () => {
            await store.connect();
            await bus.connect();

            // A failed pass is logged and retried on the next tick: the outbox
            // still holds what was not published, so nothing is lost by a
            // broker that is briefly unreachable.
            relay = setInterval(() => {
                void relayOnce({ outbox, bus, logger }).catch((err: unknown) => {
                    logger.warn({ err }, 'relay pass failed, will retry');
                });
            }, RELAY_INTERVAL_MS);
            // Does not hold the process open on its own.
            relay.unref();
        },
        stop: async () => {
            if (relay !== undefined) clearInterval(relay);
            await bus.disconnect();
            await store.disconnect();
        },
    };
}
