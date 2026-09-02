import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CreateItemBody, MAX_ITEM_NAME_LENGTH } from '@legacy/contracts';

import { labels } from '../labels';
import type { AddItemResult } from './items-state';

interface AddItemFormState {
    inputRef: React.RefObject<HTMLInputElement | null>;
    name: string;
    validationError: string | null;
    describedBy: string;
    handleChange(event: ChangeEvent<HTMLInputElement>): void;
    handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
}

export function useAddItemForm(
    onAdd: (name: string) => Promise<AddItemResult>,
): AddItemFormState {
    const inputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setName(event.target.value);
        if (validationError !== null) setValidationError(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const candidate = CreateItemBody.safeParse({ name });

        if (!candidate.success) {
            const message =
                name.trim().length === 0
                    ? labels.itemNameRequired
                    : labels.itemNameTooLong(MAX_ITEM_NAME_LENGTH);
            setValidationError(message);
            inputRef.current?.focus();
            return;
        }

        setValidationError(null);
        const result = await onAdd(candidate.data.name);
        if (result.status === 'success') {
            setName('');
            inputRef.current?.focus();
        } else {
            setValidationError(result.message);
            inputRef.current?.focus();
        }
    };

    const describedBy =
        validationError === null ? 'item-name-help' : 'item-name-help item-name-error';

    return { inputRef, name, validationError, describedBy, handleChange, handleSubmit };
}
