import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CreateItemBody, MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';
import type { CreateItemBody as CreateItemInput, ItemPriority } from '@legacy/contracts';

import { labels } from '../labels';
import type { AddItemResult } from './items-state';

interface AddItemFormState {
    inputRef: React.RefObject<HTMLInputElement | null>;
    name: string;
    priority: ItemPriority;
    dueDate: string;
    validationError: string | null;
    describedBy: string;
    handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
    handlePriorityChange: (priority: ItemPriority) => void;
    handleDueDateChange: (dueDate: string) => void;
    // Le DOM ignore la valeur renvoyee par un gestionnaire de soumission :
    // la declarer void plutot que Promise<void> dit la verite a l appelant.
    handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function useAddItemFields() {
    const [name, setName] = useState('');
    const [priority, setPriority] = useState<ItemPriority>('normal');
    const [dueDate, setDueDate] = useState('');

    return {
        name,
        priority,
        dueDate,
        setName,
        handlePriorityChange: setPriority,
        handleDueDateChange: setDueDate,
        reset: () => {
            setName('');
            setPriority('normal');
            setDueDate('');
        },
    };
}

function invalidNameMessage(name: string): string {
    return name.trim().length === 0
        ? labels.itemNameRequired
        : labels.itemNameTooLong(MAX_ITEM_NAME_LENGTH);
}

export function useAddItemForm(
    onAdd: (body: CreateItemInput) => Promise<AddItemResult>,
): AddItemFormState {
    const inputRef = useRef<HTMLInputElement>(null);
    const fields = useAddItemFields();
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        fields.setName(event.target.value);
        if (validationError !== null) setValidationError(null);
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const candidate = CreateItemBody.safeParse({
            name: fields.name,
            priority: fields.priority,
            dueDate: fields.dueDate === '' ? null : fields.dueDate,
        });

        if (!candidate.success) {
            setValidationError(invalidNameMessage(fields.name));
            inputRef.current?.focus();
            return;
        }

        setValidationError(null);
        const result = await onAdd(candidate.data);
        if (result.status === 'success') {
            fields.reset();
            inputRef.current?.focus();
        } else {
            setValidationError(result.message);
            inputRef.current?.focus();
        }
    };

    const describedBy =
        validationError === null ? 'item-name-help' : 'item-name-help item-name-error';

    return {
        inputRef,
        name: fields.name,
        priority: fields.priority,
        dueDate: fields.dueDate,
        validationError,
        describedBy,
        handleChange,
        handlePriorityChange: fields.handlePriorityChange,
        handleDueDateChange: fields.handleDueDateChange,
        handleSubmit: (event) => void submit(event),
    };
}
