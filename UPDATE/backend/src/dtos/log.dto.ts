// dto/Log.dto.ts
import { z } from 'zod'

export const PublicLogDto = z.object({
    time: z.date(),
    remoteIp: z.string(),
    remoteUser: z.string(),
    request: z.string(),
    responseStatusCode: z.number(),
    bytes: z.number(),
    referrer: z.string(),
    userAgent: z.string(),
    requestMethod: z.string(),
    requestUrl: z.string(),
    httpVersion: z.string(),
    countryShort: z.string().optional(),
    countryLong: z.string().optional(),
    region: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
    timeZone: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    device: z.string().optional(),
})

export type PublicLogDtoType = z.infer<typeof PublicLogDto>

export const CreateLogDto = z.object({
    time: z.date(),
    remoteIp: z.string(),
    remoteUser: z.string(),
    request: z.string(),
    responseStatusCode: z.number(),
    bytes: z.number(),
    referrer: z.string(),
    userAgent: z.string(),
    requestMethod: z.string(),
    requestUrl: z.string(),
    httpVersion: z.string(),
    countryShort: z.string().optional(),
    countryLong: z.string().optional(),
    region: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
    timeZone: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
    device: z.string().optional(),
})

export type CreateLogDtoType = z.infer<typeof CreateLogDto>