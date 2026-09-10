import { ItemPriority as ItemPrioritySchema } from '@legacy/contracts';
import type { ItemPriority } from '@legacy/contracts';

import { labels } from '../labels';

export interface ItemPlanningFieldsProps {
    idPrefix: string;
    priority: ItemPriority;
    dueDate: string;
    isDisabled: boolean;
    onPriorityChange: (priority: ItemPriority) => void;
    onDueDateChange: (dueDate: string) => void;
}

export function ItemPlanningFields(props: ItemPlanningFieldsProps) {
    const priorityId = `${props.idPrefix}-priority`;
    const dueDateId = `${props.idPrefix}-due-date`;
    const dueDateHelpId = `${dueDateId}-help`;

    return (
        <div className="item-planning-fields">
            <div className="form-field">
                <label htmlFor={priorityId}>{labels.itemPriorityLabel}</label>
                <select
                    id={priorityId}
                    name="priority"
                    value={props.priority}
                    disabled={props.isDisabled}
                    onChange={(event) => props.onPriorityChange(ItemPrioritySchema.parse(event.target.value))}
                >
                    {ItemPrioritySchema.options.map((priority) => (
                        <option key={priority} value={priority}>
                            {labels.itemPriority(priority)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-field">
                <label htmlFor={dueDateId}>{labels.itemDueDateLabel}</label>
                <p id={dueDateHelpId} className="field-help">
                    {labels.itemDueDateHelp}
                </p>
                <input
                    id={dueDateId}
                    name="dueDate"
                    type="date"
                    value={props.dueDate}
                    aria-describedby={dueDateHelpId}
                    disabled={props.isDisabled}
                    onChange={(event) => props.onDueDateChange(event.target.value)}
                />
            </div>
        </div>
    );
}
