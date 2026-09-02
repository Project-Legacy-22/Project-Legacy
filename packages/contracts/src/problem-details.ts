import { z } from 'zod';

// RFC 7807 response shape shared by the API error boundary and its clients.
export const ProblemDetails = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
    traceId: z.string(),
});

export type ProblemDetails = z.infer<typeof ProblemDetails>;
