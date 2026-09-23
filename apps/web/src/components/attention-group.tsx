import type { AttentionItemDto } from '../api/attention-api';
import { formatDueDate } from '../item-due-date';
import { labels } from '../labels';

export interface AttentionGroupProps {
    id: string;
    title: string;
    emptyMessage: string;
    items: readonly AttentionItemDto[];
    hasMore: boolean;
    onOpen: (item: AttentionItemDto) => void;
}

// One row is one button: it opens the task in its project, and a native
// button already answers Enter and Space. Its accessible name is its text --
// the task, where it lives, when it is due and how urgent it is -- so a screen
// reader moving from row to row hears what a sighted person reads.
function AttentionRow({ item, onOpen }: { item: AttentionItemDto; onOpen: () => void }) {
    return (
        <li>
            <button type="button" className="attention-row" onClick={onOpen}>
                <span className="attention-name">{item.name ?? labels.unnamedItem}</span>
                <span className="attention-details">
                    <span>{labels.attentionInProject(item.projectName)}</span>
                    {item.dueDate !== null && (
                        <time dateTime={item.dueDate}>{labels.itemDueDate(formatDueDate(item.dueDate))}</time>
                    )}
                    <span>{labels.itemPriorityDescription(item.priority)}</span>
                </span>
            </button>
        </li>
    );
}

export function AttentionGroup(props: AttentionGroupProps) {
    const headingId = `attention-${props.id}-heading`;

    return (
        <section className="attention-group" aria-labelledby={headingId}>
            <h3 id={headingId}>{props.title}</h3>
            {props.items.length === 0 ? (
                <p className="attention-empty">{props.emptyMessage}</p>
            ) : (
                <ul className="attention-list">
                    {props.items.map((item) => (
                        <AttentionRow key={item.id} item={item} onOpen={() => props.onOpen(item)} />
                    ))}
                </ul>
            )}
            {props.hasMore && <p className="attention-more">{labels.attentionHasMore}</p>}
        </section>
    );
}
