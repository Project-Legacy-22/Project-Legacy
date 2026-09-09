import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    click,
    createReactTestRoot,
    focusOrder,
    nomAccessible,
    getElement,
    setInputValue,
    submitForm,
    tab,
} from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import type { SubmitResult } from '../hooks/use-session';
import { RequestResetForm } from './request-reset-form';

let testRoot: ReactTestRoot;

const accepted = (): Promise<SubmitResult> =>
    Promise.resolve({ status: 'success', message: labels.resetRequestAccepted });

async function render(
    onSubmit: (email: string) => Promise<SubmitResult> = accepted,
    onBack: () => void = vi.fn(),
) {
    const submit = vi.fn(onSubmit);
    document.documentElement.lang = 'en';
    document.title = 'Legacy 22';
    await testRoot.render(
        <RequestResetForm isSubmitting={false} onSubmit={submit} onBack={onBack} />,
    );
    return { onSubmit: submit, onBack };
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('RequestResetForm', () => {
    it('requires an email address', async () => {
        const { onSubmit } = await render();

        await submitForm(getElement('form'));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(labels.emailRequired);
    });

    it('submits the trimmed address', async () => {
        const { onSubmit } = await render();

        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), '  ada@example.com ');
        await submitForm(getElement('form'));

        expect(onSubmit).toHaveBeenCalledWith('ada@example.com');
    });

    // The confirmation says the same thing whatever the server returned: the
    // screen must not become a way to tell which addresses have an account.
    it('shows the neutral confirmation on success', async () => {
        await render();

        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await submitForm(getElement('form'));

        expect(document.querySelector('[role="status"]')?.textContent).toBe(labels.resetRequestAccepted);
    });

    it('goes back to sign in', async () => {
        const { onBack } = await render();

        await click(getElement('.button-quiet'));

        expect(onBack).toHaveBeenCalledOnce();
    });

    // Le parcours au clavier seul. Rien ne le verifiait jusqu'ici : la suite
    // posait le focus par .focus() puis l'affirmait, ce qui ne dit rien de ce
    // qu'une personne atteint reellement en tabulant.
    it('se parcourt entierement au clavier, dans l ordre de lecture', async () => {
        await render();
        document.body.focus();

        // Le champ d'abord, puis l'envoi, puis le retour : l'action principale
        // precede l'echappatoire. Les noms accessibles plutot que les balises,
        // sans quoi deux boutons seraient indiscernables et l'ordre non verifie.
        const attendu = focusOrder();
        expect(attendu).toEqual([
            `input:${labels.emailLabel}`,
            `button:${labels.requestReset}`,
            `button:${labels.backToSignIn}`,
        ]);

        // Puis que tabuler visite bien cet ordre-la, et pas seulement que le
        // DOM le declare : les deux peuvent diverger.
        const visites: string[] = [];
        for (let pas = 0; pas < attendu.length; pas += 1) {
            const atteint = await tab();
            if (atteint !== null) {
                visites.push(`${atteint.tagName.toLowerCase()}:${nomAccessible(atteint)}`);
            }
        }

        expect(visites).toEqual(attendu);
    });

    // La soumission a la touche entree ne se teste pas ici : jsdom n'implemente
    // pas la soumission implicite, et un test qui appellerait submitForm apres
    // avoir simule la touche passerait meme si le comportement n'existait pas.
    // Ce qui est verifiable, et suffisant, est sa condition structurelle : le
    // formulaire porte un bouton de type submit, et un seul. Sans lui, entree
    // ne ferait rien dans un vrai navigateur ; avec deux, le navigateur
    // choisirait le premier. La verification a l'usage revient a EN-26.
    it('reunit la condition de la soumission au clavier', async () => {
        await render();

        const soumissions = document.querySelectorAll('form button[type="submit"]');

        expect(soumissions).toHaveLength(1);
        expect(getElement('form').contains(soumissions[0] ?? null)).toBe(true);
    });

    // Le bouton de retour n'est pas un submit : sans son type explicite il
    // enverrait le formulaire au lieu de revenir en arriere, ce qui est la
    // faute la plus courante et la plus silencieuse sur un formulaire a deux
    // boutons.
    it('ne fait pas du retour un second bouton d envoi', async () => {
        await render();

        expect(getElement('.button-quiet').getAttribute('type')).toBe('button');
    });

    it('has no automatically detectable WCAG A or AA violation', async () => {
        await render();

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map(violation => violation.id)).toEqual([]);
    });
});
