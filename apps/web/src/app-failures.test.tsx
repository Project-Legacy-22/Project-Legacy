import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { authApi } from './api/auth-api';
import { labels } from './labels';
import { createApi, createAttentionApi, createCredentialsApi, createProjectsApi } from './test/app-fixture';
import { createReactTestRoot, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// #384, seen from the screen: the real client, and the network or the service
// failing underneath it. What reaches the alert is what a person reads.
let testRoot: ReactTestRoot;

function renderApp(): Promise<void> {
    return testRoot.render(
        <App
            api={createApi()}
            auth={authApi}
            credentials={createCredentialsApi()}
            projects={createProjectsApi()}
            attention={createAttentionApi()}
        />,
    );
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
    vi.unstubAllGlobals();
});

describe('App, when a request fails', () => {
    it('says the server is unreachable when the session check gets no answer', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

        await renderApp();

        const alert = getElement<HTMLElement>('[role="alert"]');
        expect(alert.querySelector('p')?.textContent).toBe(labels.serverUnreachable);
    });

    it('says the service is unavailable, and for how long, on a 503 with Retry-After', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 503, headers: { 'Retry-After': '30' } })),
        );

        await renderApp();

        const alert = getElement<HTMLElement>('[role="alert"]');
        expect(alert.querySelector('p')?.textContent).toBe(
            `${labels.sessionCheckFailed} The service is temporarily unavailable. Try again in 30 seconds.`,
        );
    });
});
