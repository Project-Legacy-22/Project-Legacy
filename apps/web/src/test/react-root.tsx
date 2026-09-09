import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

export interface ReactTestRoot {
    render: (node: ReactNode) => Promise<void>;
    unmount: () => Promise<void>;
}

export function createReactTestRoot(): ReactTestRoot {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
        configurable: true,
        value: true,
    });

    document.body.replaceChildren();
    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    return {
        async render(node) {
            await act(async () => root.render(node));
        },
        async unmount() {
            await act(async () => root.unmount());
            document.body.replaceChildren();
        },
    };
}

export function getElement<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (element === null) throw new Error(`Expected element ${selector}.`);
    return element;
}

export async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (valueSetter === undefined) throw new Error('The input value setter is unavailable.');

    await act(async () => {
        valueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

export async function submitForm(form: HTMLFormElement): Promise<void> {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
}

export async function click(element: HTMLElement): Promise<void> {
    await act(async () => {
        element.click();
        await Promise.resolve();
    });
}

export async function flushTimers(): Promise<void> {
    await act(async () => new Promise(resolve => globalThis.setTimeout(resolve, 0)));
}

// Le clavier.
//
// jsdom n'implemente pas la navigation sequentielle : appuyer sur Tab n'y
// deplace rien. Ces quatre aides la simulent, ce qui est une simulation et non
// le navigateur -- elles ignorent inert, le shadow DOM, contenteditable et les
// iframes, dont aucun n'existe dans cette interface. Le jour ou l'un d'eux
// apparait, ce commentaire est le rappel qu'il faut revoir ces aides.
//
// Elles vivent ici plutot que dans @testing-library/user-event : ce sont
// quarante lignes, la suite interroge le DOM par selecteur, et introduire un
// second idiome pour la moitie des tests couterait plus que ce qu'il apporte.
// Le jour ou un tableau Kanban amenera un roving tabindex, la question se
// reposera -- et la, la dependance gagnera sa place.

const FOCUSABLES = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[tabindex]',
].join(',');

export async function pressKey(
    element: HTMLElement,
    key: string,
    init: KeyboardEventInit = {},
): Promise<void> {
    await act(async () => {
        const commun = { key, bubbles: true, cancelable: true, ...init };
        element.dispatchEvent(new KeyboardEvent('keydown', commun));
        element.dispatchEvent(new KeyboardEvent('keyup', commun));
        await Promise.resolve();
    });
}

// Ce que Tab visiterait, dans l'ordre du document.
//
// aria-disabled ne retire pas de l'ordre de tabulation, contrairement a
// disabled : c'est tout l'interet du choix fait sur le bouton de pagination,
// qui garde le focus au lieu de le perdre en devenant inerte.
export function tabbables(root: ParentNode = document): HTMLElement[] {
    const candidats = [...root.querySelectorAll<HTMLElement>(FOCUSABLES)];

    const positif = candidats.find(element => Number(element.getAttribute('tabindex')) > 0);
    if (positif !== undefined) {
        // Un tabindex positif reordonne le parcours sans que le DOM le montre.
        // Il n'y en a aucun aujourd'hui ; le jour ou il y en a un, ces aides
        // mentiraient. Mieux vaut echouer bruyamment que rendre un ordre faux.
        throw new Error(`tabindex positif sur ${positif.tagName.toLowerCase()} : ordre non simulable.`);
    }

    return candidats.filter(element => {
        if (element.hasAttribute('disabled')) return false;
        if (element.getAttribute('tabindex') === '-1') return false;
        // Un element retire de l'affichage par .visually-hidden reste focusable
        // -- c'est le cas du lien d'evitement -- donc on ne filtre pas dessus.
        return true;
    });
}

export async function tab({ shift = false } = {}): Promise<HTMLElement | null> {
    const parcours = tabbables();
    const courant = document.activeElement;
    const depart = courant instanceof HTMLElement ? parcours.indexOf(courant) : -1;

    // Depuis le body, Tab entre par le premier et Maj+Tab par le dernier.
    const suivant = shift
        ? (depart <= 0 ? parcours.length : depart) - 1
        : (depart + 1) % parcours.length;

    const cible = parcours[suivant] ?? null;
    if (cible !== null) await act(async () => cible.focus());
    return cible;
}

// Le nom accessible, resolu dans l'ordre ou l'arbre d'accessibilite le fait :
// aria-label, puis aria-labelledby, puis l'etiquette associee, puis le contenu.
//
// L'etiquette compte parce qu'un champ n'a pas de contenu textuel : sans elle,
// tous les champs d'un formulaire portent le meme nom vide et deviennent
// indistinguables dans un ordre de tabulation. Un test qui les compare passerait
// alors meme si deux champs etaient echanges.

// Une source ne nomme rien quand elle est absente, et pas davantage quand elle
// est vide : un aria-label rempli d'espaces est un oubli, pas un nom. C'est ce
// que ?? seul ne voyait pas, un champ recevant alors la chaine vide.
function premierNonVide(...sources: (string | null | undefined)[]): string {
    for (const source of sources) {
        const propre = source?.trim();
        if (propre !== undefined && propre !== '') return propre;
    }
    return '';
}

// Seuls les controles de formulaire portent une etiquette associee, et c'est
// leur seul nom : ils n'ont pas de contenu textuel.
function etiquetteAssociee(element: HTMLElement): string | null | undefined {
    const controle =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement;

    return controle ? element.labels?.[0]?.textContent : undefined;
}

export function nomAccessible(element: HTMLElement): string {
    const reference = element.getAttribute('aria-labelledby');

    return premierNonVide(
        element.getAttribute('aria-label'),
        reference === null ? undefined : document.getElementById(reference)?.textContent,
        etiquetteAssociee(element),
        element.textContent,
        element.getAttribute('name'),
    );
}

// L'ordre de tabulation sous une forme lisible dans un echec de test :
// le nom accessible plutot que le noeud, qui ne dit rien une fois affiche.
export function focusOrder(root: ParentNode = document): string[] {
    return tabbables(root).map(
        element => `${element.tagName.toLowerCase()}:${nomAccessible(element).slice(0, 40)}`,
    );
}
