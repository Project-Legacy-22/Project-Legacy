import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountDto, AuthApi } from './api/auth-api';
import type { ItemDto, ItemsApi } from './api/items-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createProjectsApi, itemPage } from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import {
    accessibleName,
    click,
    createReactTestRoot,
    flushTimers,
    focusOrder,
    getElement,
    setInputValue,
    setSelectValue,
    submitForm,
    tab,
    tabbables,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// The end-to-end keyboard path US-14 asks for, screen by screen: the sign-in
// screen, the registration screen, the board, a move, and signing out.
//
// What « by keyboard alone » can and cannot mean in jsdom, said plainly. Every
// control this journey uses is reached with Tab, and the test asserts it is in
// the tab order, in the reading order, and that focus is never dropped to the
// body across a screen change. Activation then goes through click(), because
// jsdom does not turn Enter on a focused <button> into a click the way a
// browser does. That is not a hole in the guarantee: it is a native button
// everywhere, and a native button is operated by Enter and Space by
// definition. The guarantee comes from the element, and what needs testing is
// that the element is reachable -- which is what fails when a control is
// hidden behind a pointer-only gesture, or when a remount loses focus.

const ACCOUNT: AccountDto = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};
const TASK = anItem({ name: 'Prepare the defence', status: 'todo', version: 1 });

let root: ReactTestRoot;
let signedIn = false;

// Signed out to begin with, and signed in once register or signIn succeeded:
// the journey crosses that boundary, so the double has to as well.
function journeyAuth(overrides: Partial<AuthApi> = {}): AuthApi {
    return {
        register: vi.fn(async () => {
            signedIn = true;
        }),
        signIn: vi.fn(async () => {
            signedIn = true;
            return ACCOUNT;
        }),
        // null, not a rejection: the contract makes null « anonymous » and a
        // rejection « the check itself failed », and the second one puts the
        // application on its error screen instead of the sign-in one.
        currentAccount: vi.fn(async () => (signedIn ? ACCOUNT : null)),
        requestPasswordReset: vi.fn(async () => undefined),
        resetPassword: vi.fn(async () => undefined),
        signOut: vi.fn(async () => {
            signedIn = false;
        }),
        ...overrides,
    };
}

function tasks(items: readonly ItemDto[]): Partial<ItemsApi> {
    return { listItems: vi.fn(async () => itemPage(items)) };
}

// Walks Tab from where focus is until it lands on the target, and says how far
// it had to go. A control the journey cannot reach fails here rather than
// later, with the order printed next to it.
async function reach(target: HTMLElement, order: readonly string[]): Promise<number> {
    let stop = await tab();

    for (let steps = 1; steps <= order.length + 1; steps += 1) {
        if (stop === target) return steps;
        stop = await tab();
    }

    throw new Error(
        `\`${accessibleName(target)}\` is not reachable with Tab. Order: ${order.join(' | ')}`,
    );
}

async function fillCredentials(): Promise<void> {
    await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), ACCOUNT.email);
    await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), 'Defence2026-ok');
}

function named(fragment: string): HTMLElement | undefined {
    return tabbables().find(stop => accessibleName(stop).includes(fragment));
}

// The tab order by full accessible name. focusOrder() truncates each name to
// forty characters so a failure stays readable; the consent sentence is longer
// than that, and comparing against the truncated form would pass on a name
// that merely starts the same way.
function order(): string[] {
    return tabbables().map(stop => accessibleName(stop));
}

function rankOf(fragment: string): number {
    return order().findIndex(name => name.includes(fragment));
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Legacy 22';
    signedIn = false;
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('the keyboard journey, screen by screen', () => {
    it('reaches every control of the sign-in screen, in reading order', async () => {
        await root.render(
            <App api={createApi(tasks([]))} auth={journeyAuth()} projects={createProjectsApi()} />,
        );
        await flushTimers();

        expect(rankOf(labels.emailLabel)).toBe(0);
        expect(rankOf(labels.emailLabel)).toBeLessThan(rankOf(labels.passwordLabel));
        expect(rankOf(labels.passwordLabel)).toBeLessThan(rankOf(labels.signIn));
        expect(rankOf(labels.signIn)).toBeLessThan(rankOf(labels.switchToRegister));
    });

    // The risk the remount carries. auth-page.tsx gives AuthForm `key={screen}`
    // on purpose -- the fields of the previous mode must not linger -- and a
    // remount is exactly where focus gets dropped to the body without anyone
    // noticing, because the screen still looks right.
    it('keeps focus on the switch after the screen changed mode', async () => {
        await root.render(
            <App api={createApi(tasks([]))} auth={journeyAuth()} projects={createProjectsApi()} />,
        );
        await flushTimers();

        const before = named(labels.switchToRegister);
        expect(before).toBeDefined();
        if (before === undefined) return;

        await reach(before, focusOrder());
        await click(before);
        await flushTimers();

        const focused = document.activeElement;
        expect(focused).not.toBe(document.body);
        expect(focused === null ? '' : accessibleName(focused as HTMLElement)).toContain(
            labels.switchToSignIn,
        );
    });

    it('reaches the consent and the submit of the registration screen', async () => {
        await root.render(
            <App api={createApi(tasks([]))} auth={journeyAuth()} projects={createProjectsApi()} />,
        );
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.auth-page .button-quiet'));

        expect(rankOf(labels.consentLabel)).toBeGreaterThan(-1);
        expect(rankOf(labels.consentLabel)).toBeLessThan(rankOf(labels.register));
        // The policy opens from a button, so it is a stop of its own: a reader
        // can read what they are agreeing to without leaving the form.
        expect(rankOf(labels.readPrivacyPolicy)).toBeGreaterThan(-1);
    });

    // Registering does not sign anyone in, on purpose: the answer is the same
    // whether the address existed or not, so it cannot be used to find out who
    // has an account. The journey therefore has two steps here, not one, and
    // the second must be reachable from the first without a pointer.
    it('registers, then signs in, and lands on the board', async () => {
        const auth = journeyAuth();
        await root.render(
            <App api={createApi(tasks([]))} auth={auth} projects={createProjectsApi()} />,
        );
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.auth-page .button-quiet'));

        await fillCredentials();
        await click(getElement<HTMLInputElement>('input[type="checkbox"]'));
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));
        await flushTimers();

        expect(auth.register).toHaveBeenCalledOnce();
        // Still on the form, with the uniform answer read out by a live region.
        expect(getElement('form.auth-form .form-success').textContent).toBe(
            labels.registerAccepted,
        );

        const back = named(labels.switchToSignIn);
        expect(back).toBeDefined();
        if (back === undefined) return;

        await reach(back, focusOrder());
        await click(back);
        await fillCredentials();
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));
        await flushTimers();

        expect(auth.signIn).toHaveBeenCalledOnce();
        expect(document.querySelector('form.auth-form')).toBeNull();
        expect(document.querySelector('.kanban-board')).not.toBeNull();
    });

    it('adds a task, then moves it across the board, with every control reachable', async () => {
        signedIn = true;
        const moved = { ...TASK, status: 'doing' as const, version: 2 };
        const api = createApi({
            ...tasks([TASK]),
            moveItem: vi.fn<ItemsApi['moveItem']>(async () => moved),
        });
        await root.render(<App api={api} auth={journeyAuth()} projects={createProjectsApi()} />);
        await flushTimers();

        const addField = getElement<HTMLInputElement>('.add-form input[type="text"]');
        expect(await reach(addField, focusOrder())).toBeGreaterThan(0);

        const move = getElement<HTMLButtonElement>(`[data-move-item-id="${TASK.id}"]`);
        expect(await reach(move, focusOrder())).toBeGreaterThan(0);

        await click(move);
        const select = getElement<HTMLSelectElement>('.move-item-form select');
        // The form focuses its own select, so a keyboard user lands on the one
        // control the step is about instead of hunting for it.
        expect(document.activeElement).toBe(select);

        await setSelectValue(select, 'doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await flushTimers();

        expect(api.moveItem).toHaveBeenCalledOnce();
        expect(document.activeElement).not.toBe(document.body);
    });

    it('signs out and lands on the title of the screen it returns to', async () => {
        signedIn = true;
        const auth = journeyAuth();
        await root.render(
            <App api={createApi(tasks([TASK]))} auth={auth} projects={createProjectsApi()} />,
        );
        await flushTimers();

        const out = getElement<HTMLButtonElement>('.session-banner button');
        expect(await reach(out, focusOrder())).toBeGreaterThan(0);

        await click(out);
        await flushTimers();

        expect(auth.signOut).toHaveBeenCalledOnce();
        // The US-47 criterion, and the end of the journey: focus is moved to
        // the heading, so the next Tab starts from the top of the new screen
        // rather than from wherever the old one left it.
        expect(document.activeElement).toBe(getElement<HTMLHeadingElement>('.auth-page h1'));
    });
});
