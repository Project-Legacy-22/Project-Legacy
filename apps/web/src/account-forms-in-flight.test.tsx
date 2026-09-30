import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountApi } from './api/account-api';
import type { CredentialsApi } from './api/credentials-api';
import { App } from './app';
import { labels } from './labels';
import { ACCOUNT, createApi, createAuth, createCredentialsApi, createProjectsApi, startAt } from './test/app-fixture';
import { deferred } from './test/deferred';
import {
    accessibleName,
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
    tabbables,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// The account forms while their request is in flight (#368). A disabled
// control leaves the tab order, and the focus fixup rule of the HTML standard
// then drops the focus to the body: someone who submitted with the keyboard
// starts again from the top. jsdom does not apply that rule, so these tests
// guard its cause, as the export test of account-keyboard-journey does: every
// control stays reachable, and a second submission never reaches the API.

const SECTIONS = '[aria-labelledby="credentials-heading"], [aria-labelledby="personal-data-heading"]';

let root: ReactTestRoot;

function accountApi(overrides: Partial<AccountApi> = {}): AccountApi {
    return {
        exportPersonalData: vi.fn(async () => new Blob(['{}'])),
        deleteAccount: vi.fn(async () => undefined),
        ...overrides,
    };
}

async function show(doubles: { account?: AccountApi; credentials?: CredentialsApi }): Promise<void> {
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';
    await root.render(
        <App
            api={createApi()}
            auth={createAuth()}
            account={doubles.account ?? accountApi()}
            credentials={doubles.credentials ?? createCredentialsApi()}
            projects={createProjectsApi()}
            save={vi.fn()}
        />,
    );
    await flushTimers();
}

function reachable(): string[] {
    return tabbables()
        .filter((stop) => stop.closest(SECTIONS) !== null)
        .map(accessibleName);
}

function field(name: string): HTMLInputElement {
    const found = tabbables().find((stop) => accessibleName(stop) === name);
    if (!(found instanceof HTMLInputElement)) throw new Error(`No field named ${name}`);
    return found;
}

function formOf(headingId: string): HTMLFormElement {
    const form = getElement(`#${headingId}`).closest('form');
    if (form === null) throw new Error(`No form around #${headingId}`);
    return form;
}

beforeEach(() => {
    root = createReactTestRoot();
    // The account forms are in their own view since #446.
    startAt('account');
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('account forms while their request is in flight', () => {
    it('keeps the email field and its button reachable, and sends the change once', async () => {
        const pending = deferred<undefined>();
        const changeEmail = vi.fn(() => pending.promise);
        await show({ credentials: createCredentialsApi({ changeEmail }) });
        await setInputValue(field(labels.newEmailLabel), 'new@example.com');

        await submitForm(formOf('change-email-heading'));
        await submitForm(formOf('change-email-heading'));

        expect(reachable()).toEqual(expect.arrayContaining([labels.newEmailLabel, labels.changingEmail]));
        expect(field(labels.newEmailLabel).readOnly).toBe(true);
        expect(changeEmail).toHaveBeenCalledOnce();
        pending.resolve(undefined);
        await flushTimers();
    });

    it('keeps both password fields and their button reachable, and sends the change once', async () => {
        const pending = deferred<undefined>();
        const changePassword = vi.fn(() => pending.promise);
        await show({ credentials: createCredentialsApi({ changePassword }) });
        await setInputValue(field(labels.currentPasswordLabel), 'Current2026-ok');
        await setInputValue(field(labels.newPasswordLabel), 'Defence2026-ok');

        await submitForm(formOf('change-password-heading'));
        await submitForm(formOf('change-password-heading'));

        expect(reachable()).toEqual(
            expect.arrayContaining([labels.currentPasswordLabel, labels.newPasswordLabel, labels.changingPassword]),
        );
        expect(changePassword).toHaveBeenCalledOnce();
        pending.resolve(undefined);
        await flushTimers();
    });

    it('keeps the deletion field and its button reachable, and asks for the deletion once', async () => {
        const pending = deferred<undefined>();
        const account = accountApi({ deleteAccount: vi.fn(() => pending.promise) });
        await show({ account });
        await setInputValue(field(labels.deleteAccountConfirmationLabel), ACCOUNT.email);

        await submitForm(formOf('delete-account-heading'));
        await submitForm(formOf('delete-account-heading'));

        expect(reachable()).toEqual(
            expect.arrayContaining([labels.deleteAccountConfirmationLabel, labels.deletingAccount]),
        );
        expect(getElement('form.delete-account button[type="submit"]').getAttribute('aria-disabled')).toBe('true');
        expect(account.deleteAccount).toHaveBeenCalledOnce();
        pending.resolve(undefined);
        await flushTimers();
    });
});
