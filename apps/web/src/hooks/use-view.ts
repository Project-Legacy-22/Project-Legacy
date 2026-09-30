import { useCallback, useEffect, useState } from 'react';

import { labels } from '../labels';

// The four views of the signed-in application (#446), which used to be one
// long page. Home first: after signing in, what needs attention is read first
// (US-20).
export const VIEWS = ['home', 'projects', 'members', 'account'] as const;
export type View = (typeof VIEWS)[number];

// Where a view's arrival sends focus: its first heading, which a screen reader
// then reads, and which is how the change is announced. A live region saying
// "Projects" as well would announce it twice.
const HEADINGS: Record<View, string> = {
    home: '#home-heading',
    projects: '#projects-heading',
    members: '#members-heading',
    account: '#credentials-heading',
};

// In the address rather than in memory, like ?privacy: a reload, a bookmark or
// a link sent to someone opens the same view. Anything unknown is home, so an
// old or mistyped link still lands somewhere.
function viewOf(search: string): View {
    const asked = new URLSearchParams(search).get('view');
    return VIEWS.find(view => view === asked) ?? 'home';
}

export function viewHref(view: View): string {
    return `?view=${view}`;
}

interface Arrival {
    // What receives focus once the view is on screen, or null when the caller
    // moves focus itself -- opening a task from home focuses the task.
    target: string | null;
}

export function useView() {
    const [view, setView] = useState<View>(() => viewOf(window.location.search));
    // Null on first render: a page that has just loaded keeps focus at its top,
    // where the skip link is. Only a change of view moves it.
    const [arrival, setArrival] = useState<Arrival | null>(null);

    useEffect(() => {
        const onPopState = () => {
            const next = viewOf(window.location.search);
            setView(next);
            setArrival({ target: HEADINGS[next] });
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useEffect(() => {
        document.title = labels.viewTitle(view);
    }, [view]);

    useEffect(() => {
        if (arrival?.target == null) return;
        // The requested target can be absent -- the task form exists only once
        // a project is selected -- and the heading always exists.
        const target =
            document.querySelector<HTMLElement>(arrival.target) ?? document.querySelector<HTMLElement>(HEADINGS[view]);
        target?.focus();
    }, [arrival, view]);

    const navigate = useCallback((next: View, target: string | null = HEADINGS[next]) => {
        if (viewOf(window.location.search) !== next) window.history.pushState(null, '', viewHref(next));
        setView(next);
        setArrival({ target });
    }, []);

    return { view, navigate };
}
