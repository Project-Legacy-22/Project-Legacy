import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../app';
import type { CredentialsApi } from '../api/credentials-api';
import { ApiError } from '../api/items-api';
import { labels } from '../labels';
import {
    ACCOUNT,
    createApi,
    createAuth,
    createProjectsApi,
} from '../test/app-fixture';
import {
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
} from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';

let testRoot: ReactTestRoot;

function createCredentials(overrides: Partial<CredentialsApi> = {}): CredentialsApi {
    return {
        changePassword: vi.fn(async () => undefined),
        changeEmail: vi.fn(async () => undefined),
        confirmEmailChange: vi.fn(async () => undefined),
        ...overrides,
    };
}

async function afficher(credentials: CredentialsApi): Promise<void> {
    document.documentElement.lang = 'en';
    document.title = 'Todo list | Legacy 22';
    await testRoot.render(
        <App
            api={createApi()}
            auth={createAuth()}
            credentials={credentials}
            projects={createProjectsApi()}
        />,
    );
    await flushTimers();
}

function fieldErrors(): (string | null)[] {
    return [...document.querySelectorAll('.field-error')].map(node => node.textContent);
}

function formOf(headingId: string): HTMLFormElement {
    const form = getElement(`#${headingId}`).closest('form');
    if (form === null) throw new Error(`No form around #${headingId}.`);
    return form;
}

async function changerMotDePasse(actuel: string, nouveau: string): Promise<void> {
    await setInputValue(getElement<HTMLInputElement>('input[autocomplete="current-password"]'), actuel);
    await setInputValue(getElement<HTMLInputElement>('input[autocomplete="new-password"]'), nouveau);
    await submitForm(formOf('change-password-heading'));
    await flushTimers();
}

async function changerAdresse(nouvelle: string): Promise<void> {
    await setInputValue(getElement<HTMLInputElement>('input[autocomplete="email"]'), nouvelle);
    await submitForm(formOf('change-email-heading'));
    await flushTimers();
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('section des identifiants (US-36)', () => {
    it('ne presente aucune violation WCAG A ou AA detectable automatiquement', async () => {
        await afficher(createCredentials());

        const resultats = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(resultats.violations.map(violation => violation.id)).toEqual([]);
    });

    it('se place au-dessus de la section de suppression du compte', async () => {
        await afficher(createCredentials());

        const identifiants = getElement('#credentials-heading');
        const donnees = getElement('#personal-data-heading');

        expect(
            identifiants.compareDocumentPosition(donnees) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).not.toBe(0);
    });

    describe('changement de mot de passe', () => {
        it('exige le mot de passe actuel et transmet les deux', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerMotDePasse('AncienMotDePasse1', 'NouveauMotDePasse2');

            expect(credentials.changePassword).toHaveBeenCalledWith({
                currentPassword: 'AncienMotDePasse1',
                newPassword: 'NouveauMotDePasse2',
            });
            expect(getElement('.form-success').textContent).toBe(labels.passwordChanged);
        });

        it('refuse un mot de passe actuel vide sans appeler l API', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerMotDePasse('', 'NouveauMotDePasse2');

            expect(fieldErrors()).toContain(labels.currentPasswordRequired);
            expect(credentials.changePassword).not.toHaveBeenCalled();
        });

        it('refuse un nouveau mot de passe trop court sans appeler l API', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerMotDePasse('AncienMotDePasse1', 'Court1');

            expect(
                fieldErrors(),
            ).toContain(labels.passwordTooShort(12));
            expect(credentials.changePassword).not.toHaveBeenCalled();
        });

        it('affiche la raison du serveur sur un mot de passe actuel refuse', async () => {
            const credentials = createCredentials({
                changePassword: vi.fn(() =>
                    Promise.reject(new ApiError(403, 'The current password is incorrect.')),
                ),
            });
            await afficher(credentials);

            await changerMotDePasse('PasLeBon9A', 'NouveauMotDePasse2');

            expect(getElement('.form-error').textContent).toBe('The current password is incorrect.');
        });
    });

    describe('changement d adresse', () => {
        it('transmet la nouvelle adresse et repond de facon neutre', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerAdresse('alice.neuf@example.com');

            expect(credentials.changeEmail).toHaveBeenCalledWith({
                newEmail: 'alice.neuf@example.com',
            });
            expect(getElement('.form-success').textContent).toBe(labels.emailChangeRequested);
        });

        it('refuse une adresse malformee sans appeler l API', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerAdresse('pas-une-adresse');

            expect(
                fieldErrors(),
            ).toContain(labels.emailInvalid);
            expect(credentials.changeEmail).not.toHaveBeenCalled();
        });

        it('ne change pas l adresse affichee dans le bandeau', async () => {
            const credentials = createCredentials();
            await afficher(credentials);

            await changerAdresse('alice.neuf@example.com');

            expect(getElement('.session-banner').textContent).toContain(ACCOUNT.email);
        });
    });
});
