import { v4 as uuid } from 'uuid';
import { createSqliteItemStore, createMysqlItemStore, createLogger } from '@legacy/infra';
import type { ItemStore, Logger } from '@legacy/infra';
import { makeListItems, makeAddItem, makeChangeItem, makeRemoveItem } from '@legacy/core-items';

import type { Config, PersistenceConfig } from './config.js';

// The single place allowed to know which driver exists and to wire concrete
// adapters into the use cases. Selecting it here rather than at module load is
// what makes a test double possible (audit item D-02).
function createItemStore(persistence: PersistenceConfig): ItemStore {
    if (persistence.driver === 'mysql') {
        return createMysqlItemStore(persistence);
    }

    return createSqliteItemStore(persistence.location);
}

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
    const store = createItemStore(config.persistence);
    const logger = createLogger();

    return {
        logger,
        useCases: {
            listItems: makeListItems(store),
            addItem: makeAddItem({ repository: store, newId: uuid }),
            changeItem: makeChangeItem(store),
            removeItem: makeRemoveItem(store),
        },
        start: () => store.connect(),
        stop: () => store.disconnect(),
    };
}
