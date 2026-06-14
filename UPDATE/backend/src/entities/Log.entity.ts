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
    requestMethod:          { type: String, required: false },
    requestUrl:             { type: String, required: false },
    httpVersion:            { type: String, required: false },
})

// Indexes for efficient querying
LogSchema.index({ remoteIp: 1 });
LogSchema.index({ time: -1 });
LogSchema.index({ remoteIp: 1, time: -1 });

export const Log = mongoose.model<ILog>('Log', LogSchema)   