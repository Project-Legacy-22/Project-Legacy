import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemsApi } from './api/items-api';
import type { MembersApi, ProjectMemberDto } from './api/members-api';
import { labels } from './labels';
import {
    ACCOUNT,
    createApi,
    createAttentionApi,
    createAuth,
    createCredentialsApi,
    createMembersApi,
    createProjectsApi,
    firstItem,
    itemPage,
} from './test/app-fixture';
import { click, createReactTestRoot, flushTimers, getElement, setSelectValue, submitForm } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// US-58 from the interface: a task is assigned from its edit form to a member
// of its project, the card says to whom, and the change is announced.

const ME: ProjectMemberDto = { userId: ACCOUNT.id, email: ACCOUNT.email, role: 'owner' };
const GRACE: ProjectMemberDto = { userId: '0191f3c2-aaaa-7000-8000-000000000002', email: 'grace@example.com', role: 'member' };
const TASK = firstItem.name ?? '';

let testRoot: ReactTestRoot;

function updateEcho(): ItemsApi['updateItem'] & ReturnType<typeof vi.fn> {
    return vi.fn<ItemsApi['updateItem']>(async (_projectId, _id, body) => ({
        ...firstItem,
        name: body.name,
        assigneeId: body.assigneeId === undefined ? firstItem.assigneeId : body.assigneeId,
    }));
}

async function renderApp(items: ItemsApi, members: MembersApi): Promise<void> {
    await testRoot.render(
        <App
            api={items}
            auth={createAuth()}
            credentials={createCredentialsApi()}
            attention={createAttentionApi()}
            projects={createProjectsApi()}
            members={members}
        />,
    );
    await flushTimers();
}

function buttonNamed(name: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        button => button.getAttribute('aria-label') === name,
    );
    if (found === undefined) throw new Error(`no button named ${name}`);
    return found;
}

async function openEdit(): Promise<void> {
    await click(buttonNamed(labels.editItem(TASK)));
}

function assigneeSelect(): HTMLSelectElement | null {
    return document.querySelector<HTMLSelectElement>('.item-edit-form select[id$="-assignee"]');
}

function politeText(): string {
    return [...document.querySelectorAll('[aria-live="polite"]')].map(region => region.textContent).join(' ');
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('assigning a task', () => {
    it('offers nobody and every member, and assigns from the keyboard form', async () => {
        const updateItem = updateEcho();
        await renderApp(createApi({ listItems: async () => itemPage([firstItem]), updateItem }), createMembersApi({ listMembers: async () => [ME, GRACE] }));
        await openEdit();

        const select = assigneeSelect();
        expect([...(select?.options ?? [])].map(option => option.textContent)).toEqual([labels.nobody, ME.email, GRACE.email]);
        expect(getElement(`label[for="${select?.id ?? ''}"]`).textContent).toBe(labels.assigneeLabel);
        const results = await axe.run(getElement('.item-edit-form'));
        expect(results.violations).toEqual([]);

        await setSelectValue(getElement<HTMLSelectElement>('.item-edit-form select[id$="-assignee"]'), GRACE.userId);
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem).toHaveBeenCalledWith(firstItem.projectId, firstItem.id, expect.objectContaining({ assigneeId: GRACE.userId }));
        expect(getElement('.item-assignee').textContent).toBe(labels.assignedTo(GRACE.email));
        expect(politeText()).toContain(labels.itemAssigned(TASK, GRACE.email));
    });

    it('unassigns with Nobody, and says so', async () => {
        const updateItem = updateEcho();
        const assigned = { ...firstItem, assigneeId: GRACE.userId };
        await renderApp(createApi({ listItems: async () => itemPage([assigned]), updateItem }), createMembersApi({ listMembers: async () => [ME, GRACE] }));
        await openEdit();

        expect(assigneeSelect()?.value).toBe(GRACE.userId);
        await setSelectValue(getElement<HTMLSelectElement>('.item-edit-form select[id$="-assignee"]'), '');
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem).toHaveBeenCalledWith(firstItem.projectId, firstItem.id, expect.objectContaining({ assigneeId: null }));
        expect(document.querySelector('.item-assignee')).toBeNull();
        expect(politeText()).toContain(labels.itemUnassigned(TASK));
    });

    it('offers no choice in a project with a single member, and leaves the assignee out of the change', async () => {
        const updateItem = updateEcho();
        await renderApp(createApi({ listItems: async () => itemPage([firstItem]), updateItem }), createMembersApi({ listMembers: async () => [ME] }));
        await openEdit();

        expect(assigneeSelect()).toBeNull();
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2]).not.toHaveProperty('assigneeId');
    });

    it('keeps editing possible when the members cannot be read', async () => {
        const updateItem = updateEcho();
        const members = createMembersApi({
            listMembers: async () => {
                throw new Error('offline');
            },
        });
        await renderApp(createApi({ listItems: async () => itemPage([{ ...firstItem, assigneeId: GRACE.userId }]), updateItem }), members);

        expect(getElement('.item-assignee').textContent).toBe(labels.assignedTo(undefined));
        await openEdit();
        expect(assigneeSelect()).toBeNull();
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2]).not.toHaveProperty('assigneeId');
    });

    it('reads the tasks and the members again after a member is removed', async () => {
        const listItems = vi.fn(async () => itemPage([{ ...firstItem, assigneeId: GRACE.userId }]));
        const listMembers = vi.fn(async () => [ME, GRACE]);
        vi.stubGlobal('confirm', vi.fn(() => true));
        await renderApp(createApi({ listItems }), createMembersApi({ listMembers }));
        const itemReads = listItems.mock.calls.length;
        const memberReads = listMembers.mock.calls.length;

        await click(getElement<HTMLButtonElement>('.members-panel button[aria-controls="members-content"]'));
        await flushTimers();
        await click(buttonNamed(labels.removeMember(GRACE.email)));
        await flushTimers();

        expect(listItems.mock.calls.length).toBeGreaterThan(itemReads);
        expect(listMembers.mock.calls.length).toBeGreaterThan(memberReads + 1);
        vi.unstubAllGlobals();
    });
});
