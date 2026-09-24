import { MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';
import type { CreateItemBody } from '@legacy/contracts';

import { labels } from '../labels';
import { useAddItemForm } from '../hooks/use-add-item-form';
import type { AddItemResult } from '../hooks/use-items';
import { ItemAssigneesField } from './item-assignees-field';
import { ItemPlanningFields } from './item-planning-fields';
import { useProjectMemberList } from './project-members-context';

export interface AddItemFormProps {
    isAdding: boolean;
    isDisabled: boolean;
    onAdd: (body: CreateItemBody) => Promise<AddItemResult>;
}

type AddItemFormState = ReturnType<typeof useAddItemForm>;

function AddItemNameField({ form, isDisabled }: Readonly<{ form: AddItemFormState; isDisabled: boolean }>) {
    return (
        <div className="form-field add-form-name">
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
                disabled={isDisabled}
            />
            {form.validationError !== null && (
                <p id="item-name-error" className="field-error" role="alert">
                    {form.validationError}
                </p>
            )}
        </div>
    );
}

export function AddItemForm({ isAdding, isDisabled, onAdd }: AddItemFormProps) {
    const members = useProjectMemberList();
    const canAssign = members.length > 1;
    const form = useAddItemForm(onAdd, canAssign);
    const isFormDisabled = isDisabled || isAdding;

    return (
        <form className="add-form" onSubmit={form.handleSubmit} noValidate>
            <AddItemNameField form={form} isDisabled={isFormDisabled} />
            <ItemPlanningFields
                idPrefix="new-item"
                priority={form.priority}
                dueDate={form.dueDate}
                isDisabled={isFormDisabled}
                onPriorityChange={form.handlePriorityChange}
                onDueDateChange={form.handleDueDateChange}
            />
            {canAssign && (
                <ItemAssigneesField
                    idPrefix="new-item"
                    members={members}
                    selected={form.assigneeIds}
                    isDisabled={isFormDisabled}
                    onChange={form.handleAssigneesChange}
                />
            )}
            <button className="button button-primary" type="submit" disabled={isFormDisabled}>
                {isAdding ? labels.addingItem : labels.addItem}
            </button>
        </form>
    );
}
