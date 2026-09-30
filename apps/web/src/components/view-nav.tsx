import type { MouseEvent } from 'react';

import { VIEWS, viewHref } from '../hooks/use-view';
import type { View } from '../hooks/use-view';
import { labels } from '../labels';

export interface ViewNavProps {
    current: View;
    onNavigate: (view: View) => void;
}

// A click that asks the browser for something else -- a new tab, a new window,
// a download -- is left to the browser.
function asksForMore(event: MouseEvent): boolean {
    return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

// Links rather than buttons (#446): each view has an address, so it can be
// opened in a new tab or copied, and a link is what a screen reader lists when
// asked for the ways out of a page. aria-current says which one is open.
export function ViewNav({ current, onNavigate }: ViewNavProps) {
    return (
        <nav className="view-nav" aria-label={labels.viewNavigation}>
            <ul>
                {VIEWS.map(view => (
                    <li key={view}>
                        <a
                            href={viewHref(view)}
                            aria-current={view === current ? 'page' : undefined}
                            onClick={event => {
                                if (asksForMore(event)) return;
                                event.preventDefault();
                                onNavigate(view);
                            }}
                        >
                            {labels.viewName(view)}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
