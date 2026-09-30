import type { View } from './hooks/use-view';

const PRODUCT_NAME = 'Legacy 22';
const PAGE_TITLE = 'Todo list';

const NAMES: Record<View, string> = {
    home: 'Home',
    projects: 'Projects',
    members: 'Members',
    account: 'Account',
};

// Wording of the frame around the signed-in views: the header, the skip link
// and the navigation between views (#446). Spread into labels.ts like the other
// label modules.
export const viewLabels = {
    skipToContent: 'Skip to content',
    productName: PRODUCT_NAME,
    pageTitle: PAGE_TITLE,
    pageIntro: 'Keep the next useful action visible.',
    viewNavigation: 'Sections',
    viewName(view: View): string {
        return NAMES[view];
    },
    // The tab title names the view, so history, bookmarks and the window list
    // tell the views apart. The part after the bar is index.html's title.
    viewTitle(view: View): string {
        return `${NAMES[view]} | ${PAGE_TITLE} | ${PRODUCT_NAME}`;
    },
    membersNoProject: 'Choose a project to see who is in it.',
    goToProjects: 'Go to projects',
};
