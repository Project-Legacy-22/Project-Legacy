import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountDto, AuthApi } from './api/auth-api';
import type { ItemsApi } from './api/items-api';
import { ApiError } from './api/items-api';
import type { ProjectDto, ProjectsApi } from './api/projects-api';
import { App } from './app';
import { labels } from './labels';
import {
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
    waitFor,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const ACCOUNT: AccountDto = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};
const FIRST: ProjectDto = {
    id: '00000000-0000-7000-8000-000000000010',
    name: 'First project',
    role: 'owner',
    itemCount: 2,
};
const SECOND: ProjectDto = {
    id: '00000000-0000-7000-8000-000000000020',
    name: 'Second project',
    role: 'owner',
    itemCount: 0,
};

let root: ReactTestRoot;

const auth: AuthApi = {
    register: vi.fn(),
    signIn: vi.fn(),
    currentAccount: vi.fn(async () => ACCOUNT),
    requestPasswordReset: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    // Requis par AuthApi depuis #174 ; non exerce ici.
    signOut: vi.fn(async () => undefined),
};

function itemsApi(overrides: Partial<ItemsApi> = {}): ItemsApi {
    return {
        listItems: vi.fn(async () => ({ items: [], nextCursor: null })),
        createItem: vi.fn(),
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        ...overrides,
    };
}

function projectsApi(overrides: Partial<ProjectsApi> = {}): ProjectsApi {
    return {
        listProjects: vi.fn(async () => ({ projects: [FIRST], nextCursor: null })),
        createProject: vi.fn(async () => SECOND),
        deleteProject: vi.fn(async () => undefined),
        ...overrides,
    };
}

function projectButton(name: string): HTMLButtonElement {
    const button = [...document.querySelectorAll<HTMLButtonElement>('.project-select')].find((candidate) =>
        candidate.textContent?.includes(name),
    );
    if (button === undefined) throw new Error(`Project button not found: ${name}`);
    return button;
}

beforeEach(() => {
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.unstubAllGlobals();
});

describe('App project workflow', () => {
    it('retries a failed initial project load without reloading the page', async () => {
        const listProjects = vi
            .fn<ProjectsApi['listProjects']>()
            .mockRejectedValueOnce(new ApiError(503, labels.loadProjectsFailed))
            .mockResolvedValueOnce({ projects: [FIRST], nextCursor: null });
        await root.render(<App api={itemsApi()} auth={auth} projects={projectsApi({ listProjects })} />);

        expect(getElement('.projects-panel [role="alert"]').textContent).toContain(labels.loadProjectsFailed);
        await click(getElement<HTMLButtonElement>('.projects-panel .error-message button'));
        await flushTimers();

        expect(listProjects).toHaveBeenCalledTimes(2);
        expect(projectButton(FIRST.name)).not.toBeNull();
    });

    it('creates and selects a project from the keyboard form', async () => {
        const createProject = vi.fn(async () => SECOND);
        const api = projectsApi({ createProject });
        const listItems = vi.fn<ItemsApi['listItems']>(async () => ({
            items: [],
            nextCursor: null,
        }));
        const items = itemsApi({ listItems });
        await root.render(<App api={items} auth={auth} projects={api} />);

        await setInputValue(getElement<HTMLInputElement>('#project-name'), SECOND.name);
        await submitForm(getElement<HTMLFormElement>('.project-form'));
        await flushTimers();

        expect(createProject).toHaveBeenCalledWith({ name: SECOND.name });
        expect(projectButton(SECOND.name).getAttribute('aria-pressed')).toBe('true');
        const [projectId, request] = listItems.mock.calls.at(-1) ?? [];
        expect(projectId).toBe(SECOND.id);
        expect(request?.signal).toBeInstanceOf(AbortSignal);
    });

    it('keeps the first page while it loads the next project page', async () => {
        const listProjects = vi
            .fn<ProjectsApi['listProjects']>()
            .mockResolvedValueOnce({ projects: [FIRST], nextCursor: 'next' })
            .mockResolvedValueOnce({ projects: [SECOND], nextCursor: null });
        await root.render(<App api={itemsApi()} auth={auth} projects={projectsApi({ listProjects })} />);

        const loadMore = getElement<HTMLButtonElement>('.project-pagination');
        loadMore.focus();
        await click(loadMore);
        await flushTimers();

        expect(projectButton(FIRST.name)).not.toBeNull();
        expect(projectButton(SECOND.name)).not.toBeNull();
        expect(getElement('.projects-panel [aria-live="polite"]').textContent).toBe(labels.projectsLoaded(1));
        expect(loadMore.textContent).toBe(labels.allProjectsLoaded);
        expect(loadMore.getAttribute('aria-disabled')).toBe('true');
        await waitFor(() => document.activeElement === loadMore);
        expect(document.activeElement).toBe(loadMore);
    });

    it('removes an owned project and selects the next one', async () => {
        const deleteProject = vi.fn(async () => undefined);
        const api = projectsApi({
            listProjects: vi.fn(async () => ({
                projects: [FIRST, SECOND],
                nextCursor: null,
            })),
            deleteProject,
        });
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true),
        );
        await root.render(<App api={itemsApi()} auth={auth} projects={api} />);

        await click(getElement<HTMLButtonElement>('.project-remove'));
        await flushTimers();

        expect(deleteProject).toHaveBeenCalledWith(FIRST.id);
        expect(
            [...document.querySelectorAll<HTMLButtonElement>('.project-select')].some((button) =>
                button.textContent?.includes(FIRST.name),
            ),
        ).toBe(false);
        expect(projectButton(SECOND.name).getAttribute('aria-pressed')).toBe('true');
    });

    it('attaches a project creation failure to its field', async () => {
        const createProject = vi.fn(() => Promise.reject(new ApiError(503, labels.createProjectFailed)));
        await root.render(<App api={itemsApi()} auth={auth} projects={projectsApi({ createProject })} />);

        await setInputValue(getElement<HTMLInputElement>('#project-name'), 'Unavailable project');
        await submitForm(getElement<HTMLFormElement>('.project-form'));
        await flushTimers();

        const input = getElement<HTMLInputElement>('#project-name');
        expect(input.getAttribute('aria-describedby')).toContain('project-name-error');
        expect(getElement('#project-name-error').textContent).toBe(labels.createProjectFailed);
    });
});
