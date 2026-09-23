import type { AttentionDto, AttentionItemDto } from '../api/attention-api';
import type { LoadState } from '../hooks/view-state';
import { labels } from '../labels';
import { AttentionGroup } from './attention-group';
import type { EmptyView } from './view-state';
import { ViewState } from './view-state';

export interface HomeSectionProps {
    attention: AttentionDto | null;
    loadState: LoadState;
    onOpen: (item: AttentionItemDto) => void;
    // Named like the hook's own: the section is given useAttention's result
    // whole, and retrying a failed load is reloading it.
    reload: () => void;
}

// Where the empty states send the person: the task form when there is nothing
// to do, the task list when there is work but none of it urgent. Both exist
// below as soon as a project is selected, which the project list does on load.
function focusTarget(selector: string): () => void {
    return () => document.querySelector<HTMLElement>(selector)?.focus();
}

// Three situations, three messages: an account with no task, an account where
// everything is done, and open work of which nothing is urgent. Telling them
// apart is the reason the API answers a workload beside the groups.
function emptyView(attention: AttentionDto | null): EmptyView {
    const isEmpty =
        attention !== null &&
        [attention.overdue, attention.dueSoon, attention.highPriority].every((group) => group.items.length === 0);
    const workload = attention?.workload ?? 'none';
    const action =
        workload === 'open'
            ? { label: labels.showTasks, onAction: focusTarget('#items-heading') }
            : { label: labels.addItem, onAction: focusTarget('#item-name') };

    return { isEmpty, message: labels.attentionEmpty(workload), action };
}

// First in the main landmark, before the projects: after signing in, the
// first thing read is what needs attention across every project (US-20).
export function HomeSection({ attention, loadState, onOpen, reload }: HomeSectionProps) {
    return (
        <section className="panel" aria-labelledby="home-heading" aria-busy={loadState.status === 'loading'}>
            <div className="section-heading">
                <h2 id="home-heading">{labels.homeTitle}</h2>
            </div>
            <ViewState state={loadState} loadingMessage={labels.loadingAttention} empty={emptyView(attention)} onRetry={reload}>
                {attention !== null && (
                    <div className="attention-groups">
                        <AttentionGroup
                            id="overdue"
                            title={labels.attentionOverdue}
                            emptyMessage={labels.attentionOverdueEmpty}
                            items={attention.overdue.items}
                            hasMore={attention.overdue.hasMore}
                            onOpen={onOpen}
                        />
                        <AttentionGroup
                            id="due-soon"
                            title={labels.attentionDueSoon}
                            emptyMessage={labels.attentionDueSoonEmpty}
                            items={attention.dueSoon.items}
                            hasMore={attention.dueSoon.hasMore}
                            onOpen={onOpen}
                        />
                        <AttentionGroup
                            id="high-priority"
                            title={labels.attentionHighPriority}
                            emptyMessage={labels.attentionHighPriorityEmpty}
                            items={attention.highPriority.items}
                            hasMore={attention.highPriority.hasMore}
                            onOpen={onOpen}
                        />
                    </div>
                )}
            </ViewState>
        </section>
    );
}
