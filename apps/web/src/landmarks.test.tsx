import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createProjectsApi, itemPage } from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import {
    accessibleName,
    createReactTestRoot,
    flushTimers,
    getElement,
    tabbables,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// Two gaps the audit of #181 recorded and nothing held.
//
// Gap 3: the session banner and the notifications panel were rendered as
// siblings of the page, so neither was inside a landmark, and a reader
// navigating by region could not reach the identity, the unread count or the
// way out. todo-page.tsx says in as many words that its children prop exists
// to avoid exactly that.
//
// Gap 6: every axe suite sets document.documentElement.lang and document.title
// by hand, because jsdom loads no real document. apps/web/index.html does
// carry both -- and no test read it, so the suites would have stayed green if
// the file had lost them.

// What HTML exposes as a landmark. A `section` only becomes one when it has an
// accessible name, which is why naming the two blocks was the fix rather than
// wrapping them in something new.
const LANDMARKS = [
    'main',
    'header',
    'footer',
    'nav',
    'aside',
    'form[aria-label]',
    'form[aria-labelledby]',
    'section[aria-label]',
    'section[aria-labelledby]',
    '[role="region"]',
    '[role="banner"]',
    '[role="main"]',
    '[role="navigation"]',
    '[role="contentinfo"]',
].join(',');

let root: ReactTestRoot;

async function renderSignedIn(): Promise<void> {
    const api = createApi({
        listItems: vi.fn(async () => itemPage([anItem({ name: 'Prepare the defence' })])),
    });
    await root.render(<App api={api} auth={createAuth()} projects={createProjectsApi()} />);
    await flushTimers();
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('every control sits inside a landmark', () => {
    it('leaves no reachable control outside one, on the signed-in screen', async () => {
        await renderSignedIn();

        const orphans = tabbables()
            // The skip link is the exception, and it has to be: it must be the
            // first stop of the page, before the landmark it skips into exists
            // in the tab order. Hiding it inside `main` would make it
            // reachable only after the content it exists to skip.
            .filter(control => !control.classList.contains('skip-link'))
            .filter(control => control.closest(LANDMARKS) === null)
            .map(control => `${control.tagName.toLowerCase()}: ${accessibleName(control)}`);

        expect(orphans).toEqual([]);
    });

    it('exposes the session banner as a named region', async () => {
        await renderSignedIn();

        const banner = getElement<HTMLElement>('.session-banner');

        expect(banner.tagName.toLowerCase()).toBe('section');
        expect(banner.getAttribute('aria-label')).toBe(labels.sessionRegion);
    });

    it('exposes the notifications panel as a named region', async () => {
        await renderSignedIn();

        const panel = getElement<HTMLElement>('.notifications-panel');

        expect(panel.getAttribute('aria-label')).toBe(labels.notificationsTitle);
    });

    // Gap 5 of the same audit: aria-label is only reliably exposed on an
    // element carrying a widget or landmark role. On a paragraph the count was
    // announced twice or not at all, so the sentence moved into the content.
    it('reads the task count from its content, not from a label on a paragraph', async () => {
        await renderSignedIn();

        const count = getElement<HTMLElement>('.item-count');

        expect(count.hasAttribute('aria-label')).toBe(false);
        expect(count.textContent).toContain(labels.itemCount(1));
    });
});

describe('the document the application is served in', () => {
    // Read from the file, not from the DOM: the suites set both by hand, so
    // asserting them on `document` would only confirm the setup.
    const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');

    it('declares the language of the page', () => {
        expect(html).toMatch(/<html[^>]*\slang="[a-z]{2}(-[A-Za-z]+)?"/u);
    });

    it('carries a title that names the page and the product', () => {
        const title = /<title>([^<]+)<\/title>/u.exec(html);

        expect(title?.[1]?.trim()).toBeTruthy();
        expect(title?.[1]).toContain(labels.productName);
    });
});
