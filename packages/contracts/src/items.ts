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

export type ItemIdParams = z.infer<typeof ItemIdParams>;
export type CreateItemBody = z.infer<typeof CreateItemBody>;
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;
export type ItemDto = z.infer<typeof ItemDto>;
export type ItemListDto = z.infer<typeof ItemListDto>;
