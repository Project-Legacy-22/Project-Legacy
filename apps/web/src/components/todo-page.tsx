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
    // Sections this page does not own, rendered inside its main landmark. The
    // alternative was to place them after the page, which would leave content
    // outside every landmark and out of reach of a screen reader navigating by
    // region.
    children?: ReactNode;
    projects: ProjectsSectionProps;
    selectedProject: ProjectDto | null;
}

export function TodoPage(props: TodoPageProps) {
    const isMutationDisabled = props.loadState.status !== 'ready';

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main-content">
                {labels.skipToContent}
            </a>
            <PageHeader />
            <main id="main-content" className="main-content" tabIndex={-1}>
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
                {props.children}
            </main>
        </div>
    );
}
