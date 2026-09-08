import { ItemProjectNotFound } from '../domain/item.js';
import type { ItemPage, ItemPageQuery, ItemRepository } from '../ports/item-repository.js';

// The project and caller are both mandatory: the list contains the selected
// project's items only when that caller is a member.
export function makeListItems(repository: ItemRepository) {
    return async function listItems(projectId: string, memberId: string, page: ItemPageQuery): Promise<ItemPage> {
        const found = await repository.findPageForMember(projectId, memberId, page);
        if (!found) throw new ItemProjectNotFound(projectId);
        return found;
    };
}
