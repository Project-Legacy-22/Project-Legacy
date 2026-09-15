import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../app';
import type { CredentialsApi } from '../api/credentials-api';
import { ApiError } from '../api/items-api';
import { labels } from '../labels';
import { createApi, createAuth, createProjectsApi } from '../test/app-fixture';
import { click, createReactTestRoot, flushTimers, getElement } from '../test/react-root';
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

function confirmButton(): HTMLButtonElement {
    const found = [...document.querySelectorAll('button')].find(
        candidate => candidate.textContent?.trim() === labels.confirmEmailChangeSubmit,
    );
    if (found === undefined) throw new Error('No confirm button.');
    return found;
}

beforeEach(() => {
    testRoot = createReactTestRoot();
    window.history.replaceState(null, '', '/?token_hash=abc123&type=email_change');
});

afterEach(async () => {
    await testRoot.unmount();
    window.history.replaceState(null, '', '/');
});

describe('ecran de confirmation du changement d adresse (US-36)', () => {
    it('montre l ecran de confirmation et efface le jeton de l URL', async () => {
        await afficher(createCredentials());

        expect(getElement('h1').textContent).toBe(labels.confirmEmailChangeTitle);
        expect(window.location.search).toBe('');
        expect(document.body.innerHTML).not.toContain('abc123');
    });

    it('gagne sur une session vivante', async () => {
        // createAuth() rend un compte : sans la priorite du lien, l ecran des
        // items s afficherait.
        await afficher(createCredentials());

        expect(document.querySelector('.session-banner')).toBeNull();
    });

    it('echange le jeton du lien sur un clic explicite', async () => {
        const credentials = createCredentials();
        await afficher(credentials);

        await click(confirmButton());
        await flushTimers();

        expect(credentials.confirmEmailChange).toHaveBeenCalledWith({ token: 'abc123' });
        expect(getElement('[role="status"]').textContent).toBe(labels.confirmEmailChangeSucceeded);
    });

    it('affiche la raison du serveur sur un lien invalide', async () => {
        const credentials = createCredentials({
            confirmEmailChange: vi.fn(() =>
                Promise.reject(
                    new ApiError(400, 'This confirmation link is invalid or has expired.'),
                ),
            ),
        });
        await afficher(credentials);

        await click(confirmButton());
        await flushTimers();

        expect(getElement('[role="alert"]').textContent).toBe(
            'This confirmation link is invalid or has expired.',
        );
    });
});
