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
    assigneeIds: readonly string[];
    validationError: string | null;
    describedBy: string;
    handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
    handlePriorityChange: (priority: ItemPriority) => void;
    handleDueDateChange: (dueDate: string) => void;
    handleAssigneesChange: (assigneeIds: readonly string[]) => void;
    // Le DOM ignore la valeur renvoyee par un gestionnaire de soumission :
    // la declarer void plutot que Promise<void> dit la verite a l appelant.
    handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function useAddItemFields() {
    const [name, setName] = useState('');
    const [priority, setPriority] = useState<ItemPriority>('normal');
    const [dueDate, setDueDate] = useState('');
    const [assigneeIds, setAssigneeIds] = useState<readonly string[]>([]);

    return {
        name,
        priority,
        dueDate,
        assigneeIds,
        setName,
        handlePriorityChange: setPriority,
        handleDueDateChange: setDueDate,
        handleAssigneesChange: setAssigneeIds,
        reset: () => {
            setName('');
            setPriority('normal');
            setDueDate('');
            setAssigneeIds([]);
        },
    };
}

function invalidNameMessage(name: string): string {
    return name.trim().length === 0
        ? labels.itemNameRequired
        : labels.itemNameTooLong(MAX_ITEM_NAME_LENGTH);
}

function bodyOf(fields: ReturnType<typeof useAddItemFields>, canAssign: boolean) {
    return {
        name: fields.name,
        priority: fields.priority,
        dueDate: fields.dueDate === '' ? null : fields.dueDate,
        ...(canAssign && fields.assigneeIds.length > 0 ? { assigneeIds: fields.assigneeIds } : {}),
    };
}

// canAssign: whether the form offers the assignees (#419). When it does not,
// the body leaves them out rather than sending an empty list.
export function useAddItemForm(
    onAdd: (body: CreateItemInput) => Promise<AddItemResult>,
    canAssign: boolean,
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
        const candidate = CreateItemBody.safeParse(bodyOf(fields, canAssign));

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
        assigneeIds: fields.assigneeIds,
        validationError,
        describedBy,
        handleChange,
        handlePriorityChange: fields.handlePriorityChange,
        handleDueDateChange: fields.handleDueDateChange,
        handleAssigneesChange: fields.handleAssigneesChange,
        handleSubmit: (event) => void submit(event),
    };
}
