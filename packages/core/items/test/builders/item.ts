import type { Item } from '../../src/index.js';

const DEFAULTS: Item = {
    id: '2e2b7d0e-9a0a-4c1a-8e0a-8f3a0e6a2b31',
    name: 'A sample item',
    completed: false,
    ownerId: '00000000-0000-7000-8000-000000000001',
};

export function anItem(overrides: Partial<Item> = {}): Item {
    return { ...DEFAULTS, ...overrides };
}
