import type { Item } from '../domain/item.js';

// What the use cases require of the outside world, named after the need and not
// after the technology. packages/infra provides the implementations.
export interface ItemRepository {
    findAll(): Promise<Item[]>;
    findById(id: string): Promise<Item | undefined>;
    save(item: Item): Promise<void>;
    update(item: Item): Promise<void>;
    remove(id: string): Promise<void>;
}
