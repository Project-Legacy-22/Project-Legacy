export {
    createItem,
    rehydrateItem,
    itemName,
    DomainError,
    InvalidItemName,
    ItemNotFound,
    MAX_ITEM_NAME_LENGTH,
} from './domain/item.js';
export type { Item } from './domain/item.js';

export type { ItemRepository } from './ports/item-repository.js';

export { makeListItems } from './application/list-items.js';
export { makeAddItem } from './application/add-item.js';
export { makeChangeItem } from './application/change-item.js';
export { makeRemoveItem } from './application/remove-item.js';
export type { AddItemDependencies } from './application/add-item.js';
export type { ItemChanges } from './application/change-item.js';
