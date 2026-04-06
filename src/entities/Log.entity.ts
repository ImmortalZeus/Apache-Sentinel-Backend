import mongoose, { Schema, Document } from 'mongoose'

export interface ILog extends Document {
    time: Date;
    remoteIp: string;
    remoteUser: string;
    request: string;
    responseStatusCode: number;
    bytes: number;
    referrer: string;
    userAgent: string;
    requestMethod: string;
    requestUrl: string;
    httpVersion: string;
    countryShort: string;
    countryLong: string;
    region: string;
    city: string;
    zipCode: string;
    timeZone: string;
    browser: string;
    os: string;
    device: string;
}

const LogSchema = new Schema<ILog>({
    time:                   { type: Date, required: true },
    remoteIp:               { type: String, required: true },
    remoteUser:             { type: String, required: true },
    request:                { type: String, required: true },
    responseStatusCode:     { type: Number, required: true },
    bytes:                  { type: Number, required: true },
    referrer:               { type: String, required: true },
    userAgent:              { type: String, required: true },
    requestMethod:          { type: String, required: true },
    requestUrl:             { type: String, required: true },
    httpVersion:            { type: String, required: true },
    countryShort:           { type: String, required: false},
    countryLong:            { type: String, required: false },
    region:                 { type: String, required: false },
    city:                   { type: String, required: false },
    zipCode:                { type: String, required: false },
    timeZone:               { type: String, required: false },
    browser:                { type: String, required: false },
    os:                     { type: String, required: false },
    device:                 { type: String, required: false },
})

export const Log = mongoose.model<ILog>('Log', LogSchema)