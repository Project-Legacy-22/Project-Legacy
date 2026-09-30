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

// The authentication screens had no test file, hence no axe pass: the application's front door was
// the only delivered screen that no accessibility check touched (#181).

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
        // axe documents that this rule gives no reliable result in jsdom.
        rules: { 'color-contrast': { enabled: false } },
    });

    return results.violations;
}

beforeEach(() => {
    // Each suite sets them by hand: jsdom does not load the real document, and without them axe
    // reports a page without a language or a title.
    document.documentElement.lang = 'en';
    document.title = 'Sign in | Legacy 22';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('AuthPage', () => {
    it('has no detectable WCAG A or AA violation at sign-in', async () => {
        await root.render(<AuthPage {...props()} />);

        expect(await axeViolations()).toEqual([]);
    });

    it('has none at account creation', async () => {
        await root.render(<AuthPage {...props()} />);
        const bascule = [...document.querySelectorAll('button')].find(
            b => b.textContent === labels.switchToRegister,
        );
        if (bascule === undefined) throw new Error('bouton de bascule introuvable');
        await click(bascule);

        expect(getElement<HTMLElement>('h1').textContent).toBe(labels.registerTitle);
        expect(await axeViolations()).toEqual([]);
    });

    it('has none when a session has just ended', async () => {
        await root.render(<AuthPage {...props({ notice: labels.sessionExpired })} />);

        expect(await axeViolations()).toEqual([]);
    });

    // The US-14a criterion: a keyboard-only journey on every delivered screen.
    it('is walked with the keyboard in document order', async () => {
        await root.render(<AuthPage {...props()} />);

        const ordre = focusOrder();

        expect(ordre.length).toBeGreaterThan(3);
        expect(ordre[0]).toContain(labels.emailLabel);
        expect(ordre.at(-1)).toContain(labels.forgotPasswordLink);
    });

    it('reaches every field and every button with Tab, without a trap', async () => {
        await root.render(<AuthPage {...props()} />);

        const attendu = focusOrder();
        const atteints: string[] = [];

        for (let i = 0; i < attendu.length; i += 1) {
            const suivant = await tab();
            if (suivant === null) break;
            atteints.push(`${suivant.tagName.toLowerCase()}:${suivant.getAttribute('aria-label') ?? ''}`);
        }

        // As many stops as focusable elements: none is skipped, and none holds the focus.
        expect(atteints).toHaveLength(attendu.length);
    });

    it('submits the form from the keyboard and announces the refusal', async () => {
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
