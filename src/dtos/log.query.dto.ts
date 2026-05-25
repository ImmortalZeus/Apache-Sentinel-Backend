import { z } from 'zod'

export const LogQueryDTO = z.object({
    ip: z.string().optional(),
    browser: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
    sortBy: z.enum(['time', 'remoteIp', 'browser', 'responseStatusCode']).optional(),
    sortOrder: z.enum(['ASC', 'DESC']).optional()
})

export type LogQueryDTOType = z.infer<typeof LogQueryDTO>