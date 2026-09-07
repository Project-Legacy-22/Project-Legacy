import { PASSWORD_POLICY } from '@legacy/contracts';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    createReactTestRoot,
    getElement,
    setInputValue,
    submitForm,
} from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import type { SubmitResult } from '../hooks/use-session';
import { ResetPasswordPage } from './reset-password-page';

const TOKEN = 'un-jeton-de-recuperation';
const VALID = 'NouveauMotDePasse2';

let testRoot: ReactTestRoot;

type Submit = (token: string, password: string) => Promise<SubmitResult>;

const succeeds: Submit = () =>
    Promise.resolve({ status: 'success', message: labels.resetPasswordSucceeded });

async function render(onSubmit: Submit = succeeds) {
    const spy = vi.fn(onSubmit);
    document.documentElement.lang = 'en';
    document.title = 'Legacy 22';
    await testRoot.render(
        <ResetPasswordPage token={TOKEN} isSubmitting={false} onSubmit={spy} />,
    );
    return spy;
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('ResetPasswordPage', () => {
    it('states the password policy before anything is typed', async () => {
        await render();

        const input = getElement<HTMLInputElement>('input[type="password"]');
        const helpId = input.getAttribute('aria-describedby')?.split(/\s+/u)[0] ?? '';
        expect(document.getElementById(helpId)?.textContent).toBe(
            labels.passwordPolicy(PASSWORD_POLICY),
        );
    });

    it('blocks a password shorter than the policy without calling the server', async () => {
        const onSubmit = await render();

        const input = getElement<HTMLInputElement>('input[type="password"]');
        await setInputValue(input, 'Court1');
        await submitForm(getElement('form'));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(
            labels.passwordTooShort(PASSWORD_POLICY.minimumLength),
        );
    });

    it('submits the token and the new password together', async () => {
        const onSubmit = await render();

        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), VALID);
        await submitForm(getElement('form'));

        expect(onSubmit).toHaveBeenCalledWith(TOKEN, VALID);
    });

    it('confirms the reset and the sign-out of other sessions on success', async () => {
        await render();

        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), VALID);
        await submitForm(getElement('form'));

        expect(document.querySelector('[role="status"]')?.textContent).toBe(
            labels.resetPasswordSucceeded,
        );
        expect(document.querySelector('form')).toBeNull();
    });

    it('shows the server reason and a way back when the link is refused', async () => {
        const message = 'This password reset link is invalid or has expired. Request a new one.';
        await render(() => Promise.resolve({ status: 'error', message }));

        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), VALID);
        await submitForm(getElement('form'));

        expect(document.querySelector('[role="alert"]')?.textContent).toContain('expired');
        expect(document.querySelector('a[href="/"]')?.textContent).toBe(labels.requestNewResetLink);
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
