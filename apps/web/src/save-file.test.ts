import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from './save-file';

const DOCUMENT = new Blob(['{"exportedAt":"2026-09-08T12:00:00.000Z"}'], {
    type: 'application/json',
});
const URL_OBJET = 'blob:http://localhost/an-object-url';

interface Telechargement {
    href: string;
    download: string;
}

let telecharge: Telechargement | undefined;

// Le clic est intercepte plutot que laisse remonter : jsdom n implemente pas la
// navigation et signalerait une erreur, alors que ce que le test veut lire est
// ce que le lien portait au moment du clic.
function interceptClick(event: Event): void {
    const lien = event.target as HTMLAnchorElement;

    telecharge = { href: lien.href, download: lien.download };
    event.preventDefault();
}

// jsdom n implemente pas les URL d objet. Les deux fonctions sont donc posees
// ici, ce qui permet en prime d observer ce qui est cree et ce qui est libere.
function stubObjectUrl(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
    const create = vi.fn(() => URL_OBJET);
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
    telecharge = undefined;
    document.addEventListener('click', interceptClick, true);
});

afterEach(() => {
    document.removeEventListener('click', interceptClick, true);
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('saveFile', () => {
    it('propose le contenu au telechargement sous le nom demande', () => {
        const { create } = stubObjectUrl();

        saveFile(DOCUMENT, 'export.json');

        expect(create).toHaveBeenCalledWith(DOCUMENT);
        expect(telecharge).toEqual({ href: URL_OBJET, download: 'export.json' });
    });

    // Un lien laisse dans la page, ou une URL d objet jamais liberee, retiendrait
    // le document en memoire pour toute la duree de la session.
    it('ne laisse derriere lui ni lien ni URL d objet', () => {
        const { revoke } = stubObjectUrl();

        saveFile(DOCUMENT, 'export.json');

        expect(document.querySelector('a')).toBeNull();
        expect(revoke).toHaveBeenCalledWith(URL_OBJET);
    });
});
