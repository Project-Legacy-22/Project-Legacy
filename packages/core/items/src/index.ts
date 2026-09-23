export {
    createItem,
    rehydrateItem,
    itemName,
    itemDueDate,
    DomainError,
    InvalidItemName,
    InvalidItemDueDate,
    InvalidItemCursor,
    ItemNotFound,
    ItemStatusConflict,
    ItemPositionConflict,
    InvalidItemPosition,
    ItemProjectNotFound,
    ITEM_STATUSES,
    ITEM_PRIORITIES,
    MAX_ITEM_NAME_LENGTH,
} from './domain/item.js';
export type { Item, ItemPriority, ItemStatus } from './domain/item.js';

export { criteriaFingerprint, matchesCriteria, normalizeSearchTerm } from './domain/item-search.js';
export type { ItemSearchCriteria } from './domain/item-search.js';

export {
    ATTENTION_GROUP_LIMIT,
    ATTENTION_GROUPS,
    InvalidAttentionDate,
    attentionGroupOf,
    attentionWindow,
    compareAttention,
} from './domain/attention.js';
export type {
    Attention,
    AttentionEntry,
    AttentionGroup,
    AttentionGroupName,
    AttentionWindow,
    Workload,
} from './domain/attention.js';

export { ITEM_CREATED_V1, itemCreated } from './domain/event.js';
export type { DomainEvent, ItemCreatedV1 } from './domain/event.js';

export type { ItemRepository, ItemPage, ItemPageQuery, ItemStatusMove, ItemPositionMove } from './ports/item-repository.js';

export type { AttentionGroupQuery, AttentionReader } from './ports/attention-reader.js';

export { makeListItems } from './application/list-items.js';
export { makeAddItem } from './application/add-item.js';
export { makeChangeItem } from './application/change-item.js';
export { makeMoveItem } from './application/move-item.js';
export { makeReorderItem } from './application/reorder-item.js';
export { makeRemoveItem } from './application/remove-item.js';
export { makeListAttention } from './application/list-attention.js';
export type { AddItemDependencies } from './application/add-item.js';
export type { ItemChanges } from './application/change-item.js';
export type { MoveItemRequest } from './application/move-item.js';
