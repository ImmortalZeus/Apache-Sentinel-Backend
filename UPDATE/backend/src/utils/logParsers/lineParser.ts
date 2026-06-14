import { ILog, Log } from "entities/Log.entity";

class LineParser {
    private readonly MONTH_MAP: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04',
        May: '05', Jun: '06', Jul: '07', Aug: '08',
        Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    }

    private readonly regex: RegExp = new RegExp(
    [
        '^',
        '(?<RemoteIp>',
        '-|',
        '(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])',
        '(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){3}|',
        '(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|',
        '([0-9a-fA-F]{1,4}:){1,7}:|',
        '([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|',
        '([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|',
        '([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|',
        '([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|',
        '([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|',
        '[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|',
        ':((:[0-9a-fA-F]{1,4}){1,7}|:)|',
        'fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|',
        '::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|',
        '([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])',
        '))',
        '\\s',
        '(?<RemoteLogName>-|\\S+)\\s',
        '(?<RemoteUser>-|\\S+)\\s',
        '(\\[(?<DateTime>(?<Date>\\d{2})\\/\\w{3}\\/\\d{4}:(?<Time>\\d{2}:\\d{2}:\\d{2})\\s(?<Timezone>[+-]\\d{4}))\\])\\s',
        '(\\\"(?<Request>' +
            '-' +
            '|' +
            '(?:' +
            '(?<RequestMethod>[A-Z][A-Z0-9_-]*)\\s' +
            '(?<RequestUrl>\\S+)' +
            '(?:\\s(?<HttpVer>HTTP\\/\\d\\.\\d))?' +
            ')' +
            '|' +
            '(?<RawRequest>[^\\"]*)' +
        ')\\\")\\s',
        '(?<Response>-|\\d{3})\\s',
        '(?<Bytes>-|\\d+)\\s',
        '\\\"(?<Referrer>[^\\s]+)\\\"\\s',
        '\\\"(?<UserAgent>[^\\\"]*)\\\"',
        '(?:\\s\\\"(?<ForwardFor>[^\\\"]*)\\\")?',
        '$'
    ].join('')
    )

    private parseApacheDate(dateStr: string): Date {
        // Input: "14/Apr/2026:10:00:00 +0700"
        const match = dateStr.match(
            /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})/
        )
        if (!match) return new Date(NaN)

        const [, day, month, year, time, tz] = match
        const monthNum = this.MONTH_MAP[month] ?? '01'

        // Produces: "2026-04-14T10:00:00+0700"
        return new Date(`${year}-${monthNum}-${day}T${time}${tz}`)
    }

    run(line: string): ILog | null {
        const match = line.match(this.regex)

        if (match?.groups) {
            const groups = match.groups
            const log = new Log({
                time: this.parseApacheDate(groups['DateTime']),
                remoteIp: groups['RemoteIp'],
                remoteUser: groups['RemoteUser'],
                request: groups['Request'],
                responseStatusCode: parseInt(groups['Response']),
                bytes: groups['Bytes'] === '-' ? 0 : parseInt(groups['Bytes']),
                referrer: groups['Referrer'],
                userAgent: groups['UserAgent'],
                requestMethod: groups['RequestMethod'] || null,
                requestUrl: groups['RequestUrl'] || null,
                httpVersion: groups['HttpVer'] || null
            })
            return log
        }

        console.error('Failed to parse line:', line.substring(0, 100))
        return null
    }
}

export const lineParser = new LineParser()