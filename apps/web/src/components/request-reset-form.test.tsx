import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    click,
    createReactTestRoot,
    focusOrder,
    accessibleName,
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

    // The keyboard path on its own. Nothing verified it until now: the suite
    // placed focus with .focus() then asserted it, which says nothing about
    // what a person actually reaches by tabbing.
    it('can be walked end to end with the keyboard, in reading order', async () => {
        await render();
        document.body.focus();

        // The field first, then submit, then back: the main action comes
        // before the escape. Accessible names rather than tags, without which
        // two buttons would be indistinguishable and the order unverified.
        const expected = focusOrder();
        expect(expected).toEqual([
            `input:${labels.emailLabel}`,
            `button:${labels.requestReset}`,
            `button:${labels.backToSignIn}`,
        ]);

        // Puis que tabuler visite bien cet ordre-la, et pas seulement que le
        // DOM le declare : les deux peuvent diverger.
        const visited: string[] = [];
        for (let step = 0; step < expected.length; step += 1) {
            const reached = await tab();
            if (reached !== null) {
                visited.push(`${reached.tagName.toLowerCase()}:${accessibleName(reached)}`);
            }
        }

        expect(visited).toEqual(expected);
    });

    // Submission by the Enter key is not tested here: jsdom does not implement
    // implicit submission, and a test calling submitForm after simulating the
    // key would pass even if the behaviour did not exist.
    //
    // What is verifiable, and enough, is its structural condition: the form
    // carries a submit button, and exactly one. Without it, Enter would do
    // nothing in a real browser; with two, the browser would pick the first.
    // Verifying it in use belongs to EN-26.
    it('meets the condition for keyboard submission', async () => {
        await render();

        const submits = document.querySelectorAll('form button[type="submit"]');

        expect(submits).toHaveLength(1);
        expect(getElement('form').contains(submits[0] ?? null)).toBe(true);
    });

    // The back button is not a submit: without its explicit type it would
    // send the form instead of going back, which is the most common and the
    // most silent mistake on a two-button form.
    it('does not make the back button a second submit', async () => {
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
