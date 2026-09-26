import { z } from 'zod';

export const HealthResponse = z.object({
    status: z.enum(['ready', 'unavailable']),
    dependencies: z.object({
        database: z.enum(['up', 'down']),
        broker: z.enum(['up', 'down']),
    }),
});

export type HealthResponseDto = z.infer<typeof HealthResponse>;
