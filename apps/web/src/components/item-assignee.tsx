import { useState } from 'react';

import type { ItemDto } from '../api/items-api';
import type { ProjectMemberDto } from '../api/members-api';
import { labels } from '../labels';
import { memberEmail, useProjectMemberList } from './project-members-context';

function emailsOf(members: readonly ProjectMemberDto[], userIds: readonly string[]): (string | undefined)[] {
    return userIds.map(userId => memberEmail(members, userId));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every(userId => right.includes(userId));
}

// Who the task is for, named from the project's members. An assignee missing
// from a list that failed to load is still said to exist.
export function ItemAssignees({ assigneeIds }: Readonly<{ assigneeIds: readonly string[] }>) {
    const members = useProjectMemberList();
    if (assigneeIds.length === 0) return null;

    return <p className="item-assignee">{labels.assignedTo(emailsOf(members, assigneeIds))}</p>;
}

// Says who the task went to once an edit changed it, in the row, next to the
// card that now shows it (US-58, #419).
export function useAssigneeAnnouncement(item: ItemDto) {
    const members = useProjectMemberList();
    const [announcement, setAnnouncement] = useState('');

    // Called once the save succeeded, with what it asked for: undefined when
    // the edit did not offer the choice.
    const announce = (requested: readonly string[] | undefined) => {
        if (requested === undefined || sameMembers(requested, item.assigneeIds)) return;
        const name = item.name ?? labels.unnamedItem;
        setAnnouncement(
            requested.length === 0 ? labels.itemUnassigned(name) : labels.itemAssigned(name, emailsOf(members, requested)),
        );
    };

    return { announcement, announce };
}

export function PoliteAnnouncement({ text }: { text: string }) {
    return (
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
            {text}
        </p>
    );
}
