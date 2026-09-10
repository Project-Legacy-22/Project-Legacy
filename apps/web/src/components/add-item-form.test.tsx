import { MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels';
import {
    createReactTestRoot,
    getElement,
    setInputValue,
    setSelectValue,
    submitForm,
} from '../test/react-root';
import type { ReactTestRoot } from '../test/react-root';
import { AddItemForm } from './add-item-form';

let testRoot: ReactTestRoot;

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('AddItemForm', () => {
    it('associates an empty-name error with the input', async () => {
        const onAdd = vi.fn(async () => ({ status: 'success' as const }));
        await testRoot.render(<AddItemForm isAdding={false} isDisabled={false} onAdd={onAdd} />);

        const input = getElement<HTMLInputElement>('#item-name');
        await setInputValue(input, '   ');
        await submitForm(getElement('form'));

        expect(onAdd).not.toHaveBeenCalled();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toContain('item-name-error');
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(labels.itemNameRequired);
        expect(document.activeElement).toBe(input);
    });

    it('associates an overlong-name error with the input', async () => {
        const onAdd = vi.fn(async () => ({ status: 'success' as const }));
        await testRoot.render(<AddItemForm isAdding={false} isDisabled={false} onAdd={onAdd} />);

        const input = getElement<HTMLInputElement>('#item-name');
        await setInputValue(input, 'a'.repeat(MAX_ITEM_NAME_LENGTH + 1));
        await submitForm(getElement('form'));

        expect(onAdd).not.toHaveBeenCalled();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toContain('item-name-error');
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(
            labels.itemNameTooLong(MAX_ITEM_NAME_LENGTH),
        );
        expect(document.activeElement).toBe(input);
    });

    it('keeps a server refusal linked to the input', async () => {
        const onAdd = vi.fn(async () => ({ status: 'error' as const, message: labels.addItemFailed }));
        await testRoot.render(<AddItemForm isAdding={false} isDisabled={false} onAdd={onAdd} />);

        const input = getElement<HTMLInputElement>('#item-name');
        await setInputValue(input, 'Valid name');
        await submitForm(getElement('form'));

        expect(onAdd).toHaveBeenCalledWith({
            name: 'Valid name',
            priority: 'normal',
            dueDate: null,
        });
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(labels.addItemFailed);
        expect(input.getAttribute('aria-describedby')).toContain('item-name-error');
        expect(document.activeElement).toBe(input);
    });

    it('submits optional planning values and accepts a past date', async () => {
        const onAdd = vi.fn(async () => ({ status: 'success' as const }));
        await testRoot.render(<AddItemForm isAdding={false} isDisabled={false} onAdd={onAdd} />);

        await setInputValue(getElement<HTMLInputElement>('#item-name'), 'Review the incident');
        await setSelectValue(getElement<HTMLSelectElement>('#new-item-priority'), 'high');
        await setInputValue(getElement<HTMLInputElement>('#new-item-due-date'), '2020-01-02');
        await submitForm(getElement('form'));

        expect(onAdd).toHaveBeenCalledWith({
            name: 'Review the incident',
            priority: 'high',
            dueDate: '2020-01-02',
        });
        expect(getElement<HTMLSelectElement>('#new-item-priority').value).toBe('normal');
        expect(getElement<HTMLInputElement>('#new-item-due-date').value).toBe('');
    });
});
