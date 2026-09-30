import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../app';
import type { AccountApi } from '../api/account-api';
import type { AccountDto, AuthApi } from '../api/auth-api';
import type { CredentialsApi } from '../api/credentials-api';
import type { ItemPageDto, ItemsApi } from '../api/items-api';
import { ApiError } from '../api/items-api';
import type { ProjectsApi } from '../api/projects-api';
import { labels } from '../labels';
import type { SaveFile } from '../save-file';
import { click, createReactTestRoot, getElement, setInputValue, submitForm } from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { createAttentionApi, startAt } from '../test/app-fixture';

const ACCOUNT: AccountDto = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};
// The document the API serves. The assertion is on the object itself and not on its content: what
// the page promises is to hand over what it received, without reading it back or serialising it
// again.
const DOCUMENT_EXPORTE = new Blob(['{"exportedAt":"2026-09-08T12:00:00.000Z"}'], {
    type: 'application/json',
});

let testRoot: ReactTestRoot;

function createItems(): ItemsApi {
    const page: ItemPageDto = { items: [], nextCursor: null };

    return {
        listItems: vi.fn(async () => page),
        createItem: vi.fn(),
        updateItem: vi.fn(),
        moveItem: vi.fn(),
        reorderItem: vi.fn(),
        deleteItem: vi.fn(),
    };
}

function createAuth(): AuthApi {
    return {
        register: vi.fn(),
        signIn: vi.fn(),
        currentAccount: vi.fn(async () => ACCOUNT),
        // No scenario of this section resets a password. The doubles are provided anyway, because
        // AuthApi requires them: leaving them out would let an unexpected call through instead of
        // reporting it.
        requestPasswordReset: vi.fn(),
        resetPassword: vi.fn(),
        // Nobody signs out in this section: same reason as above.
        signOut: vi.fn(),
    };
}

function createAccount(overrides: Partial<AccountApi> = {}): AccountApi {
    return {
        exportPersonalData: vi.fn(async () => DOCUMENT_EXPORTE),
        deleteAccount: vi.fn(async () => undefined),
        ...overrides,
    };
}

function createProjects(): ProjectsApi {
    return {
        listProjects: vi.fn(async () => ({ projects: [], nextCursor: null })),
        createProject: vi.fn(),
        deleteProject: vi.fn(),
    renameProject: vi.fn(),
    };
}

// Provided for the same reason as createAuth: no scenario of this section changes a credential, and
// a refusing double reports an unexpected call.
function createCredentials(): CredentialsApi {
    return {
        changePassword: vi.fn(),
        changeEmail: vi.fn(),
        confirmEmailChange: vi.fn(),
    };
}

async function afficher(account: AccountApi, save: SaveFile = vi.fn()): Promise<void> {
    // apps/web/index.html carries them; jsdom's blank document does not. Without them, the axe
    // check would report two gaps of the sandbox rather than of the page.
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';

    await testRoot.render(
        <App
            api={createItems()}
            auth={createAuth()}
            account={account}
            credentials={createCredentials()}
            projects={createProjects()}
            attention={createAttentionApi()}
            save={save}
        />,
    );
}

// The buttons are found by their label and not by a class: it is the word the person reads, and a
// class shared with another button would make the assertion silent the day it pointed at the wrong
// one.
function bouton(libelle: string): HTMLButtonElement {
    const trouve = [...document.querySelectorAll('button')].find(
        (candidat) => candidat.textContent?.trim() === libelle,
    );

    if (trouve === undefined) throw new Error(`Aucun bouton intitule ${libelle}.`);

    return trouve;
}

async function confirmerSuppression(saisie: string): Promise<void> {
    await setInputValue(getElement<HTMLInputElement>('#delete-account-confirmation'), saisie);
    await submitForm(getElement<HTMLFormElement>('form.delete-account'));
}

beforeEach(() => {
    testRoot = createReactTestRoot();
    startAt('account');
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('personal data section', () => {
    // The section lives in the screen already checked by todo-page.test.tsx, but it adds a form, a
    // field and a warning to it: the check is run again here on the whole screen rather than
    // assumed.
    it('has no automatically detectable WCAG A or AA violation', async () => {
        await afficher(createAccount());

        const resultats = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule gives no reliable result under jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(resultats.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('states what the deletion loses, before offering it', async () => {
        await afficher(createAccount());

        const pertes = getElement('.delete-account-losses').textContent ?? '';

        expect(pertes).toContain(labels.deleteAccountLosesItems);
        expect(pertes).toContain(labels.deleteAccountLosesProjects);
        expect(pertes).toContain(labels.deleteAccountLosesNotifications);
        expect(getElement('.delete-account-warning').textContent).toBe(labels.deleteAccountNoRecovery);
    });

    // #425: a shared project's items survive their creator's account, so the
    // warning must not claim other members lose access to them.
    it('says that shared items are kept, not lost, before the confirmation field', async () => {
        await afficher(createAccount());

        const losses = getElement('.delete-account-losses');
        const kept = getElement('.delete-account').textContent ?? '';
        const confirmation = getElement('#delete-account-confirmation');

        expect(losses.textContent).not.toMatch(/other members will lose access/);
        expect(kept).toContain(labels.deleteAccountKeepsShared);
        expect(losses.compareDocumentPosition(confirmation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    });

    describe('export', () => {
        it('hands the person the document served by the API', async () => {
            const save = vi.fn();
            await afficher(createAccount(), save);

            await click(bouton(labels.exportData));

            expect(save).toHaveBeenCalledWith(DOCUMENT_EXPORTE, labels.exportFilename);
        });

        it('reports an export the API refuses to serve', async () => {
            const save = vi.fn();
            const account = createAccount({
                exportPersonalData: vi.fn(() => Promise.reject(new ApiError(500, 'panne'))),
            });
            await afficher(account, save);

            await click(bouton(labels.exportData));

            expect(getElement('[role="alert"]').textContent).toBe('panne');
            expect(save).not.toHaveBeenCalled();
        });
    });

    describe('account deletion', () => {
        it('refuses an empty confirmation without asking the API anything', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression('');

            expect(getElement('#delete-account-confirmation-error').textContent).toBe(
                labels.deleteAccountConfirmationRequired,
            );
            expect(account.deleteAccount).not.toHaveBeenCalled();
        });

        // The click alone is not enough: the confirmation must designate the account, otherwise the
        // action is irreversible for a gesture that did not intend it.
        it('refuses an address that is not the account\'s', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression('quelqun-dautre@example.com');

            expect(getElement('#delete-account-confirmation-error').textContent).toBe(
                labels.deleteAccountConfirmationMismatch,
            );
            expect(account.deleteAccount).not.toHaveBeenCalled();
        });

        it('accepts the account\'s address whatever its case', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression(ACCOUNT.email.toUpperCase());

            expect(account.deleteAccount).toHaveBeenCalledWith({
                confirmation: ACCOUNT.email.toUpperCase(),
            });
        });

        // Deletion signs out immediately: the items screen disappears and the sign-in form replaces
        // it, without a reload.
        it('brings back the sign-in screen once the account is deleted', async () => {
            await afficher(createAccount());

            await confirmerSuppression(ACCOUNT.email);

            expect(document.querySelector('form.auth-form')).not.toBeNull();
            expect(document.querySelector('form.delete-account')).toBeNull();
        });

        it('keeps the person signed in when the deletion fails', async () => {
            const account = createAccount({
                deleteAccount: vi.fn(() => Promise.reject(new ApiError(500, 'panne'))),
            });
            await afficher(account);

            await confirmerSuppression(ACCOUNT.email);

            expect(getElement('[role="alert"]').textContent).toBe('panne');
            expect(document.querySelector('form.delete-account')).not.toBeNull();
        });
    });
});
