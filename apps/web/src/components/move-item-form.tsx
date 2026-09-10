import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ItemStatus as ItemStatusSchema } from '@legacy/contracts';

import type { ItemStatus } from '../api/items-api';
import { labels } from '../labels';

const STATUSES: readonly ItemStatus[] = ['todo', 'doing', 'done'];

export interface MoveItemFormProps {
    currentStatus: ItemStatus;
    isPending: boolean;
    itemName: string;
    onCancel: () => void;
    onMove: (status: ItemStatus) => Promise<boolean>;
}

function firstDestination(currentStatus: ItemStatus): ItemStatus {
    return STATUSES.find((status) => status !== currentStatus) ?? currentStatus;
}

export function MoveItemForm(props: MoveItemFormProps) {
    const selectId = useId();
    const [destination, setDestination] = useState<ItemStatus>(firstDestination(props.currentStatus));

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void props.onMove(destination);
    };

    const selectDestination = (value: string) => {
        const result = ItemStatusSchema.safeParse(value);
        if (result.success) setDestination(result.data);
    };

    return (
        <form className="move-item-form" onSubmit={submit}>
            <div className="form-field">
                <label htmlFor={selectId}>{labels.moveDestinationLabel}</label>
                <select
                    id={selectId}
                    autoFocus
                    value={destination}
                    disabled={props.isPending}
                    onChange={(event) => selectDestination(event.target.value)}
                >
                    {STATUSES.filter((status) => status !== props.currentStatus).map((status) => (
                        <option key={status} value={status}>
                            {labels.itemStatus(status)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="move-item-actions">
                <button className="button button-primary" type="submit" disabled={props.isPending}>
                    {props.isPending ? labels.movingItem : labels.confirmMove}
                </button>
                <button
                    className="button button-secondary"
                    type="button"
                    disabled={props.isPending}
                    onClick={props.onCancel}
                >
                    {labels.cancel}
                </button>
            </div>
            <p className="visually-hidden">{labels.moveItemTo(props.itemName, labels.itemStatus(destination))}</p>
        </form>
    );
}
