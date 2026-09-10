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

const ACCOUNT: AccountDto = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};
// Le document que l API sert. L assertion porte sur l objet lui-meme et non sur
// son contenu : ce que promet la page est de remettre ce qu elle a recu, sans le
// relire ni le reserialiser.
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
        deleteItem: vi.fn(),
    };
}

function createAuth(): AuthApi {
    return {
        register: vi.fn(),
        signIn: vi.fn(),
        currentAccount: vi.fn(async () => ACCOUNT),
        // Aucun scenario de cette section ne reinitialise de mot de passe. Les
        // doubles sont fournis quand meme, parce que AuthApi les exige : les
        // omettre laisserait passer un appel inattendu au lieu de le signaler.
        requestPasswordReset: vi.fn(),
        resetPassword: vi.fn(),
        // Personne ne se deconnecte dans cette section : meme raison que
        // ci-dessus.
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
    };
}

// Fourni pour la meme raison que createAuth : aucun scenario de cette section ne
// change d identifiant, et un double qui refuse signale un appel inattendu.
function createCredentials(): CredentialsApi {
    return {
        changePassword: vi.fn(),
        changeEmail: vi.fn(),
        confirmEmailChange: vi.fn(),
    };
}

async function afficher(account: AccountApi, save: SaveFile = vi.fn()): Promise<void> {
    // apps/web/index.html les porte ; le document vierge de jsdom, non. Sans
    // eux, le controle axe signalerait deux manques du bac a sable plutot que
    // de la page.
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';

    await testRoot.render(
        <App
            api={createItems()}
            auth={createAuth()}
            account={account}
            credentials={createCredentials()}
            projects={createProjects()}
            save={save}
        />,
    );
}

// Les boutons sont trouves par leur libelle et non par une classe : c est le mot
// que la personne lit, et une classe partagee avec un autre bouton rendrait
// l assertion muette le jour ou elle designerait le mauvais.
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
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('section des donnees personnelles', () => {
    // La section vit dans l ecran deja verifie par todo-page.test.tsx, mais elle
    // y ajoute un formulaire, un champ et une mise en garde : le controle est
    // relance ici sur l ecran complet plutot que suppose acquis.
    it('ne presente aucune violation WCAG A ou AA detectable automatiquement', async () => {
        await afficher(createAccount());

        const resultats = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documente que cette regle ne donne pas de resultat fiable
            // sous jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(resultats.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('enonce ce que la suppression fait perdre, avant de la proposer', async () => {
        await afficher(createAccount());

        const pertes = getElement('.delete-account-losses').textContent ?? '';

        expect(pertes).toContain(labels.deleteAccountLosesItems);
        expect(pertes).toContain(labels.deleteAccountLosesProjects);
        expect(pertes).toContain(labels.deleteAccountLosesNotifications);
        expect(getElement('.delete-account-warning').textContent).toBe(labels.deleteAccountNoRecovery);
    });

    it('warns that deleting the account also removes its items for other project members', async () => {
        await afficher(createAccount());

        const losses = getElement('.delete-account-losses');
        const confirmation = getElement('#delete-account-confirmation');

        expect(losses.textContent).toMatch(/shared projects/);
        expect(losses.textContent).toMatch(/other members will lose access/);
        expect(losses.compareDocumentPosition(confirmation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    });

    describe('export', () => {
        it('remet a la personne le document servi par l API', async () => {
            const save = vi.fn();
            await afficher(createAccount(), save);

            await click(bouton(labels.exportData));

            expect(save).toHaveBeenCalledWith(DOCUMENT_EXPORTE, labels.exportFilename);
        });

        it('signale un export que l API refuse de servir', async () => {
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

    describe('suppression du compte', () => {
        it('refuse une confirmation vide sans rien demander a l API', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression('');

            expect(getElement('#delete-account-confirmation-error').textContent).toBe(
                labels.deleteAccountConfirmationRequired,
            );
            expect(account.deleteAccount).not.toHaveBeenCalled();
        });

        // Le clic seul ne suffit pas : la confirmation doit designer le compte,
        // sinon l action est irreversible pour un geste qui ne l a pas voulue.
        it('refuse une adresse qui n est pas celle du compte', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression('quelqun-dautre@example.com');

            expect(getElement('#delete-account-confirmation-error').textContent).toBe(
                labels.deleteAccountConfirmationMismatch,
            );
            expect(account.deleteAccount).not.toHaveBeenCalled();
        });

        it('accepte l adresse du compte quelle que soit sa casse', async () => {
            const account = createAccount();
            await afficher(account);

            await confirmerSuppression(ACCOUNT.email.toUpperCase());

            expect(account.deleteAccount).toHaveBeenCalledWith({
                confirmation: ACCOUNT.email.toUpperCase(),
            });
        });

        // La suppression deconnecte immediatement : l ecran d items disparait et
        // le formulaire de connexion le remplace, sans rechargement.
        it('ramene a l ecran de connexion une fois le compte supprime', async () => {
            await afficher(createAccount());

            await confirmerSuppression(ACCOUNT.email);

            expect(document.querySelector('form.auth-form')).not.toBeNull();
            expect(document.querySelector('form.delete-account')).toBeNull();
        });

        it('garde la personne connectee quand la suppression echoue', async () => {
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
