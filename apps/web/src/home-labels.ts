import type { Workload } from '@legacy/contracts';

// Wording of the home screen (US-20). Kept apart from labels.ts, which is at
// its line ceiling, and spread into it like the other label modules.
export const homeLabels = {
    homeTitle: 'Needs your attention',
    loadingAttention: 'Loading what needs your attention…',
    loadAttentionFailed: 'Unable to load what needs your attention.',
    invalidAttention: 'The server returned an invalid attention list.',
    attentionOverdue: 'Overdue',
    attentionDueSoon: 'Due today or tomorrow',
    attentionHighPriority: 'High priority',
    attentionOverdueEmpty: 'Nothing overdue.',
    attentionDueSoonEmpty: 'Nothing due today or tomorrow.',
    attentionHighPriorityEmpty: 'No other high-priority task.',
    attentionHasMore: 'More in the projects below.',
    showTasks: 'Show my tasks',
    attentionEmpty(workload: Workload): string {
        switch (workload) {
            case 'none':
                return 'You have no tasks yet. Add one to see here what needs your attention.';
            case 'all_done':
                return 'Everything is done. New tasks with a due date or a high priority will appear here.';
            case 'open':
                return 'Nothing is overdue, due soon or of high priority.';
        }
    },
    attentionInProject(projectName: string): string {
        return `in ${projectName}`;
    },
} as const;
