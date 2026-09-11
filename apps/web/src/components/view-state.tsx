import type { ReactNode } from 'react';

import type { LoadState } from '../hooks/view-state';
import { labels } from '../labels';

// The three states every view of this application goes through before it has
// anything to show, and the single place that renders them.
//
// Four views were improvising them. The task list had a loading line, an error
// with a retry and an empty line; the projects panel had the same three, worded
// and marked up differently; the notifications panel had a loading line, an
// error with no way out at all, and an empty line that named no action. Nothing
// made them agree, so the day one gained aria-busy the other three did not hear
// about it.
//
// It renders a fragment rather than a wrapper, because the state of a view
// belongs to the region that holds it: each caller's <section> carries
// aria-busy. One carrier, on the element a screen reader already announces, is
// what EN-48 asks for -- putting it on the loading text instead would say the
// text is busy, not the panel.

// What a view shows when it has nothing.
//
// A union rather than an optional action: an empty state that offers no way to
// fill it is one of the two defects EN-48 names, so a view that genuinely
// cannot be filled by the person reading it has to say why in `unfillable`
// instead of leaving the action out and looking finished.
export type EmptyView = { isEmpty: boolean } & (
    | { message: string; action: { label: string; onAction: () => void } }
    | { message: string; unfillable: string }
);

export interface ViewStateProps {
    state: LoadState;
    // Announced politely by role="status" when it appears. It says what is
    // loading, not that something is: 'Loading items…' tells somebody who
    // cannot see the panel which panel spoke.
    loadingMessage: string;
    // Absent when the view has no such thing as empty: the session screen is
    // either checking or failed, and a dummy empty state to satisfy the type
    // would be a lie written to compile.
    empty?: EmptyView;
    // Re-runs the request the error came from. Required, because an error with
    // no way back leaves reloading the page as the only exit, which is the
    // other defect EN-48 names.
    onRetry: () => void;
    // Whether the view keeps its shape when it holds nothing. The Kanban board
    // does: its three columns are the workflow, not the data, and each column
    // says for itself that it is empty. A list does not -- a list of nothing is
    // nothing, and rendering an empty <ul> beside the message says it twice.
    keepsChildrenWhenEmpty?: boolean;
    // Absent on a view that has nothing of its own to show once it is ready:
    // the session screen is only ever checking or failed.
    children?: ReactNode;
}

function EmptyMessage({ empty }: { empty: EmptyView }) {
    return (
        <div className="empty-message">
            <p>{empty.message}</p>
            {'action' in empty && (
                <button
                    className="button button-secondary"
                    type="button"
                    onClick={empty.action.onAction}
                >
                    {empty.action.label}
                </button>
            )}
        </div>
    );
}

// What the four cases resolve to, kept out of the component so neither it nor
// this stays over the complexity ceiling.
//
//   loading, nothing yet  -> the line alone. An empty view announced while the
//                            answer is still on its way says there is nothing,
//                            which is not known yet.
//   loading, data already -> the line and the data. A refresh must not blank
//                            what somebody is reading.
//   ready, nothing        -> the empty view, with the action that fills it.
//   ready, data           -> the data.
function resolve(
    isLoading: boolean,
    empty: EmptyView | undefined,
    keepsChildrenWhenEmpty: boolean,
): { emptyView: EmptyView | undefined; showsChildren: boolean } {
    const isEmpty = empty?.isEmpty === true;
    const emptyView = isEmpty && !isLoading ? empty : undefined;
    const showsChildren = !isEmpty || (emptyView !== undefined && keepsChildrenWhenEmpty);

    return { emptyView, showsChildren };
}

// role="alert" and not status: a failure interrupts what the person asked for,
// and they have a decision to make about it.
function StateError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="error-message" role="alert">
            <p>{message}</p>
            <button className="button button-secondary" type="button" onClick={onRetry}>
                {labels.retry}
            </button>
        </div>
    );
}

export function ViewState({
    state,
    loadingMessage,
    empty,
    onRetry,
    keepsChildrenWhenEmpty = false,
    children,
}: ViewStateProps) {
    if (state.status === 'error') {
        return <StateError message={state.message} onRetry={onRetry} />;
    }

    const isLoading = state.status === 'loading';
    const { emptyView, showsChildren } = resolve(isLoading, empty, keepsChildrenWhenEmpty);

    return (
        <>
            {isLoading && (
                <p className="status-message" role="status">
                    {loadingMessage}
                </p>
            )}
            {emptyView !== undefined && <EmptyMessage empty={emptyView} />}
            {showsChildren && children}
        </>
    );
}
