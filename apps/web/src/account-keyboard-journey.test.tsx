import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountApi } from './api/account-api';
import type { CredentialsApi } from './api/credentials-api';
import { App } from './app';
import { labels } from './labels';
import { ACCOUNT, createApi, createAuth, createCredentialsApi, createProjectsApi } from './test/app-fixture';
import { deferred } from './test/deferred';
import {
    accessibleName,
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
    tab,
    tabbables,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// The account screen walked with the keyboard: the two credential forms, the
// export, and the deletion. Gap 7 of docs/features/15-accessibility-audit.md
// named two screens that no test walked; #182 closed the board half, and this
// suite closes the account half.
//
// What « walked » means here is what it means in keyboard-journey.test.tsx:
// every control is reached with Tab, in the reading order, and no action drops
// focus to the body. Activation then goes through a click, because jsdom does
// not turn Enter on a focused button into one. The guarantee comes from the
// element -- these are native inputs and buttons, operated by Enter and Space
// by definition -- and what needs proving is that they are reachable at all.

const EXPORTED = new Blob(['{"exportedAt":"2026-09-08T12:00:00.000Z"}'], {
    type: 'application/json',
});

// The controls of the two account sections, in the order the sections are read.
// Written out rather than derived: a list built from the document would agree
// with whatever the document does, including after two fields were swapped.
const ACCOUNT_CONTROLS = [
    labels.newEmailLabel,
    labels.changeEmailSubmit,
    labels.currentPasswordLabel,
    labels.newPasswordLabel,
    labels.changePasswordSubmit,
    labels.exportData,
    labels.deleteAccountConfirmationLabel,
    labels.deleteAccount,
];

const SECTIONS =
    '[aria-labelledby="credentials-heading"], [aria-labelledby="personal-data-heading"]';

let root: ReactTestRoot;

function accountApi(overrides: Partial<AccountApi> = {}): AccountApi {
    return {
        exportPersonalData: vi.fn(async () => EXPORTED),
        deleteAccount: vi.fn(async () => undefined),
        ...overrides,
    };
}

interface Doubles {
    account?: AccountApi;
    credentials?: CredentialsApi;
    save?: () => void;
}

async function show({ account, credentials, save }: Doubles = {}): Promise<void> {
    // apps/web/index.html carries both; the blank jsdom document does not.
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';

    await root.render(
        <App
            api={createApi()}
            auth={createAuth()}
            account={account ?? accountApi()}
            credentials={credentials ?? createCredentialsApi()}
            projects={createProjectsApi()}
            save={save ?? vi.fn()}
        />,
    );
    await flushTimers();
}

// The stops Tab visits inside the account sections. The rest of the screen is
// walked by keyboard-journey.test.tsx; restricting to these two panels keeps
// this suite from failing the day a control is added to the item list above.
function accountStops(): HTMLElement[] {
    return tabbables().filter(stop => stop.closest(SECTIONS) !== null);
}

function stopNamed(name: string): HTMLElement {
    const found = accountStops().find(stop => accessibleName(stop) === name);
    if (found === undefined) {
        throw new Error(
            `No account control named \`${name}\`. Stops: ${accountStops().map(accessibleName).join(' | ')}`,
        );
    }

    return found;
}

// Tab from the first control of the sections, and report where each press
// lands. The first name is the starting point, so a run of n presses reports
// n + 1 stops and the whole order reads in one assertion.
async function walkFrom(start: HTMLElement, presses: number): Promise<string[]> {
    start.focus();
    const visited = [accessibleName(start)];

    for (let press = 0; press < presses; press += 1) {
        const stop = await tab();
        visited.push(stop === null ? '(nothing)' : accessibleName(stop));
    }

    return visited;
}

function focusedName(): string {
    const active = document.activeElement;
    if (active === null || active === document.body) return '(body)';
    return accessibleName(active as HTMLElement);
}

function announcement(): string {
    const regions = [...document.querySelectorAll('[aria-live="polite"]')];
    return regions.map(region => region.textContent ?? '').join('');
}

beforeEach(() => {
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('the keyboard journey of the account screen', () => {
    it('walks every control of the two sections, in reading order', async () => {
        await show();

        const visited = await walkFrom(stopNamed(labels.newEmailLabel), ACCOUNT_CONTROLS.length - 1);

        expect(visited).toEqual(ACCOUNT_CONTROLS);
    });

    // The section puts the download before the deletion on purpose, and the
    // warning points back at it: someone who wants their data gone usually
    // wants a copy of it first. That intent is an order, so it is walked.
    it('offers the download before the deletion its warning points back at', async () => {
        await show();

        const visited = await walkFrom(stopNamed(labels.exportData), 2);

        expect(visited).toEqual([
            labels.exportData,
            labels.deleteAccountConfirmationLabel,
            labels.deleteAccount,
        ]);
    });

    it('keeps focus on the control that asked for an email change', async () => {
        await show();
        await setInputValue(stopNamed(labels.newEmailLabel) as HTMLInputElement, 'new@example.com');

        stopNamed(labels.changeEmailSubmit).focus();
        await submitForm(getElement<HTMLFormElement>('form.credentials-form'));
        await flushTimers();

        expect(focusedName()).toBe(labels.changeEmailSubmit);
        expect(getElement('form.credentials-form .form-success').textContent).toBe(
            labels.emailChangeRequested,
        );
    });

    it('keeps focus on the control that changed the password', async () => {
        await show();
        const form = getElement<HTMLFormElement>('#change-password-heading').closest('form');
        if (form === null) throw new Error('The password form has no form element.');
        await setInputValue(stopNamed(labels.currentPasswordLabel) as HTMLInputElement, 'Current2026-ok');
        await setInputValue(stopNamed(labels.newPasswordLabel) as HTMLInputElement, 'Defence2026-ok');

        stopNamed(labels.changePasswordSubmit).focus();
        await submitForm(form);
        await flushTimers();

        expect(focusedName()).toBe(labels.changePasswordSubmit);
    });

    // The one success that leaves nothing on screen: the file goes to the
    // browser's downloads and the page looks exactly as it did. Without the
    // live region, a screen reader user has no way of knowing it worked.
    it('announces the download, and keeps focus on the control that started it', async () => {
        const save = vi.fn();
        await show({ save });

        const download = stopNamed(labels.exportData);
        download.focus();
        await click(download);
        await flushTimers();

        expect(save).toHaveBeenCalledOnce();
        expect(announcement()).toContain(labels.exportDone);
        expect(focusedName()).toBe(labels.exportData);
    });

    // The control that carries the focus must not turn inert while it works.
    // A disabled element leaves the tab order, and the focus fixup rule of the
    // HTML standard then moves focus to the body -- which jsdom does not do, so
    // asserting on document.activeElement here would pass whatever the markup
    // said. The cause is what this suite can see, so the cause is what it
    // guards: the control stays reachable for as long as the export runs.
    it('keeps the download reachable while it is being prepared', async () => {
        const pending = deferred<Blob>();
        await show({ account: accountApi({ exportPersonalData: vi.fn(() => pending.promise) }) });

        const download = stopNamed(labels.exportData);
        download.focus();
        await click(download);

        const inFlight = stopNamed(labels.exportingData);
        expect(accountStops()).toContain(inFlight);
        expect(inFlight.getAttribute('aria-disabled')).toBe('true');

        pending.resolve(EXPORTED);
        await flushTimers();
    });

    it('does not start a second export while the first one is running', async () => {
        const pending = deferred<Blob>();
        const account = accountApi({ exportPersonalData: vi.fn(() => pending.promise) });
        await show({ account });

        await click(stopNamed(labels.exportData));
        await click(stopNamed(labels.exportingData));

        expect(account.exportPersonalData).toHaveBeenCalledOnce();

        pending.resolve(EXPORTED);
        await flushTimers();
    });

    // A refusal the interface raises itself, without asking the API: the field
    // keeps what was typed, the error is tied to it, and focus stays on the
    // form rather than being dropped at the top of the document.
    it('keeps focus on the form when it refuses the deletion itself', async () => {
        const account = accountApi();
        await show({ account });
        await setInputValue(
            stopNamed(labels.deleteAccountConfirmationLabel) as HTMLInputElement,
            'someone-else@example.com',
        );

        stopNamed(labels.deleteAccount).focus();
        await submitForm(getElement<HTMLFormElement>('form.delete-account'));
        await flushTimers();

        expect(focusedName()).toBe(labels.deleteAccount);
        expect(getElement('#delete-account-confirmation-error').textContent).toBe(
            labels.deleteAccountConfirmationMismatch,
        );
        expect(account.deleteAccount).not.toHaveBeenCalled();
    });

    it('reaches the deletion that signs the person out, with the keyboard alone', async () => {
        const account = accountApi();
        await show({ account });

        const visited = await walkFrom(stopNamed(labels.deleteAccountConfirmationLabel), 1);
        await setInputValue(
            stopNamed(labels.deleteAccountConfirmationLabel) as HTMLInputElement,
            ACCOUNT.email,
        );
        await submitForm(getElement<HTMLFormElement>('form.delete-account'));
        await flushTimers();

        expect(visited).toEqual([labels.deleteAccountConfirmationLabel, labels.deleteAccount]);
        expect(account.deleteAccount).toHaveBeenCalledWith({ confirmation: ACCOUNT.email });
        expect(document.querySelector('form.auth-form')).not.toBeNull();
    });
});
