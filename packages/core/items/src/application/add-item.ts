import { createItem, ItemProjectNotFound } from '../domain/item.js';
import { itemCreated } from '../domain/event.js';
import type { Item, ItemPriority } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically. The clock
// is injected on the same grounds, since the event carries the instant the fact
// happened.
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
    now: () => Date;
}

// The creator is an argument, not an injected constant: it is the authenticated
// caller and changes with every request. Access is granted by project membership;
// ownerId only records who created the item and its event.
export function makeAddItem({ repository, newId, now }: AddItemDependencies) {
    return async function addItem(
        name: string,
        projectId: string,
        ownerId: string,
        planning: { priority?: ItemPriority | undefined; dueDate?: string | null | undefined } = {},
    ): Promise<Item> {
        if (!(await repository.isProjectMember(projectId, ownerId))) {
            throw new ItemProjectNotFound(projectId);
        }

        const item = createItem({ id: newId(), name, projectId, ownerId, ...planning });
        const event = itemCreated(newId(), now(), item);

        // One call, so the item and its event share a transaction. Announcing
        // the creation afterwards would leave a window where a failure publishes
        // an event for an item that was never written.
        await repository.save(item, event);

        return item;
    };
}
