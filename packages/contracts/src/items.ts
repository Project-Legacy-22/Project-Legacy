import { z } from 'zod';

// The shapes accepted at the HTTP boundary. Everything past this point works on
// values the compiler and the runtime both vouch for.
//
// The length bound mirrors the items_name_length_chk CHECK constraint in the
// initial migration and MAX_ITEM_NAME_LENGTH in the item domain. Validating it
// here too rejects an over-long name with a 400 at the boundary instead of
// letting it reach the database and come back as a 500.
export const MAX_ITEM_NAME_LENGTH = 255;

const itemNameSchema = z.string().trim().min(1).max(MAX_ITEM_NAME_LENGTH);

export const ItemIdParams = z.object({
    id: z.uuid(),
});

export const CreateItemBody = z.object({
    name: itemNameSchema,
});

export const UpdateItemBody = z.object({
    name: itemNameSchema,
    completed: z.boolean(),
});

// The legacy database can still contain null names. Responses acknowledge
// that historical state while every new write remains subject to itemNameSchema.
export const ItemDto = z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    completed: z.boolean(),
});

export const ItemListDto = z.array(ItemDto);

// The collection is bounded server-side, where the inherited route returned the
// whole table. Asking for nothing gets the default; asking for too much is
// refused rather than served a page nobody sized.
export const DEFAULT_ITEM_PAGE_SIZE = 20;
export const MAX_ITEM_PAGE_SIZE = 100;

// A cursor is opaque: only the adapter that minted it knows how to read it. The
// boundary checks it is a plausible string and stops there, which keeps the
// pagination scheme out of the public contract.
const CURSOR_MAX_LENGTH = 256;

const pageSize = z.coerce.number().int().min(1).max(MAX_ITEM_PAGE_SIZE);

export const ListItemsQuery = z.object({
    limit: pageSize.default(DEFAULT_ITEM_PAGE_SIZE),
    cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});

export const ItemPageDto = z.object({
    items: ItemListDto,
    // Null rather than absent, so a finished collection reads differently from
    // a server that forgot to say where the next page starts.
    nextCursor: z.string().nullable(),
});

export type ItemIdParams = z.infer<typeof ItemIdParams>;
export type CreateItemBody = z.infer<typeof CreateItemBody>;
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;
export type ItemDto = z.infer<typeof ItemDto>;
export type ItemListDto = z.infer<typeof ItemListDto>;
export type ListItemsQuery = z.infer<typeof ListItemsQuery>;
export type ItemPageDto = z.infer<typeof ItemPageDto>;
