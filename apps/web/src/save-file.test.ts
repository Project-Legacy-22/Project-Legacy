import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from './save-file';

const DOCUMENT = new Blob(['{"exportedAt":"2026-09-08T12:00:00.000Z"}'], {
    type: 'application/json',
});
const OBJECT_URL = 'blob:http://localhost/an-object-url';

interface Download {
    href: string;
    download: string;
}

let downloaded: Download | undefined;

// The click is intercepted rather than left to bubble: jsdom implements no
// navigation and would report an error, whereas what the test wants to read is
// what the link carried at the moment of the click.
function interceptClick(event: Event): void {
    const link = event.target as HTMLAnchorElement;

    downloaded = { href: link.href, download: link.download };
    event.preventDefault();
}

// jsdom implements no object URLs. Both functions are stubbed here, which as
// a bonus lets the test observe what is created and what is released.
function stubObjectUrl(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
    const create = vi.fn(() => OBJECT_URL);
    const revoke = vi.fn();

    vi.stubGlobal(
        'URL',
        Object.assign(Object.create(URL) as typeof URL, {
            createObjectURL: create,
            revokeObjectURL: revoke,
        }),
    );

    return { create, revoke };
}

beforeEach(() => {
    downloaded = undefined;
    document.addEventListener('click', interceptClick, true);
});

afterEach(() => {
    document.removeEventListener('click', interceptClick, true);
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('saveFile', () => {
    it('offers the content for download under the requested name', () => {
        const { create } = stubObjectUrl();

        saveFile(DOCUMENT, 'export.json');

        expect(create).toHaveBeenCalledWith(DOCUMENT);
        expect(downloaded).toEqual({ href: OBJECT_URL, download: 'export.json' });
    });

    // A link left in the page, or an object URL never released, would hold the
    // document in memory for the whole session.
    it('leaves behind neither a link nor an object URL', () => {
        const { revoke } = stubObjectUrl();

        saveFile(DOCUMENT, 'export.json');

        expect(document.querySelector('a')).toBeNull();
        expect(revoke).toHaveBeenCalledWith(OBJECT_URL);
    });
});
