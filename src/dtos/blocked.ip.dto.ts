import { z } from 'zod'

// IPv4 regex pattern
const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export const BlockedIPQueryDTO = z.object({
    limit: z.coerce.number().int().positive().optional(),
    offset: z.coerce.number().int().nonnegative().optional()
})

export type BlockedIPQueryDTOType = z.infer<typeof BlockedIPQueryDTO>

export const BlockIPRequestDTO = z.object({
    ip: z.string().regex(ipv4Regex, { message: 'Invalid IPv4 address' })
})

export type BlockIPRequestDTOType = z.infer<typeof BlockIPRequestDTO>

export const UnblockIPRequestDTO = z.object({
    ip: z.string().regex(ipv4Regex, { message: 'Invalid IPv4 address' })
})

export type UnblockIPRequestDTOType = z.infer<typeof UnblockIPRequestDTO>