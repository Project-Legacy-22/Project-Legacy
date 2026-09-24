import type { ItemDto } from '../../api/items-api';

const DEFAULT_ITEM_ID = '8f80ec8b-8cbf-4d0f-92b5-6297404875f1';
const DEFAULT_PROJECT_ID = '00000000-0000-7000-8000-000000000010';

export function anItem(overrides: Partial<ItemDto> = {}): ItemDto {
    return {
        id: DEFAULT_ITEM_ID,
        projectId: DEFAULT_PROJECT_ID,
        name: 'A test item',
        status: 'todo',
        version: 1,
        position: overrides.position ?? overrides.id ?? DEFAULT_ITEM_ID,
        priority: 'normal',
        dueDate: null,
        assigneeIds: [],
        ...overrides,
    };
}
