import type { ItemDto } from '../../api/items-api';

const DEFAULT_ITEM_ID = '8f80ec8b-8cbf-4d0f-92b5-6297404875f1';

export function anItem(overrides: Partial<ItemDto> = {}): ItemDto {
    return {
        id: DEFAULT_ITEM_ID,
        name: 'A test item',
        completed: false,
        ...overrides,
    };
}
