import { MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';

import { labels } from '../labels';
import { useAddItemForm } from '../hooks/use-add-item-form';
import type { AddItemResult } from '../hooks/use-items';

export interface AddItemFormProps {
    isAdding: boolean;
    isDisabled: boolean;
    onAdd: (name: string) => Promise<AddItemResult>;
}

export function AddItemForm({ isAdding, isDisabled, onAdd }: AddItemFormProps) {
    const form = useAddItemForm(onAdd);
    const isFormDisabled = isDisabled || isAdding;

    return (
        <form className="add-form" onSubmit={form.handleSubmit} noValidate>
            <div className="form-field">
                <label htmlFor="item-name">{labels.itemNameLabel}</label>
                <p id="item-name-help" className="field-help">
                    {labels.itemNameHelp(MAX_ITEM_NAME_LENGTH)}
                </p>
                <input
                    ref={form.inputRef}
                    id="item-name"
                    name="itemName"
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_ITEM_NAME_LENGTH}
                    value={form.name}
                    onChange={form.handleChange}
                    aria-describedby={form.describedBy}
                    aria-invalid={form.validationError !== null}
                    disabled={isFormDisabled}
                />
                {form.validationError !== null && (
                    <p id="item-name-error" className="field-error" role="alert">
                        {form.validationError}
                    </p>
                )}
            </div>
            <button className="button button-primary" type="submit" disabled={isFormDisabled}>
                {isAdding ? labels.addingItem : labels.addItem}
            </button>
        </form>
    );
}
