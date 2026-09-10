import type { Notification } from '../../src/index.js';

const DEFAULTS: Notification = {
    id: '2e2b7d0e-9a0a-4c1a-8e0a-8f3a0e6a2b31',
    itemId: '11111111-1111-4111-8111-111111111111',
    userId: '00000000-0000-7000-8000-000000000001',
    readAt: null,
    createdAt: '2026-09-10T10:00:00.000Z',
};

export function aNotification(overrides: Partial<Notification> = {}): Notification {
    return { ...DEFAULTS, ...overrides };
}
