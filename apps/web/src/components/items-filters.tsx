import { ItemPriority as ItemPrioritySchema, ItemStatus as ItemStatusSchema } from '@legacy/contracts';
import type { ItemPriority, ItemStatus } from '@legacy/contracts';

import { labels } from '../labels';
import type { ItemsFilterValues } from '../hooks/use-items-filters';

export interface ItemsFiltersProps {
    values: ItemsFilterValues;
    hasActiveFilters: boolean;
    isDisabled: boolean;
    onSearchChange: (search: string) => void;
    onStatusChange: (status: ItemStatus | '') => void;
    onPriorityChange: (priority: ItemPriority | '') => void;
    onDueDateChange: (dueDate: string) => void;
    onNoDueDateChange: (noDueDate: boolean) => void;
    onClear: () => void;
}

interface SearchFieldProps {
    value: string;
    isDisabled: boolean;
    onChange: (search: string) => void;
}

function SearchField({ value, isDisabled, onChange }: SearchFieldProps) {
    return (
        <div className="form-field">
            <label htmlFor="items-search">{labels.searchLabel}</label>
            <p id="items-search-help" className="field-help">
                {labels.searchHelp}
            </p>
            <input
                id="items-search"
                name="itemsSearch"
                type="text"
                autoComplete="off"
                value={value}
                aria-describedby="items-search-help"
                disabled={isDisabled}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

interface StatusFilterProps {
    value: ItemStatus | '';
    isDisabled: boolean;
    onChange: (status: ItemStatus | '') => void;
}

function StatusFilter({ value, isDisabled, onChange }: StatusFilterProps) {
    return (
        <div className="form-field">
            <label htmlFor="items-filter-status">{labels.statusFilterLabel}</label>
            <select
                id="items-filter-status"
                value={value}
                disabled={isDisabled}
                onChange={(event) =>
                    onChange(event.target.value === '' ? '' : ItemStatusSchema.parse(event.target.value))
                }
            >
                <option value="">{labels.allStatuses}</option>
                {ItemStatusSchema.options.map((status) => (
                    <option key={status} value={status}>
                        {labels.itemStatus(status)}
                    </option>
                ))}
            </select>
        </div>
    );
}

interface PriorityFilterProps {
    value: ItemPriority | '';
    isDisabled: boolean;
    onChange: (priority: ItemPriority | '') => void;
}

function PriorityFilter({ value, isDisabled, onChange }: PriorityFilterProps) {
    return (
        <div className="form-field">
            <label htmlFor="items-filter-priority">{labels.priorityFilterLabel}</label>
            <select
                id="items-filter-priority"
                value={value}
                disabled={isDisabled}
                onChange={(event) =>
                    onChange(event.target.value === '' ? '' : ItemPrioritySchema.parse(event.target.value))
                }
            >
                <option value="">{labels.allPriorities}</option>
                {ItemPrioritySchema.options.map((priority) => (
                    <option key={priority} value={priority}>
                        {labels.itemPriority(priority)}
                    </option>
                ))}
            </select>
        </div>
    );
}

interface DueDateFilterProps {
    dueDate: string;
    isDisabled: boolean;
    onDueDateChange: (dueDate: string) => void;
    onNoDueDateChange: (noDueDate: boolean) => void;
}

// A native <input type="date"> has no way to represent "no due date": that
// state is its own checkbox, which also disables the date field so the two
// controls cannot disagree about what is being asked for.
function DueDateFilter({ dueDate, isDisabled, onDueDateChange, onNoDueDateChange }: DueDateFilterProps) {
    const noDueDate = dueDate === 'none';

    return (
        <div className="form-field">
            <label htmlFor="items-filter-due-date">{labels.dueDateFilterLabel}</label>
            <input
                id="items-filter-due-date"
                name="itemsFilterDueDate"
                type="date"
                value={noDueDate ? '' : dueDate}
                disabled={isDisabled || noDueDate}
                onChange={(event) => onDueDateChange(event.target.value)}
            />
            <label className="checkbox-field" htmlFor="items-filter-no-due-date">
                <input
                    id="items-filter-no-due-date"
                    name="itemsFilterNoDueDate"
                    type="checkbox"
                    checked={noDueDate}
                    disabled={isDisabled}
                    onChange={(event) => onNoDueDateChange(event.target.checked)}
                />
                {labels.noDueDateFilter}
            </label>
        </div>
    );
}

export function ItemsFilters(props: ItemsFiltersProps) {
    return (
        <div className="items-filters" role="search" aria-label={labels.filtersLabel}>
            <SearchField value={props.values.search} isDisabled={props.isDisabled} onChange={props.onSearchChange} />
            <StatusFilter value={props.values.status} isDisabled={props.isDisabled} onChange={props.onStatusChange} />
            <PriorityFilter
                value={props.values.priority}
                isDisabled={props.isDisabled}
                onChange={props.onPriorityChange}
            />
            <DueDateFilter
                dueDate={props.values.dueDate}
                isDisabled={props.isDisabled}
                onDueDateChange={props.onDueDateChange}
                onNoDueDateChange={props.onNoDueDateChange}
            />
            {props.hasActiveFilters && (
                <button className="button button-secondary" type="button" onClick={props.onClear}>
                    {labels.clearFilters}
                </button>
            )}
        </div>
    );
}
