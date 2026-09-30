import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createCredentialsApi } from './test/app-fixture';
import { click, createReactTestRoot, flushTimers } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// Each signed-out screen names itself in the tab title (#454, RGAA 8.6). They
// all used to carry index.html's title, so two tabs, a bookmark or the history
// could not tell the sign-in page from the privacy policy.

const BASE = 'Todo list | Legacy 22';
const titled = (screen: string) => `${screen} | ${BASE}`;

let root: ReactTestRoot;

async function renderSignedOut(): Promise<void> {
    await root.render(
        <App
            api={createApi()}
            auth={createAuth({ currentAccount: vi.fn(async () => null) })}
            credentials={createCredentialsApi()}
        />,
    );
    await flushTimers();
}

function button(text: string): HTMLButtonElement {
    const found = [...document.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === text);
    if (found === undefined) throw new Error(`No button reads ${text}.`);
    return found;
}

beforeEach(() => {
    // What index.html serves, which the application starts from.
    document.title = BASE;
    window.history.replaceState(null, '', '/');
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('the tab title of the signed-out screens', () => {
    it('names the sign-in page, and follows it to account creation and back', async () => {
        await renderSignedOut();
        expect(document.title).toBe(titled(labels.signInTitle));

        await click(button(labels.switchToRegister));
        expect(document.title).toBe(titled(labels.registerTitle));

        await click(button(labels.switchToSignIn));
        expect(document.title).toBe(titled(labels.signInTitle));
    });

    it('names the reset request', async () => {
        await renderSignedOut();

        await click(button(labels.forgotPasswordLink));

        expect(document.title).toBe(titled(labels.requestResetTitle));
    });

    it('names the privacy policy, and gives the sign-in page its title back on leaving it', async () => {
        window.history.replaceState(null, '', '/?privacy');
        await renderSignedOut();
        expect(document.title).toBe(titled(labels.privacyPolicyTitle));

        await click(button(labels.policyBack));

        expect(document.title).toBe(titled(labels.signInTitle));
    });

    it('names the page a recovery link opens', async () => {
        window.history.replaceState(null, '', '/?token_hash=abc123&type=recovery');
        await renderSignedOut();

        expect(document.title).toBe(titled(labels.resetPasswordTitle));
    });

    it('names the page an email change link opens', async () => {
        window.history.replaceState(null, '', '/?token_hash=abc123&type=email_change');
        await renderSignedOut();

        expect(document.title).toBe(titled(labels.confirmEmailChangeTitle));
    });

    it('puts the served title back once the screen is gone', async () => {
        await renderSignedOut();

        await root.unmount();
        root = createReactTestRoot();

        expect(document.title).toBe(BASE);
    });
});
