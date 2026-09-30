import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttentionApi } from './api/attention-api';
import { ApiError } from './api/items-api';
import type { ProjectDto, ProjectsApi } from './api/projects-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createAttentionApi, createAuth, createMembersApi, createProjectsApi } from './test/app-fixture';
import { deferred } from './test/deferred';
import { anAttention } from './test/builders/attention-builder';
import {
    accessibleName,
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    pressKey,
    setInputValue,
    submitForm,
    waitFor,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const OWNED: ProjectDto = { id: '00000000-0000-7000-8000-000000000010', name: 'House', role: 'owner', itemCount: 2 };
const JOINED: ProjectDto = { id: '00000000-0000-7000-8000-000000000020', name: 'Work', role: 'member', itemCount: 1 };
const FIELD = `#project-rename-${OWNED.id}-name`;

let root: ReactTestRoot;

async function renderApp(projects: Partial<ProjectsApi> = {}, attention: AttentionApi = createAttentionApi()) {
    await root.render(
        <App
            api={createApi()}
            auth={createAuth()}
            projects={createProjectsApi({
                listProjects: async () => ({ projects: [OWNED, JOINED], nextCursor: null }),
                ...projects,
            })}
            attention={attention}
            members={createMembersApi()}
        />,
    );
    await flushTimers();
}

function renameButton(project: ProjectDto): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(`[data-project-id="${project.id}"] .project-rename`);
}

async function openRename(): Promise<HTMLInputElement> {
    const button = renameButton(OWNED);
    if (button === null) throw new Error('Rename button not found');
    await click(button);
    return getElement<HTMLInputElement>(FIELD);
}

function projectNames(): string[] {
    return [...document.querySelectorAll('.project-select .project-name')].map((name) => name.textContent ?? '');
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Legacy';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('renaming a project', () => {
    it('offers the action to the owner only, named after the project', async () => {
        await renderApp();

        expect(accessibleName(renameButton(OWNED) as HTMLButtonElement)).toBe(labels.renameProject(OWNED.name));
        expect(renameButton(JOINED)).toBeNull();
    });

    it('opens a labelled field holding the current name, with the focus on it', async () => {
        await renderApp();

        const field = await openRename();

        expect([field.value, accessibleName(field), document.activeElement]).toEqual([
            OWNED.name,
            labels.projectRenameLabel(OWNED.name),
            field,
        ]);
        expect(renameButton(OWNED)?.getAttribute('aria-expanded')).toBe('true');
    });

    it('renames, announces it, shows the new name and gives the focus back', async () => {
        const renameProject = vi.fn(async (_id: string, { name }: { name: string }) => ({ ...OWNED, name }));
        await renderApp({ renameProject });

        await setInputValue(await openRename(), '  Home  ');
        await submitForm(getElement<HTMLFormElement>('.project-rename-form'));
        await flushTimers();

        expect(renameProject).toHaveBeenCalledWith(OWNED.id, { name: 'Home' });
        expect(projectNames()).toEqual(['Home', JOINED.name]);
        expect(getElement('.projects-panel [role="status"]').textContent).toBe(labels.projectRenamed(OWNED.name, 'Home'));
        expect(document.querySelector('.project-rename-form')).toBeNull();
        expect(document.activeElement).toBe(renameButton(OWNED));
    });

    it('reads the home screen again so that it names the project by its new name', async () => {
        const listAttention = vi.fn(async () => anAttention());
        await renderApp({}, { listAttention });
        const readsBefore = listAttention.mock.calls.length;

        await setInputValue(await openRename(), 'Home');
        await submitForm(getElement<HTMLFormElement>('.project-rename-form'));
        await flushTimers();

        expect(listAttention.mock.calls.length).toBe(readsBefore + 1);
    });

    it('closes on Escape without sending anything and gives the focus back', async () => {
        const renameProject = vi.fn();
        await renderApp({ renameProject });

        await pressKey(await openRename(), 'Escape');
        await flushTimers();

        expect(renameProject).not.toHaveBeenCalled();
        expect(document.querySelector('.project-rename-form')).toBeNull();
        expect(document.activeElement).toBe(renameButton(OWNED));
    });

    it('refuses an empty name next to the field without calling the server', async () => {
        const renameProject = vi.fn();
        await renderApp({ renameProject });

        const field = await openRename();
        await setInputValue(field, '   ');
        await submitForm(getElement<HTMLFormElement>('.project-rename-form'));

        expect(renameProject).not.toHaveBeenCalled();
        expect(field.getAttribute('aria-invalid')).toBe('true');
        expect(getElement(`#${field.getAttribute('aria-describedby') ?? ''}`).textContent).toBe(labels.projectNameRequired);
    });

    it('keeps the form open with the server refusal attached to the field', async () => {
        const renameProject = vi.fn(async () => {
            throw new ApiError(404, 'Project not found.');
        });
        await renderApp({ renameProject });

        const field = await openRename();
        await setInputValue(field, 'Home');
        await submitForm(getElement<HTMLFormElement>('.project-rename-form'));
        await flushTimers();

        expect(getElement(`#${field.getAttribute('aria-describedby') ?? ''}`).textContent).toBe('Project not found.');
        expect(projectNames()).toEqual([OWNED.name, JOINED.name]);
        expect(document.activeElement).toBe(field);
    });

    it('keeps the submit button focusable while the request runs, and sends it once', async () => {
        const pending = deferred<ProjectDto>();
        const renameProject = vi.fn(() => pending.promise);
        await renderApp({ renameProject });

        await setInputValue(await openRename(), 'Home');
        const submit = getElement<HTMLButtonElement>('.project-rename-form button[type="submit"]');
        await click(submit);
        await click(submit);

        expect([submit.disabled, submit.getAttribute('aria-disabled')]).toEqual([false, 'true']);
        expect(renameProject).toHaveBeenCalledOnce();
        pending.resolve({ ...OWNED, name: 'Home' });
        await waitFor(() => document.querySelector('.project-rename-form') === null);
    });

    it('has no automatically detectable WCAG A or AA violation with the form open', async () => {
        await renderApp();
        await openRename();

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });
});
