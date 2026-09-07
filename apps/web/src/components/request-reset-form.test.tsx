import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    click,
    createReactTestRoot,
    getElement,
    setInputValue,
    submitForm,
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

    it('has no automatically detectable WCAG A or AA violation', async () => {
        await render();

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map(violation => violation.id)).toEqual([]);
    });
});
