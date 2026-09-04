import { v7 as uuid } from 'uuid';
import { createSupabaseItemStore, createLogger } from '@legacy/infra';
import type { ItemStore } from '@legacy/infra';
import type { Logger } from '@legacy/contracts';
import { makeListItems, makeAddItem, makeChangeItem, makeRemoveItem } from '@legacy/core-items';

import type { Config } from './config.js';

// The application is single-user until US-11 (D-20). Every item is owned by this
// system account, whose row is created by the initial migration. Keep the value
// in sync with supabase/migrations/20260903120000_initial_schema.sql.
const SYSTEM_USER_ID = '00000000-0000-7000-8000-000000000001';

export interface ItemUseCases {
    listItems: ReturnType<typeof makeListItems>;
    addItem: ReturnType<typeof makeAddItem>;
    changeItem: ReturnType<typeof makeChangeItem>;
    removeItem: ReturnType<typeof makeRemoveItem>;
}

export interface Application {
    useCases: ItemUseCases;
    logger: Logger;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export function compose(config: Config): Application {
    const store: ItemStore = createSupabaseItemStore({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
    });
    const logger = createLogger();

    return {
        logger,
        useCases: {
            listItems: makeListItems(store),
            addItem: makeAddItem({ repository: store, newId: uuid, ownerId: () => SYSTEM_USER_ID }),
            changeItem: makeChangeItem(store),
            removeItem: makeRemoveItem(store),
        },
        // start() no longer creates the schema -- that is what migrations are
        // for. It checks the connection so a misconfigured deployment fails
        // loudly at boot instead of on the first request.
        start: () => store.connect(),
        stop: () => store.disconnect(),
    };
}
