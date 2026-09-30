import type { ReactNode } from 'react';

import type { ItemDto, ItemStatus } from '../api/items-api';
import type { CreateItemBody, ItemPriority, UpdateItemBody } from '@legacy/contracts';
import type { ProjectDto } from '../api/projects-api';
import { labels } from '../labels';
import type {
    AddItemResult,
    ItemActionFeedback,
    ItemsFilterValues,
    ItemsLoadState,
    ItemsPaginationState,
} from '../hooks/use-items';
import { ActionFeedback } from './action-feedback';
import { AddItemSection } from './add-item-section';
import { ItemsSection } from './items-section';
import { PageHeader } from './page-header';
import { ProjectsSection } from './projects-section';
import type { ProjectsSectionProps } from './projects-section';
import { ViewNav } from './view-nav';
import type { View } from '../hooks/use-view';

export interface TodoPageProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    feedback: ItemActionFeedback;
    isAdding: boolean;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    filterValues: ItemsFilterValues;
    hasActiveFilters: boolean;
    onAdd: (body: CreateItemBody) => Promise<AddItemResult>;
    onMove: (item: ItemDto, status: ItemStatus) => Promise<boolean>;
    onReorder: (item: ItemDto, target: ItemDto, direction: 'up' | 'down') => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
    onSearchChange: (search: string) => void;
    onStatusChange: (status: ItemStatus | '') => void;
    onPriorityChange: (priority: ItemPriority | '') => void;
    onDueDateChange: (dueDate: string) => void;
    onNoDueDateChange: (noDueDate: boolean) => void;
    onClearFilters: () => void;
    // Who is signed in, the unread count and the notifications (#456): after
    // the header, so the page's h1 is its first heading and the skip link its
    // first stop, and before the main landmark, which the skip link jumps to.
    session: ReactNode;
    // The views this page does not own (#446), each rendered alone inside the
    // main landmark when it is the current one.
    home: ReactNode;
    members: ReactNode;
    account: ReactNode;
    projects: ProjectsSectionProps;
    view: View;
    onNavigate: (view: View) => void;
    selectedProject: ProjectDto | null;
}

function ProjectsView(props: TodoPageProps) {
    const isMutationDisabled = props.loadState.status !== 'ready';

    return (
        <>
            <ProjectsSection {...props.projects} />
            {props.selectedProject === null ? (
                <section className="panel" aria-labelledby="no-project-heading">
                    <h2 id="no-project-heading">{labels.itemsTitle}</h2>
                    <p className="empty-message">{labels.selectProject}</p>
                </section>
            ) : (
                <>
                    <AddItemSection isAdding={props.isAdding} isDisabled={isMutationDisabled} onAdd={props.onAdd} />
                    <ItemsSection
                        projectName={props.selectedProject.name}
                        items={props.items}
                        loadState={props.loadState}
                        pendingItemIds={props.pendingItemIds}
                        hasNextPage={props.hasNextPage}
                        paginationState={props.paginationState}
                        filterValues={props.filterValues}
                        hasActiveFilters={props.hasActiveFilters}
                        onMove={props.onMove}
                        onReorder={props.onReorder}
                        onUpdate={props.onUpdate}
                        onRemove={props.onRemove}
                        onLoadMore={props.onLoadMore}
                        onRetry={props.onRetry}
                        onSearchChange={props.onSearchChange}
                        onStatusChange={props.onStatusChange}
                        onPriorityChange={props.onPriorityChange}
                        onDueDateChange={props.onDueDateChange}
                        onNoDueDateChange={props.onNoDueDateChange}
                        onClearFilters={props.onClearFilters}
                    />
                </>
            )}
            <ActionFeedback feedback={props.feedback} />
        </>
    );
}

// One view at a time (#446): the signed-in application used to stack every
// section in one page, which the second intermediate defence found hard to
// read. The navigation sits in the header, before the main landmark, so the
// skip link still goes straight to the content.
export function TodoPage(props: TodoPageProps) {
    return (
        <div className="app-shell">
            <a className="skip-link" href="#main-content">
                {labels.skipToContent}
            </a>
            <PageHeader>
                <ViewNav current={props.view} onNavigate={props.onNavigate} />
            </PageHeader>
            <div className="app-body">
                <div className="panel session-card">{props.session}</div>
                <main id="main-content" className="main-content" tabIndex={-1}>
                    {props.view === 'home' && props.home}
                    {props.view === 'projects' && <ProjectsView {...props} />}
                    {props.view === 'members' && props.members}
                    {props.view === 'account' && props.account}
                </main>
            </div>
        </div>
    );
}
