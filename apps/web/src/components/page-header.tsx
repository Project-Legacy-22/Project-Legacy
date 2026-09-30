import type { ReactNode } from 'react';

import { labels } from '../labels';

// The banner. It holds the navigation between views (#446) as its children:
// a banner containing the site's main navigation is the usual shape, and the
// panels of the main landmark are drawn up over the bottom of this block, so
// a navigation placed after it would sit underneath them.
export function PageHeader({ children }: { children?: ReactNode }) {
    return (
        <header className="site-header">
            <div className="header-content">
                <p className="eyebrow">{labels.productName}</p>
                <h1>{labels.pageTitle}</h1>
                <p className="intro">{labels.pageIntro}</p>
                {children}
            </div>
        </header>
    );
}
