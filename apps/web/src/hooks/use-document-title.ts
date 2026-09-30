import { useEffect } from 'react';

import { labels } from '../labels';

// The tab title of a screen (#454): the screen first, then the product, in the
// order of index.html's own title. Every signed-out screen used to keep that
// title unchanged, so a tab, a bookmark or the history could not tell the
// sign-in page from the privacy policy (RGAA 8.6). The previous title is put
// back when the screen goes: whatever replaces it sets its own.
export function useDocumentTitle(screen: string): void {
    useEffect(() => {
        const previous = document.title;
        document.title = `${screen} | ${labels.pageTitle} | ${labels.productName}`;
        return () => {
            document.title = previous;
        };
    }, [screen]);
}
