import mongoose, { Schema, Document } from 'mongoose'

export interface IBlockedIP extends Document {
    ip: string;
    action: 'block' | 'unblock';
    timestamp: Date;
}

const BlockedIPSchema = new Schema<IBlockedIP>({
    ip: {
        type: String,
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: ['block', 'unblock']
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    }
})

export const BlockedIP = mongoose.model<IBlockedIP>('BlockedIP', BlockedIPSchema)