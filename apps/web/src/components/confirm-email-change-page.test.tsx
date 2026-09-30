import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../app';
import type { CredentialsApi } from '../api/credentials-api';
import { ApiError } from '../api/items-api';
import { labels } from '../labels';
import { createApi, createAuth, createProjectsApi } from '../test/app-fixture';
import {
    accessibleName,
    click,
    createReactTestRoot,
    flushTimers,
    focusOrder,
    getElement,
    tab,
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
    // Set by hand, as in the other axe suites: jsdom does not load the real document, and without
    // them axe reports a page without a language or a title.
    document.documentElement.lang = 'en';
    document.title = 'Confirm your email address | Legacy 22';
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

describe('address change confirmation screen (US-36)', () => {
    it('shows the confirmation screen and clears the token from the URL', async () => {
        await afficher(createCredentials());

        expect(getElement('h1').textContent).toBe(labels.confirmEmailChangeTitle);
        expect(window.location.search).toBe('');
        expect(document.body.innerHTML).not.toContain('abc123');
    });

    it('wins over a live session', async () => {
        // createAuth() returns an account: without the link taking priority, the items screen would
        // show.
        await afficher(createCredentials());

        expect(document.querySelector('.session-banner')).toBeNull();
    });

    it('exchanges the link\'s token on an explicit click', async () => {
        const credentials = createCredentials();
        await afficher(credentials);

        await click(confirmButton());
        await flushTimers();

        expect(credentials.confirmEmailChange).toHaveBeenCalledWith({ token: 'abc123' });
        expect(getElement('[role="status"]').textContent).toBe(labels.confirmEmailChangeSucceeded);
    });

    it('shows the server\'s reason on an invalid link', async () => {
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

    // The keyboard path on its own: the three tests above reach the confirm
    // button with a click, which says nothing about what a person actually
    // reaches by tabbing (see reset-password-page.test.tsx for the same
    // reasoning on the sibling screen).
    it('can be walked to the confirm button with the keyboard, in reading order', async () => {
        await afficher(createCredentials());
        document.body.focus();

        const expected = focusOrder();
        expect(expected).toEqual([`button:${labels.confirmEmailChangeSubmit}`]);

        const visited: string[] = [];
        for (let step = 0; step < expected.length; step += 1) {
            const reached = await tab();
            if (reached !== null) {
                visited.push(`${reached.tagName.toLowerCase()}:${accessibleName(reached)}`);
            }
        }

        expect(visited).toEqual(expected);
    });

    it('puts the way back within keyboard reach once confirmed', async () => {
        await afficher(createCredentials());

        await click(confirmButton());
        await flushTimers();
        document.body.focus();

        const visited: string[] = [];
        for (let step = 0; step < focusOrder().length; step += 1) {
            const reached = await tab();
            if (reached !== null) visited.push(accessibleName(reached));
        }

        expect(visited).toContain(labels.backToSignIn);
    });

    it('has no automatically detectable WCAG A or AA violation', async () => {
        await afficher(createCredentials());

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule cannot produce reliable results in jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map(violation => violation.id)).toEqual([]);
    });
});
