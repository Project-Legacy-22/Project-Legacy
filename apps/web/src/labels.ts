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

    // Personal data (US-13). The deletion wording names what is lost, item by
    // item, because that is what the confirmation is for: an irreversible
    // action announced as "are you sure?" tells the reader nothing.
    personalDataKicker: 'Your data',
    personalDataTitle: 'Export or delete your data',
    personalDataIntro: 'You can take a copy of everything this application holds about you, or have all of it removed.',
    exportData: 'Download my data',
    exportingData: 'Preparing the download…',
    exportDone: 'Your data has been downloaded.',
    exportFailed: 'Unable to prepare the export.',
    exportFilename: 'legacy-22-personal-data-export.json',
    deleteAccountTitle: 'Delete my account',
    deleteAccountWarning: 'Deleting your account removes, immediately and for good:',
    deleteAccountLosesAccount: 'your account and the address it is registered with',
    deleteAccountLosesItems: 'every item you created, including removed items and items in shared projects; other members will lose access to them',
    deleteAccountLosesProjects: 'your project memberships and every project where you are the last member',
    deleteAccountLosesNotifications: 'every notification you received',
    deleteAccountNoRecovery:
        'There is no waiting period and no way back. Download your data first if you want to keep it.',
    deleteAccountConfirmationLabel: 'Confirm by typing your email address',
    deleteAccountConfirmationRequired: 'Type your email address to confirm.',
    deleteAccountConfirmationMismatch: 'That is not the address this account is registered with.',
    deleteAccount: 'Delete my account',
    deletingAccount: 'Deleting the account…',
    deleteAccountFailed: 'Unable to delete the account.',
    deleteAccountConfirmationHelp(email: string): string {
        return `Type ${email} to confirm.`;
    },
    // Password reset (US-28)
    forgotPasswordLink: 'Forgot your password?',
    requestResetTitle: 'Reset your password',
    requestResetIntro: 'Enter your email address and we will send a link to choose a new password.',
    requestReset: 'Send reset link',
    requestingReset: 'Sending…',
    // Neutral on purpose: the API answers the same way whether or not the
    // address has an account, and this screen must not undo that.
    resetRequestAccepted: 'If that address has an account, a reset link is on its way.',
    resetRequestFailed: 'Unable to send a reset link. Try again in a moment.',
    backToSignIn: 'Back to sign in',
    resetPasswordTitle: 'Choose a new password',
    resetPasswordIntro: 'This link is valid once. After this, every other session is signed out.',
    newPasswordLabel: 'New password',
    resetPassword: 'Set new password',
    resettingPassword: 'Saving…',
    resetPasswordSucceeded: 'Your password has been changed and every other session was signed out. You can sign in now.',
    resetPasswordFailed: 'Unable to set a new password.',
    requestNewResetLink: 'Request a new link',

    projectsKicker: 'Workspace',
    projectsTitle: 'Projects',
    projectNameLabel: 'Project name',
    projectNameRequired: 'Enter a project name.',
    createProject: 'Create project',
    creatingProject: 'Creating project…',
    loadingProjects: 'Loading projects…',
    loadMoreProjects: 'Load more projects',
    loadingMoreProjects: 'Loading more projects…',
    retryLoadingMoreProjects: 'Try loading more projects again',
    allProjectsLoaded: 'All projects loaded',
    emptyProjects: 'No project yet. Create one to start grouping items.',
    selectProject: 'Select or create a project first.',
    invalidProject: 'The server returned an invalid project.',
    invalidProjectList: 'The server returned an invalid project list.',
    loadProjectsFailed: 'Unable to load the project list.',
    loadMoreProjectsFailed: 'Unable to load more projects.',
    createProjectFailed: 'Unable to create the project.',
    removeProjectFailed: 'Unable to remove the project.',
    projectNameHelp(maximumLength: number): string {
        return `Required. ${maximumLength} characters maximum.`;
    },
    projectNameTooLong(maximumLength: number): string {
        return `Enter no more than ${maximumLength} characters.`;
    },
    projectItemCount(count: number): string {
        return `${count} ${count === 1 ? 'item' : 'items'}`;
    },
    projectsLoaded(count: number): string {
        return `${count} more ${count === 1 ? 'project' : 'projects'} loaded.`;
    },
    projectCreated(name: string): string {
        return `${name} created.`;
    },
    projectRemoved(name: string): string {
        return `${name} removed.`;
    },
    removeProject(name: string): string {
        return `Remove project: ${name}`;
    },
    confirmProjectRemoval(name: string, itemCount: number): string {
        const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
        return `Remove ${name}? ${items} will be permanently deleted, along with any previously removed items.`;
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
    itemsInProject(name: string): string {
        return `Items in ${name}`;
    },
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
