import mongoose from "mongoose";
import { startFlushLoop } from "./Log.service";

class DbService {
    private readonly mongoUri: string
    private readonly dbName: string

    constructor() {
        const mongoUri = process.env.MONGO_URI
        const dbName = process.env.DB_NAME

        if (!mongoUri) {
            throw new Error(
                "MONGO_URI is not set in the environment variables. Please configure it in the .env file."
            )
        }

        if (!dbName) {
            throw new Error(
                "DB_NAME is not set in the environment variables. Please configure it in the .env file."
            )
        }

        this.mongoUri = mongoUri
        this.dbName = dbName
    }

    async connect(): Promise<void> {
        let uri = this.mongoUri
        if (!uri.includes(this.dbName)) {
            uri = `${uri}/${this.dbName}`
            console.log(`Attempting to connect to database: ${this.dbName}`)
        }

        try {
            await mongoose.connect(uri)
            console.log(`✅ MongoDB Connected Successfully! Using Database: ${this.dbName}`)
            void startFlushLoop(); // Start flushing only after connection
        } catch (error) {
            console.error("❎ MongoDB Connection Failed:", error)
            process.exit(1)
        }
    }

    async disconnect(): Promise<void> {
        await mongoose.disconnect()
        console.log("MongoDB disconnected")
    }

    /**
     * Get a reference to the intended collection model.
     * @param modelName The name used in the Mongoose model definition (e.g., 'Log').
     */
    getCollectionModel<T extends Document>(modelName: string): mongoose.Model<T> {
        const model = mongoose.models[modelName] as mongoose.Model<T> | undefined
        if (!model) {
            throw new Error(
                `Model "${modelName}" not found in mongoose registry. Ensure ${modelName}.entity.ts was loaded.`
            )
        }
        return model
    }
}

export const dbService = new DbService()