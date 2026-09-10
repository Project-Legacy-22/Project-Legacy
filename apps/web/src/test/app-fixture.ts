import type { AccountDto, AuthApi } from '../api/auth-api';
import type { ItemDto, ItemPageDto, ItemsApi } from '../api/items-api';
import type { ProjectsApi } from '../api/projects-api';
import { anItem } from './builders/item-builder';

export const firstItem = anItem({
    id: '1c99b4ae-b7b8-49e7-885e-b2d976c1fe19',
    name: 'First item',
});

export const secondItem = anItem({
    id: '93a3eb56-61a2-4b0b-8e92-bb97fb9b3531',
    name: 'Second item',
});

const PROJECT = {
    id: firstItem.projectId,
    name: 'My project',
    role: 'owner' as const,
    itemCount: 2,
};

export const ACCOUNT: AccountDto = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};

export function itemPage(items: readonly ItemDto[] = [], nextCursor: string | null = null): ItemPageDto {
    return { items: [...items], nextCursor };
}

export function createApi(overrides: Partial<ItemsApi> = {}): ItemsApi {
    return {
        listItems: async () => itemPage(),
        createItem: async () => firstItem,
        updateItem: async () => firstItem,
        deleteItem: async () => undefined,
        ...overrides,
    };
}

// Signed in by default so item tests exercise their workflow directly.
export function createAuth(overrides: Partial<AuthApi> = {}): AuthApi {
    return {
        register: async () => undefined,
        signIn: async () => ACCOUNT,
        currentAccount: async () => ACCOUNT,
        requestPasswordReset: async () => undefined,
        resetPassword: async () => undefined,
        // Required by AuthApi since #174. No suite driving this fixture signs
        // out; the ones that do build their own double.
        signOut: async () => undefined,
        ...overrides,
    };
}

export function createProjectsApi(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
    return {
        listProjects: async () => ({
            projects: [PROJECT],
            nextCursor: null,
        }),
        createProject: async () => PROJECT,
        deleteProject: async () => undefined,
        ...overrides,
    };
}
