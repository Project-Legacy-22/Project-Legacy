import { AssigneeNotMember, itemAssignees } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// Every assignee must be a member of the task's project. Checked here so the
// refusal is a clear 404; the database checks it again, against a member
// removed in between.
export async function checkedAssignees(
    repository: ItemRepository,
    projectId: string,
    requested: readonly string[],
): Promise<readonly string[]> {
    const assignees = itemAssignees(requested);
    const memberships = await Promise.all(assignees.map(userId => repository.isProjectMember(projectId, userId)));
    if (memberships.includes(false)) throw new AssigneeNotMember();
    return assignees;
}
