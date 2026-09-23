import { useCallback, useEffect, useState } from 'react';

import type { AttentionItemDto } from '../api/attention-api';
import type { LoadState } from './view-state';

interface Pending {
    itemId: string;
    // Whether the list below still has to reload for the chosen project. Until
    // it has started, what it shows belongs to the project that was selected
    // before, and a missing task there says nothing.
    awaitsReload: boolean;
}

// The two halves of the screen this reaches into, by the fields it needs:
// the project selection, and the task list with its filters.
export interface ProjectSelection {
    selectedProjectId: string | null;
    selectProject: (projectId: string) => void;
}

export interface TaskList {
    hasActiveFilters: boolean;
    onClearFilters: () => void;
    loadState: LoadState;
}

// The task's own Move button is where focus lands: it is the first control of
// its row and already carries the task id. Ids are UUIDs checked by the
// contract, so one cannot close the attribute selector.
function focusArrival(itemId: string): void {
    const button = document.querySelector<HTMLButtonElement>(`[data-move-item-id="${itemId}"]`);
    const target = button !== null && !button.disabled ? button : document.querySelector<HTMLElement>('#items-heading');
    target?.focus();
}

// Opens a task listed on the home screen in its project (US-20): selects the
// project, clears the filters that could hide the task, then moves focus to the
// task once the list holds it. A task beyond the first page of its project is
// not loaded; focus then goes to the list's heading, the same place a reload
// sends it.
export function useOpenFromHome(projects: ProjectSelection, list: TaskList) {
    const { selectedProjectId, selectProject } = projects;
    const { hasActiveFilters, onClearFilters: clearFilters, loadState } = list;
    const [pending, setPending] = useState<Pending | null>(null);

    useEffect(() => {
        if (pending === null) return;
        if (pending.awaitsReload) {
            if (loadState.status === 'loading') setPending({ ...pending, awaitsReload: false });
            return;
        }
        if (loadState.status === 'loading') return;
        focusArrival(pending.itemId);
        setPending(null);
    }, [pending, loadState]);

    return useCallback(
        (item: AttentionItemDto) => {
            clearFilters();
            selectProject(item.projectId);
            // Either change reloads the list; with neither, it already holds
            // what it will hold.
            const awaitsReload = item.projectId !== selectedProjectId || hasActiveFilters;
            setPending({ itemId: item.id, awaitsReload });
        },
        [clearFilters, selectProject, selectedProjectId, hasActiveFilters],
    );
}
