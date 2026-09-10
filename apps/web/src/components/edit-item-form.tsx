import { useState } from 'react';
import type { FormEvent } from 'react';

import { MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';
import { UpdateItemBody } from '@legacy/contracts';
import type { ItemPriority, UpdateItemBody as UpdateItemInput } from '@legacy/contracts';

import { labels } from '../labels';
import { ItemPlanningFields } from './item-planning-fields';

export interface EditItemFormProps {
    itemId: string;
    initialName: string;
    initialPriority: ItemPriority;
    initialDueDate: string | null;
    isPending: boolean;
    onCancel: () => void;
    onSave: (changes: UpdateItemInput) => Promise<boolean>;
}

interface EditItemFieldProps {
    inputId: string;
    name: string;
    validationError: string | null;
    isPending: boolean;
    onChange: (name: string) => void;
}

function validateName(candidate: string): string | null {
    if (candidate.trim().length === 0) return labels.itemNameRequired;
    if (candidate.length > MAX_ITEM_NAME_LENGTH) return labels.itemNameTooLong(MAX_ITEM_NAME_LENGTH);
    return null;
}

function EditItemField({ inputId, name, validationError, isPending, onChange }: EditItemFieldProps) {
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;
    const describedBy = validationError === null ? helpId : `${helpId} ${errorId}`;

    return (
        <div className="form-field">
            <label htmlFor={inputId}>{labels.editItemNameLabel}</label>
            <p id={helpId} className="field-help">
                {labels.itemNameHelp(MAX_ITEM_NAME_LENGTH)}
            </p>
            <input
                autoFocus
                id={inputId}
                name="itemName"
                type="text"
                autoComplete="off"
                maxLength={MAX_ITEM_NAME_LENGTH}
                value={name}
                aria-describedby={describedBy}
                aria-invalid={validationError !== null}
                disabled={isPending}
                onChange={(event) => onChange(event.target.value)}
            />
            {validationError !== null && (
                <p id={errorId} className="field-error" role="alert">
                    {validationError}
                </p>
            )}
        </div>
    );
}

export function EditItemForm({
    itemId,
    initialName,
    initialPriority,
    initialDueDate,
    isPending,
    onCancel,
    onSave,
}: EditItemFormProps) {
    const [name, setName] = useState(initialName);
    const [priority, setPriority] = useState(initialPriority);
    const [dueDate, setDueDate] = useState(initialDueDate ?? '');
    const [validationError, setValidationError] = useState<string | null>(null);
    const inputId = `edit-item-${itemId}`;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const candidate = UpdateItemBody.safeParse({
            name,
            priority,
            dueDate: dueDate === '' ? null : dueDate,
        });
        const error = validateName(name);
        setValidationError(error);
        if (error !== null || !candidate.success) return;

        await onSave(candidate.data);
    };

    return (
        <form className="item-edit-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <EditItemField
                inputId={inputId}
                name={name}
                validationError={validationError}
                isPending={isPending}
                onChange={(newName) => {
                    setName(newName);
                    setValidationError(null);
                }}
            />
            <ItemPlanningFields
                idPrefix={`edit-item-${itemId}`}
                priority={priority}
                dueDate={dueDate}
                isDisabled={isPending}
                onPriorityChange={setPriority}
                onDueDateChange={setDueDate}
            />
            <div className="item-edit-actions">
                <button className="button button-primary" type="submit" disabled={isPending}>
                    {isPending ? labels.savingItem : labels.saveItem}
                </button>
                <button className="button button-secondary" type="button" disabled={isPending} onClick={onCancel}>
                    {labels.cancel}
                </button>
            </div>
        </form>
    );
}
