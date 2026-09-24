import type { ProjectMemberDto } from '../api/members-api';
import { labels } from '../labels';

export interface ItemAssigneesFieldProps {
    idPrefix: string;
    members: readonly ProjectMemberDto[];
    selected: readonly string[];
    isDisabled: boolean;
    onChange: (selected: readonly string[]) => void;
}

// One native checkbox per member in a fieldset, so a task can go to several
// people (#419) and each choice is reached with Tab and toggled with Space.
// Nobody checked means nobody assigned. Rendered only for a project with more
// than one member: alone, there is nobody else to assign to (US-58).
export function ItemAssigneesField({ idPrefix, members, selected, isDisabled, onChange }: Readonly<ItemAssigneesFieldProps>) {
    const toggle = (userId: string, checked: boolean) =>
        onChange(checked ? [...selected, userId] : selected.filter(id => id !== userId));

    return (
        <fieldset className="form-field item-assignees-field" disabled={isDisabled}>
            <legend>{labels.assigneeLabel}</legend>
            {members.map(member => {
                const id = `${idPrefix}-assignee-${member.userId}`;
                return (
                    <label key={member.userId} className="checkbox-field" htmlFor={id}>
                        <input
                            id={id}
                            type="checkbox"
                            checked={selected.includes(member.userId)}
                            onChange={event => toggle(member.userId, event.target.checked)}
                        />
                        {member.email}
                    </label>
                );
            })}
        </fieldset>
    );
}
