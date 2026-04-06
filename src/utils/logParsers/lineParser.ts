import { ILog, Log } from "entities/Log.entity";

class LineParser {
    //private readonly regex: string = "^" + "(?<RemoteIp>-|(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){3}|(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])))\\s(?<RemoteLogName>-|\\S+)\\s(?<RemoteUser>-|\\S+)\\s(\\[(?<DateTime>(?<Date>\\d{2})\\/\\w{3}\\/\\d{4}:(?<Time>\\d{2}:\\d{2}:\\d{2})\\s(?<Timezone>[+-]\\d{4}))\\])\\s(\\\"(?<Request>(?<RequestMethod>GET|POST|HEAD|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH)\\s(?<RequestUrl>\\/[^\\s]*)\\s(?<HttpVer>HTTP/\\d\\.\\d))\\\")\\s(?<Response>-|\\d{3})\\s(?<Bytes>-|\\d+)\\s\\\"(?<Referrer>[^\\s]+)\\\"\\s\\\"(?<UserAgent>[^\\\"]*+)\\\"(?:\\s\\\"(?<ForwardFor>[^\\\"]*+)\\\")?" + "$";

    private readonly regex: RegExp = /^(?<RemoteIp>-|(?:1?\d{1,2}|2[0-4]\d|25[0-5])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){3}|(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])))\s(?<RemoteLogName>-|\S+)\s(?<RemoteUser>-|\S+)\s(\[(?<DateTime>(?<Date>\d{2})\/\w{3}\/\d{4}:(?<Time>\d{2}:\d{2}:\d{2})\s(?<Timezone>[+-]\d{4}))\])\s(\"(?<Request>(?<RequestMethod>GET|POST|HEAD|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH)\s(?<RequestUrl>\/[^\s]*)\s(?<HttpVer>HTTP\/\d\.\d))\")\s(?<Response>-|\d{3})\s(?<Bytes>-|\d+)\s\"(?<Referrer>[^\s]+)\"\s\"(?<UserAgent>[^\"]*)\"(?:\s\"(?<ForwardFor>[^\"]*)\")?$/;

    run(line: string): ILog {
        const match = line.match(this.regex);

        if (match?.groups) {
            const groups = match.groups;
            const log = new Log({
                time: new Date(groups['DateTime']),
                remoteIp: groups['RemoteIp'],
                remoteUser: groups['RemoteUser'],
                request: groups['Request'],
                responseStatusCode: parseInt(groups['Response']),
                bytes: groups['Bytes'] === '-' ? 0 : parseInt(groups['Bytes']),
                referrer: groups['Referrer'],
                userAgent: groups['UserAgent'],
                requestMethod: groups['RequestMethod'],
                requestUrl: groups['RequestUrl'],
                httpVersion: groups['HttpVer']
            })
            return log;
        }
        throw new Error("Can't parse the given string");
    }
}

export const lineParser = new LineParser()