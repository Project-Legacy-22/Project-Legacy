export const labels = {
    // Authentication (US-11b)
    signInTitle: 'Sign in',
    signInIntro: 'Sign in to find your items again.',
    registerTitle: 'Create an account',
    registerIntro: 'An email address and a password are all it takes.',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    emailRequired: 'Enter your email address.',
    passwordRequired: 'Enter your password.',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    register: 'Create account',
    registering: 'Creating the account…',
    switchToRegister: 'No account yet? Create one',
    switchToSignIn: 'Already have an account? Sign in',
    // Says nothing about which of the two was wrong: the API refuses to, and a
    // sharper message here would hand back the list of addresses that exist on
    // the one screen where it shows.
    signInRejected: 'Email address or password is incorrect.',
    registerFailed: 'Unable to create the account.',
    // Same reason: a registration answers the same way whether the address was
    // free or already taken, so the confirmation cannot claim an account exists.
    registerAccepted: 'If that address was available, the account now exists. You can sign in.',
    sessionCheckFailed: 'Unable to check the session.',
    checkingSession: 'Checking your session…',
    signedInAs(email: string): string {
        return `Signed in as ${email}`;
    },
    // Stated before anything is typed rather than after a refusal, which is
    // what US-11b asks for. Built from the contract so the wording cannot drift
    // from what the API actually enforces.
    passwordPolicy(policy: {
        minimumLength: number;
        requiresLowerCase: boolean;
        requiresUpperCase: boolean;
        requiresDigit: boolean;
    }): string {
        const parts = [`at least ${policy.minimumLength} characters`];
        if (policy.requiresLowerCase) parts.push('a lower-case letter');
        if (policy.requiresUpperCase) parts.push('an upper-case letter');
        if (policy.requiresDigit) parts.push('a digit');
        return `Required: ${parts.join(', ')}.`;
    },
    passwordTooShort(minimumLength: number): string {
        return `Enter at least ${minimumLength} characters.`;
    },

    skipToContent: 'Skip to content',
    productName: 'Legacy 22',
    pageTitle: 'Todo list',
    pageIntro: 'Keep the next useful action visible.',
    newItemKicker: 'New item',
    addSectionTitle: 'Add to the list',
    itemNameLabel: 'Item name',
    itemNameRequired: 'Enter an item name.',
    addingItem: 'Adding…',
    addItem: 'Add item',
    currentWorkKicker: 'Current work',
    itemsTitle: 'Items',
    loadingItems: 'Loading items…',
    loadMoreItems: 'Load more items',
    loadingMoreItems: 'Loading more items…',
    retryLoadingMore: 'Try loading more again',
    allItemsLoaded: 'All items loaded',
    retry: 'Try again',
    emptyItems: 'No items yet. Add one above.',
    unnamedItem: 'Unnamed item',
    unnamedItemRemediation: 'This legacy item has no name. Remove it and create it again.',
    unavailableForUnnamedItem: 'Completion unavailable: this legacy item has no name.',
    completed: 'Completed',
    open: 'Open',
    complete: 'Complete',
    reopen: 'Reopen',
    remove: 'Remove',
    invalidItem: 'The server returned an invalid item.',
    invalidItemList: 'The server returned an invalid item list.',
    unreadableResponse: 'The server returned an unreadable response.',
    loadItemsFailed: 'Unable to load the item list.',
    loadMoreItemsFailed: 'Unable to load more items.',
    addItemFailed: 'Unable to add the item.',
    updateItemFailed: 'Unable to update the item.',
    removeItemFailed: 'Unable to remove the item.',
    requestFailed(status: number): string {
        return `The request failed with status ${status}.`;
    },
    itemNameHelp(maximumLength: number): string {
        return `Required. ${maximumLength} characters maximum.`;
    },
    itemNameTooLong(maximumLength: number): string {
        return `Enter no more than ${maximumLength} characters.`;
    },
    itemCount(count: number): string {
        return `${count} ${count === 1 ? 'item' : 'items'}`;
    },
    itemsLoaded(count: number): string {
        return `${count} more ${count === 1 ? 'item' : 'items'} loaded.`;
    },
    completeItem(name: string): string {
        return `Complete: ${name}`;
    },
    reopenItem(name: string): string {
        return `Reopen: ${name}`;
    },
    removeItem(name: string): string {
        return `Remove: ${name}`;
    },
    itemAdded(name: string): string {
        return `${name} added.`;
    },
    itemCompletionChanged(name: string, isCompleted: boolean): string {
        return `${name} marked as ${isCompleted ? 'completed' : 'open'}.`;
    },
    itemRemoved(name: string): string {
        return `${name} removed.`;
    },
} as const;
