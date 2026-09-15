import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    click,
    createReactTestRoot,
    focusOrder,
    getElement,
    setInputValue,
    submitForm,
    tab,
} from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { AuthPage } from './auth-page';
import type { AuthPageProps } from './auth-page';

// Les ecrans d authentification n avaient aucun fichier de test, donc aucune
// passe axe : la porte d entree de l application etait le seul ecran livre
// qu aucun controle d accessibilite ne touchait (#181).

let root: ReactTestRoot;

function props(overrides: Partial<AuthPageProps> = {}): AuthPageProps {
    return {
        notice: undefined,
        isSubmitting: false,
        onSignIn: vi.fn(async () => ({ status: 'success' as const })),
        onRegister: vi.fn(async () => ({ status: 'success' as const })),
        onRequestReset: vi.fn(async () => ({ status: 'success' as const })),
        onOpenPolicy: vi.fn(),
        ...overrides,
    };
}

async function axeViolations(): Promise<readonly { id: string }[]> {
    const results = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        // axe documente que cette regle ne donne pas de resultat fiable en jsdom.
        rules: { 'color-contrast': { enabled: false } },
    });

    return results.violations;
}

beforeEach(() => {
    // Chaque suite les pose a la main : jsdom ne charge pas le document reel, et
    // sans eux axe signale une page sans langue ni titre.
    document.documentElement.lang = 'en';
    document.title = 'Sign in | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('AuthPage', () => {
    it('n a aucune violation WCAG A ou AA detectable a la connexion', async () => {
        await root.render(<AuthPage {...props()} />);

        expect(await axeViolations()).toEqual([]);
    });

    it('n en a aucune a la creation de compte', async () => {
        await root.render(<AuthPage {...props()} />);
        const bascule = [...document.querySelectorAll('button')].find(
            b => b.textContent === labels.switchToRegister,
        );
        if (bascule === undefined) throw new Error('bouton de bascule introuvable');
        await click(bascule);

        expect(getElement<HTMLElement>('h1').textContent).toBe(labels.registerTitle);
        expect(await axeViolations()).toEqual([]);
    });

    it('n en a aucune quand une session vient de finir', async () => {
        await root.render(<AuthPage {...props({ notice: labels.sessionExpired })} />);

        expect(await axeViolations()).toEqual([]);
    });

    // Le critere de US-14a : un parcours au clavier seul sur chaque ecran livre.
    it('se parcourt au clavier dans l ordre du document', async () => {
        await root.render(<AuthPage {...props()} />);

        const ordre = focusOrder();

        expect(ordre.length).toBeGreaterThan(3);
        expect(ordre[0]).toContain(labels.emailLabel);
        expect(ordre.at(-1)).toContain(labels.forgotPasswordLink);
    });

    it('atteint chaque champ et chaque bouton par Tab, sans piege', async () => {
        await root.render(<AuthPage {...props()} />);

        const attendu = focusOrder();
        const atteints: string[] = [];

        for (let i = 0; i < attendu.length; i += 1) {
            const suivant = await tab();
            if (suivant === null) break;
            atteints.push(`${suivant.tagName.toLowerCase()}:${suivant.getAttribute('aria-label') ?? ''}`);
        }

        // Autant d arrets que d elements focalisables : aucun n est saute, et
        // aucun ne retient le focus.
        expect(atteints).toHaveLength(attendu.length);
    });

    it('envoie le formulaire depuis le clavier et annonce le refus', async () => {
        const onSignIn = vi.fn(async () => ({ status: 'error' as const, message: labels.signInRejected }));
        await root.render(<AuthPage {...props({ onSignIn })} />);

        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'alice@example.test');
        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), 'MotDePasse2026');
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        expect(onSignIn).toHaveBeenCalledWith('alice@example.test', 'MotDePasse2026');

        const alerte = getElement<HTMLElement>('[role="alert"]');
        expect(alerte.textContent).toContain(labels.signInRejected);
    });
});
