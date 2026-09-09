import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTRAST_PAIRS, EXEMPT, FOCUS_SURFACES } from './contrast-pairs';

// Le contraste n'est verifie par aucun autre test. axe sait le calculer, mais
// sa regle color-contrast est desactivee partout dans la suite parce que jsdom
// ne fait pas de rendu : il n'y a ni cascade ni couleur calculee a lire.
//
// Ce test contourne l'obstacle par le haut. Il ne demande rien au DOM : il lit
// le texte de tokens.css sur le disque et applique la formule de luminance
// relative de WCAG aux couples declares. La lecture passe par node:fs et non
// par un import ?raw, que Vitest ne transforme pas : le test ne depend ainsi
// d'aucune configuration de bundler. Ce qu'il verifie
// est donc la palette telle qu'elle est ecrite, pas telle qu'elle est composee
// a l'ecran -- l'opacite d'un controle desactive et les etats survoles restent
// hors de portee, et c'est le role des tests navigateur de EN-26.

const SEUILS = { text: 4.5, ui: 3 } as const;

function jetons(css: string): ReadonlyMap<string, string> {
    // Le premier bloc :root seulement. Un second bloc, un jour, serait une
    // redefinition conditionnelle qu'il faudrait verifier separement.
    const bloc = /:root\s*\{([^}]*)\}/u.exec(css);
    if (bloc === null) throw new Error('tokens.css ne declare aucun bloc :root');

    // noUncheckedIndexedAccess rend chaque groupe capture optionnel. Le motif
    // garantit leur presence, le typage ne le sait pas : on le verifie plutot
    // que de le lui affirmer.
    const declarations = bloc[1] ?? '';
    const trouves = new Map<string, string>();
    for (const [, nom, valeur] of declarations.matchAll(
        /(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/giu,
    )) {
        if (nom === undefined || valeur === undefined) continue;
        trouves.set(nom.toLowerCase(), valeur.toLowerCase());
    }
    return trouves;
}

const PALETTE = jetons(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));

function valeur(nom: string): string {
    const trouve = PALETTE.get(nom);
    // Nommer le jeton manquant plutot que de calculer sur une valeur vide : une
    // faute de frappe dans la liste produirait sinon un ratio absurde au lieu
    // d'une erreur lisible.
    if (trouve === undefined) throw new Error(`jeton absent de tokens.css : ${nom}`);
    return trouve;
}

function luminance(hex: string): number {
    const canaux = [1, 3, 5].map(depart => Number.parseInt(hex.slice(depart, depart + 2), 16) / 255);
    const [rouge, vert, bleu] = canaux.map(canal =>
        canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4,
    ) as [number, number, number];

    return 0.2126 * rouge + 0.7152 * vert + 0.0722 * bleu;
}

function ratio(premier: string, second: string): number {
    const [haut, bas] = [luminance(premier), luminance(second)].sort((a, b) => b - a) as [
        number,
        number,
    ];
    // Arrondi vers le bas : 4.499 ne doit pas s'afficher 4.50 a cote d'un seuil
    // de 4.5 et laisser croire que le couple passe de justesse.
    return Math.floor(((haut + 0.05) / (bas + 0.05)) * 100) / 100;
}

describe('contraste de la palette', () => {
    it.each(CONTRAST_PAIRS)(
        'tient $requirement sur $foreground contre $background ($where)',
        ({ foreground, background, requirement }) => {
            expect(ratio(valeur(foreground), valeur(background))).toBeGreaterThanOrEqual(
                SEUILS[requirement],
            );
        },
    );

    // Les trois tests suivants empechent la liste de se perimer. Sans eux, une
    // couleur ajoutee ailleurs ou un jeton oublie passeraient inapercus, et la
    // specification decrirait une palette qui n'existe plus.

    it('ne laisse aucun jeton hors de la specification', () => {
        const decrits = new Set([
            ...CONTRAST_PAIRS.flatMap(({ foreground, background }) => [foreground, background]),
            ...EXEMPT.map(({ token }) => token),
            ...FOCUS_SURFACES,
            '--focus-ring',
            '--focus-halo',
        ]);

        expect([...PALETTE.keys()].filter(nom => !decrits.has(nom))).toEqual([]);
    });

    it('exige une raison ecrite pour chaque exemption', () => {
        expect(EXEMPT.filter(({ reason }) => reason.trim().length < 40)).toEqual([]);
    });

    // L'indicateur de focus est un anneau blanc double d'un halo bleu. Il suffit
    // que l'un des deux ressorte : c'est ce qui le rend lisible aussi bien sur
    // l'en-tete sombre que sur un panneau blanc. Exiger les deux ferait echouer
    // une conception correcte, ce qui est la pire facon de rater un test
    // d'accessibilite.
    it.each(FOCUS_SURFACES)('garde le focus visible sur %s', surface => {
        const fond = valeur(surface);
        const meilleur = Math.max(
            ratio(valeur('--focus-ring'), fond),
            ratio(valeur('--focus-halo'), fond),
        );

        expect(meilleur).toBeGreaterThanOrEqual(SEUILS.ui);
        // Les deux anneaux doivent aussi se distinguer l'un de l'autre, sans
        // quoi l'indicateur se lit comme un trait unique et perd sa moitie.
        expect(ratio(valeur('--focus-ring'), valeur('--focus-halo'))).toBeGreaterThanOrEqual(
            SEUILS.ui,
        );
    });
});
