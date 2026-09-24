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
import { click, createReactTestRoot, flushTimers, getElement, setInputValue, submitForm } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// US-58 and #419 from the interface: a task is assigned to one or several
// members of its project, from its creation or its edit form; the card says to
// whom, and the change is announced.

const ME: ProjectMemberDto = { userId: ACCOUNT.id, email: ACCOUNT.email, role: 'owner' };
const GRACE: ProjectMemberDto = { userId: '0191f3c2-aaaa-7000-8000-000000000002', email: 'grace@example.com', role: 'member' };
const TASK = firstItem.name ?? '';
const BOTH = [ME, GRACE];

let testRoot: ReactTestRoot;

function updateEcho() {
    return vi.fn<ItemsApi['updateItem']>(async (_projectId, _id, body) => ({
        ...firstItem,
        name: body.name,
        assigneeIds: body.assigneeIds ?? firstItem.assigneeIds,
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

function checkboxFor(form: string, member: ProjectMemberDto): HTMLInputElement {
    return getElement<HTMLInputElement>(`${form} input[type="checkbox"][id$="-assignee-${member.userId}"]`);
}

function politeText(): string {
    return [...document.querySelectorAll('[aria-live="polite"]')].map(region => region.textContent).join(' ');
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
    vi.unstubAllGlobals();
});

describe('assigning a task from its edit form', () => {
    it('offers every member as a checkbox in a labelled group, and assigns several', async () => {
        const updateItem = updateEcho();
        await renderApp(createApi({ listItems: async () => itemPage([firstItem]), updateItem }), createMembersApi({ listMembers: async () => BOTH }));
        await click(buttonNamed(labels.editItem(TASK)));

        const group = getElement('.item-edit-form fieldset.item-assignees-field');
        expect(group.querySelector('legend')?.textContent).toBe(labels.assigneeLabel);
        expect([...group.querySelectorAll('label')].map(label => label.textContent)).toEqual([ME.email, GRACE.email]);
        const results = await axe.run(getElement('.item-edit-form'));
        expect(results.violations).toEqual([]);

        await click(checkboxFor('.item-edit-form', GRACE));
        await click(checkboxFor('.item-edit-form', ME));
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2].assigneeIds).toEqual([GRACE.userId, ME.userId]);
        expect(getElement('.item-assignee').textContent).toBe(labels.assignedTo([GRACE.email, ME.email]));
        expect(politeText()).toContain(labels.itemAssigned(TASK, [GRACE.email, ME.email]));
    });

    it('unassigns by unchecking everyone, and says so', async () => {
        const updateItem = updateEcho();
        const assigned = { ...firstItem, assigneeIds: [GRACE.userId] };
        await renderApp(createApi({ listItems: async () => itemPage([assigned]), updateItem }), createMembersApi({ listMembers: async () => BOTH }));
        await click(buttonNamed(labels.editItem(TASK)));

        expect(checkboxFor('.item-edit-form', GRACE).checked).toBe(true);
        await click(checkboxFor('.item-edit-form', GRACE));
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2].assigneeIds).toEqual([]);
        expect(document.querySelector('.item-assignee')).toBeNull();
        expect(politeText()).toContain(labels.itemUnassigned(TASK));
    });

    it('offers no choice in a project with a single member, and leaves the assignees out of the change', async () => {
        const updateItem = updateEcho();
        await renderApp(createApi({ listItems: async () => itemPage([firstItem]), updateItem }), createMembersApi({ listMembers: async () => [ME] }));
        await click(buttonNamed(labels.editItem(TASK)));

        expect(document.querySelector('.item-assignees-field')).toBeNull();
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2]).not.toHaveProperty('assigneeIds');
    });

    it('keeps editing possible when the members cannot be read', async () => {
        const updateItem = updateEcho();
        const members = createMembersApi({
            listMembers: async () => {
                throw new Error('offline');
            },
        });
        await renderApp(createApi({ listItems: async () => itemPage([{ ...firstItem, assigneeIds: [GRACE.userId] }]), updateItem }), members);

        expect(getElement('.item-assignee').textContent).toBe(labels.assignedTo([undefined]));
        await click(buttonNamed(labels.editItem(TASK)));
        expect(document.querySelector('.item-assignees-field')).toBeNull();
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem.mock.calls[0]?.[2]).not.toHaveProperty('assigneeIds');
    });
});

describe('assigning a task when creating it', () => {
    it('sends the members checked in the creation form, then clears them', async () => {
        const createItem = vi.fn<ItemsApi['createItem']>(async (_projectId, body) => ({
            ...firstItem,
            id: '0191f3c2-cccc-7000-8000-000000000001',
            name: body.name,
            assigneeIds: body.assigneeIds ?? [],
        }));
        await renderApp(createApi({ createItem }), createMembersApi({ listMembers: async () => BOTH }));

        await setInputValue(getElement<HTMLInputElement>('#item-name'), 'Plan the launch');
        await click(checkboxFor('.add-form', GRACE));
        await submitForm(getElement<HTMLFormElement>('.add-form'));
        await flushTimers();

        expect(createItem.mock.calls[0]?.[1]).toMatchObject({ name: 'Plan the launch', assigneeIds: [GRACE.userId] });
        expect(checkboxFor('.add-form', GRACE).checked).toBe(false);
        expect(getElement('.item-assignee').textContent).toBe(labels.assignedTo([GRACE.email]));
    });

    it('sends no assignees when nobody is checked', async () => {
        const createItem = vi.fn<ItemsApi['createItem']>(async (_projectId, body) => ({ ...firstItem, name: body.name }));
        await renderApp(createApi({ createItem }), createMembersApi({ listMembers: async () => BOTH }));

        await setInputValue(getElement<HTMLInputElement>('#item-name'), 'Alone');
        await submitForm(getElement<HTMLFormElement>('.add-form'));
        await flushTimers();

        expect(createItem.mock.calls[0]?.[1]).not.toHaveProperty('assigneeIds');
    });
});

describe('after a member leaves', () => {
    it('reads the tasks and the members again', async () => {
        const listItems = vi.fn(async () => itemPage([{ ...firstItem, assigneeIds: [GRACE.userId] }]));
        const listMembers = vi.fn(async () => BOTH);
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
    });
});
