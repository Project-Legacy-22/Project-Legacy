import { describe, expect, it, vi } from 'vitest';

import { createReactTestRoot, focusOrder, pressKey, tab, tabbables } from './react-root';

// Le harnais est une simulation du clavier, et les tests de parcours lui font
// entierement confiance : une erreur ici ne casse rien, elle rend vrai un test
// qui devrait etre faux. C'est pour cette raison qu'il est teste a son tour,
// contre du DOM ecrit a la main plutot que contre un composant du produit --
// on verifie l'outil, pas ce qu'il mesure.

function poser(html: string): void {
    document.body.replaceChildren();
    const bac = document.createElement('div');
    bac.innerHTML = html;
    document.body.append(bac);
}

describe('nom accessible dans focusOrder', () => {
    it('nomme un champ par son etiquette, faute de contenu textuel', () => {
        poser(`
            <label for="courriel">Adresse electronique</label>
            <input id="courriel" name="email" />
        `);

        expect(focusOrder()).toEqual(['input:Adresse electronique']);
    });

    it('distingue deux champs du meme formulaire', () => {
        // La raison d'etre de la resolution du nom. Avec un repli sur le
        // contenu textuel, les deux champs s'appelleraient tous les deux la
        // chaine vide, et un test comparant cet ordre passerait encore apres
        // que quelqu'un ait echange les deux.
        poser(`
            <label for="mdp">Nouveau mot de passe</label>
            <input id="mdp" type="password" />
            <label for="confirmation">Confirmation</label>
            <input id="confirmation" type="password" />
        `);

        expect(focusOrder()).toEqual([
            'input:Nouveau mot de passe',
            'input:Confirmation',
        ]);
    });

    it('prefere aria-label a l etiquette associee', () => {
        poser(`
            <label for="q">Etiquette visible</label>
            <input id="q" aria-label="Nom explicite" />
        `);

        expect(focusOrder()).toEqual(['input:Nom explicite']);
    });

    it('ignore un aria-label vide au lieu de le prendre pour un nom', () => {
        // Le piege que la version precedente n'attrapait pas : ?? ne se
        // declenche pas sur une chaine vide, seulement sur null ou undefined.
        poser(`
            <label for="r">Etiquette visible</label>
            <input id="r" aria-label="  " />
        `);

        expect(focusOrder()).toEqual(['input:Etiquette visible']);
    });

    it('suit aria-labelledby', () => {
        poser(`
            <span id="titre">Rechercher une tache</span>
            <input aria-labelledby="titre" />
        `);

        expect(focusOrder()).toEqual(['input:Rechercher une tache']);
    });

    it('se rabat sur l attribut name quand rien ne nomme le champ', () => {
        poser('<input name="jeton" />');

        expect(focusOrder()).toEqual(['input:jeton']);
    });
});

describe('tabbables', () => {
    it('refuse de rendre un ordre quand un tabindex positif le reordonne', () => {
        // Echouer bruyamment plutot que rendre un ordre faux : un tabindex
        // positif deplace l'element sans que le DOM le montre, donc la
        // simulation mentirait.
        poser('<button>Un</button><button tabindex="2">Deux</button>');

        expect(() => tabbables()).toThrow(/tabindex positif/u);
    });

    it('retire les elements desactives', () => {
        poser('<button>Actif</button><button disabled>Inerte</button>');

        expect(focusOrder()).toEqual(['button:Actif']);
    });

    it('garde les elements marques aria-disabled', () => {
        // C'est tout l'interet du choix fait sur la pagination : aria-disabled
        // annonce l'indisponibilite sans retirer de l'ordre, donc sans faire
        // perdre le focus a qui s'y trouve.
        poser('<button aria-disabled="true">Page suivante</button>');

        expect(focusOrder()).toEqual(['button:Page suivante']);
    });

    it('retire les elements sortis de l ordre par tabindex negatif', () => {
        poser('<h1 tabindex="-1">Titre</h1><button>Continuer</button>');

        expect(focusOrder()).toEqual(['button:Continuer']);
    });

    it('garde un element masque visuellement mais toujours atteignable', () => {
        // Le lien d'evitement est exactement ce cas : invisible a l'ecran,
        // present au clavier. Le filtrer reviendrait a ne jamais le tester.
        poser('<a href="#main-content" class="visually-hidden">Aller au contenu</a>');

        expect(focusOrder()).toEqual(['a:Aller au contenu']);
    });
});

describe('tab', () => {
    it('entre par le premier element depuis le corps du document', async () => {
        poser('<button>Un</button><button>Deux</button>');

        expect((await tab())?.textContent).toBe('Un');
    });

    it('entre par le dernier element avec Maj', async () => {
        poser('<button>Un</button><button>Deux</button>');

        expect((await tab({ shift: true }))?.textContent).toBe('Deux');
    });

    it('avance puis recule sur le meme parcours', async () => {
        poser('<button>Un</button><button>Deux</button><button>Trois</button>');

        await tab();
        expect((await tab())?.textContent).toBe('Deux');
        expect((await tab({ shift: true }))?.textContent).toBe('Un');
    });

    it('boucle du dernier au premier, ce qu un navigateur ne fait pas', async () => {
        // Un vrai navigateur sortirait vers sa propre barre d'outils. La
        // simulation boucle, ce qui rend les parcours faciles a ecrire mais
        // interdit de conclure quoi que ce soit sur la sortie de la page.
        poser('<button>Un</button><button>Deux</button>');

        await tab();
        await tab();
        expect((await tab())?.textContent).toBe('Un');
    });

    it('rend null quand rien n est atteignable', async () => {
        poser('<p>Rien a atteindre</p>');

        expect(await tab()).toBeNull();
    });
});

describe('pressKey', () => {
    it('emet keydown puis keyup avec la touche demandee', async () => {
        poser('<button>Valider</button>');
        const bouton = document.querySelector('button') as HTMLButtonElement;
        const vues: string[] = [];
        bouton.addEventListener('keydown', event => vues.push(`down:${event.key}`));
        bouton.addEventListener('keyup', event => vues.push(`up:${event.key}`));

        await pressKey(bouton, 'Enter');

        expect(vues).toEqual(['down:Enter', 'up:Enter']);
    });

    it('remonte l evenement aux ancetres', async () => {
        // Les gestionnaires de React sont poses a la racine : sans remontee,
        // aucun parcours clavier du produit ne declencherait quoi que ce soit.
        poser('<div><button>Valider</button></div>');
        const ecoute = vi.fn();
        document.body.addEventListener('keydown', ecoute);

        await pressKey(document.querySelector('button') as HTMLButtonElement, 'Escape');

        expect(ecoute).toHaveBeenCalledOnce();
        document.body.removeEventListener('keydown', ecoute);
    });

    it('transmet les modificateurs', async () => {
        poser('<input />');
        const champ = document.querySelector('input') as HTMLInputElement;
        const vues: boolean[] = [];
        champ.addEventListener('keydown', event => vues.push(event.shiftKey));

        await pressKey(champ, 'Tab', { shiftKey: true });

        expect(vues).toEqual([true]);
    });
});

describe('createReactTestRoot', () => {
    it('vide le document au demontage, pour ne pas polluer le test suivant', async () => {
        const racine = createReactTestRoot();
        await racine.render(<button>Presente</button>);
        expect(document.querySelectorAll('button')).toHaveLength(1);

        await racine.unmount();

        expect(document.body.children).toHaveLength(0);
    });
});
