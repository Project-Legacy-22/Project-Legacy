import type { ProjectMemberDto } from '../api/members-api';
import { labels } from '../labels';

export interface ItemAssigneeFieldProps {
    inputId: string;
    members: readonly ProjectMemberDto[];
    // '' for nobody: a select holds strings.
    value: string;
    isDisabled: boolean;
    onChange: (value: string) => void;
}

// A native select, so the keyboard and screen readers get the behaviour they
// expect. Rendered only for a project with more than one member: alone, there
// is nobody else to assign to (US-58).
export function ItemAssigneeField({ inputId, members, value, isDisabled, onChange }: ItemAssigneeFieldProps) {
    return (
        <div className="form-field">
            <label htmlFor={inputId}>{labels.assigneeLabel}</label>
            <select id={inputId} value={value} disabled={isDisabled} onChange={event => onChange(event.target.value)}>
                <option value="">{labels.nobody}</option>
                {members.map(member => (
                    <option key={member.userId} value={member.userId}>
                        {member.email}
                    </option>
                ))}
            </select>
        </div>
    );
}
