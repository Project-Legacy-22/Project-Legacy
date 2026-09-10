import type { ItemStatus } from '@legacy/contracts';

import { itemPlanningLabels } from './item-planning-labels';

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
    todo: 'Todo',
    doing: 'In progress',
    done: 'Done',
};

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
    // Why this screen is back (US-27). It says what happened rather than what
    // failed: nothing went wrong, the session reached the end of its life.
    sessionExpired: 'Your session has expired. Sign in again to pick up where you left off.',
    signedInAs(email: string): string {
        return `Signed in as ${email}`;
    },
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutFailed: 'Unable to sign out cleanly. Your session was still cleared on this device.',
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
    notificationsFailed: 'Unable to read your notifications.',
    unreadNotifications(count: number): string {
        return count === 1 ? '1 unread notification' : `${String(count)} unread notifications`;
    },
    // Notifications list (US-18)
    showNotifications: 'Show notifications',
    hideNotifications: 'Hide notifications',
    notificationsTitle: 'Notifications',
    emptyNotifications: 'No notifications yet.',
    notificationItemCreated: 'A new item was created.',
    notificationRead: 'Read',
    notificationUnread: 'Unread',
    markNotificationRead: 'Mark as read',
    markingNotificationRead: 'Marking as read…',
    markNotificationReadFailed: 'Unable to mark this notification as read.',
    loadingNotifications: 'Loading notifications…',
    loadMoreNotifications: 'Load more notifications',
    loadingMoreNotifications: 'Loading more notifications…',
    retryLoadingMoreNotifications: 'Try loading more again',
    allNotificationsLoaded: 'All notifications loaded',
    loadNotificationsFailed: 'Unable to load the notification list.',
    loadMoreNotificationsFailed: 'Unable to load more notifications.',
    invalidNotificationList: 'The server returned an invalid notification list.',
    notificationsLoaded(count: number): string {
        return `${count} more ${count === 1 ? 'notification' : 'notifications'} loaded.`;
    },

    // Privacy policy and consent (US-37). The wording restates
    // docs/gdpr/registre.md; that file changes first, this one follows.
    consentLabel: 'I have read the privacy policy and agree to it',
    consentRequired: 'You must agree to the privacy policy to create an account.',
    readPrivacyPolicy: 'Read the privacy policy',
    privacyPolicy: 'Privacy policy',
    privacyPolicyTitle: 'Privacy policy',
    policyBack: 'Back',
    policyControllerTitle: 'Who is responsible',
    policyControllerBody:
        'The Legacy 22 team decides what this application collects and why. For any question about your data, or to exercise the rights below, write to',
    policyWhatTitle: 'What is collected',
    policyWhatIntro: 'Only what the service needs to work:',
    policyWhatAccount: 'Your email address, and a password stored as a hash that cannot be read back.',
    policyWhatItems: 'The items you write, their state, priority, due date, and when you created or changed them.',
    policyWhatNotifications: 'The notifications you received, as identifiers only.',
    policyWhatLogs: 'Technical logs of requests: method, path, status and duration.',
    policyWhyTitle: 'Why',
    policyWhyBody:
        'Your account and your items exist to provide the service you signed up for. The logs exist to diagnose failures and notice abuse. Nothing here is used for advertising, profiling or resale.',
    policyHowLongTitle: 'How long it is kept',
    policyHowLongAccount: 'Your account, for as long as it exists. Deleting it erases everything immediately.',
    policyHowLongItems: 'An item you remove is erased for good after thirty days.',
    policyHowLongNotifications: 'Notifications are erased after ninety days.',
    policyHowLongLogs: 'Logs are kept thirty days.',
    policyRecipientsTitle: 'Who else sees it',
    policyRecipientsIntro: 'Three providers process data on our behalf, and nobody else:',
    policyRecipientSupabase: 'Supabase, which hosts the database and handles sign-in.',
    policyRecipientVercel: 'Vercel, which serves the application and collects its logs.',
    policyRecipientHibp:
        'Have I Been Pwned, which receives five characters of a hash when you set a new password, so we can refuse one that appears in a known breach. It identifies nobody and nothing is stored.',
    policyRightsTitle: 'Your rights',
    policyRightsBody:
        'You can download everything held about you, and delete your account outright, from the application itself. Both are immediate. For anything else, write to the address above.',
    privacyPolicyVersion(version: string): string {
        return `Version ${version}`;
    },

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
    ...itemPlanningLabels,
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
    kanbanInstructions: 'Drag tasks between columns, or use each task’s Move button for a keyboard-accessible choice.',
    move: 'Move',
    movingItem: 'Moving…',
    confirmMove: 'Confirm move',
    moveDestinationLabel: 'Destination column',
    itemMoveConflict: 'This task changed elsewhere. The latest board has been loaded. Choose a destination and try again.',
    itemMoveConflictRefreshFailed: 'This task changed elsewhere, but the latest board could not be loaded. Try loading the tasks again.',
    unnamedItem: 'Unnamed item',
    unnamedItemRemediation: 'This legacy item has no name. Remove it and create it again.',
    edit: 'Edit',
    editItemNameLabel: 'Edit item name',
    saveItem: 'Save',
    savingItem: 'Saving…',
    cancel: 'Cancel',
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
    columnItemCount(count: number): string {
        return `${count} ${count === 1 ? 'task' : 'tasks'}`;
    },
    emptyColumn(status: ItemStatus): string {
        return `No tasks in ${ITEM_STATUS_LABELS[status]}.`;
    },
    itemStatus(status: ItemStatus): string {
        return ITEM_STATUS_LABELS[status];
    },
    moveItem(name: string): string {
        return `Move: ${name}`;
    },
    moveItemTo(name: string, status: string): string {
        return `Move ${name} to ${status}`;
    },
    itemMoved(name: string, status: string): string {
        return `${name} moved to ${status}.`;
    },
    itemMoveFailed(name: string, status: string): string {
        return `${name} could not be moved. It is back in ${status}. Use Move to try again.`;
    },
    itemsLoaded(count: number): string {
        return `${count} more ${count === 1 ? 'item' : 'items'} loaded.`;
    },
    editItem(name: string): string {
        return `Edit: ${name}`;
    },
    removeItem(name: string): string {
        return `Remove: ${name}`;
    },
    confirmItemRemoval(name: string): string {
        return `Permanently remove ${name}?`;
    },
    itemAdded(name: string): string {
        return `${name} added.`;
    },
    itemSaved(name: string): string {
        return `${name} saved.`;
    },
    itemRemoved(name: string): string {
        return `${name} removed.`;
    },
} as const;
