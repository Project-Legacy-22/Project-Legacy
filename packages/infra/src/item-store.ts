import type { ItemRepository } from '@legacy/core-items';

// A repository plus the connection lifecycle the composition root drives. The
// use cases only ever see the ItemRepository half: opening and closing a
// connection is not a business concern.
export interface ItemStore extends ItemRepository {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
}
