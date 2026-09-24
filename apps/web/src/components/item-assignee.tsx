import { useState } from 'react';

import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';
import { memberEmail, useProjectMemberList } from './project-members-context';

// Who the task is for, named from the project's members. An assignee missing
// from a list that failed to load is still said to exist.
export function ItemAssignee({ assigneeId }: { assigneeId: string | null }) {
    const members = useProjectMemberList();
    if (assigneeId === null) return null;

    return <p className="item-assignee">{labels.assignedTo(memberEmail(members, assigneeId))}</p>;
}

// Says who the task went to once an edit changed it, in the row, next to the
// card that now shows it (US-58).
export function useAssigneeAnnouncement(item: ItemDto) {
    const members = useProjectMemberList();
    const [announcement, setAnnouncement] = useState('');

    // Called once the save succeeded, with what it asked for: undefined when
    // the edit did not offer the choice.
    const announce = (requested: string | null | undefined) => {
        if (requested === undefined || requested === item.assigneeId) return;
        const name = item.name ?? labels.unnamedItem;
        setAnnouncement(
            requested === null ? labels.itemUnassigned(name) : labels.itemAssigned(name, memberEmail(members, requested)),
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
