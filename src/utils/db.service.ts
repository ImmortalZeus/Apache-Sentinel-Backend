import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

export const connectDB = async (): Promise<mongoose.Connection> => {
    if (!MONGO_URI) {
        throw new Error(
            "MONGO_URI is not set in the environment variables. Please configure it in the .env file.",
        );
    }

    if (!DB_NAME) {
        throw new Error(
            "DB_NAME is not set in the environment variables. Please configure it in the .env file.",
        );
    }

    let uriToUse = MONGO_URI;

    if (!MONGO_URI.includes(DB_NAME)) {
        uriToUse = `${MONGO_URI}/${DB_NAME}`;
        console.log(`Attempting to connect to database: ${DB_NAME}`);
    }

    try {
      const connection = await mongoose.connect(uriToUse);
        console.log(
            `✅ MongoDB Connected Successfully! Using Database: ${DB_NAME}`,
        );
        return mongoose.connection;
    } catch (error) {
        console.error("❎ MongoDB Connection Failed:", error);
        process.exit(1);
    }
};

/**
 * Get a reference to the intended collection model.
 * @param modelName The name used in the Mongoose model definition (e.g., 'Log').
 * @returns {mongoose.Model<T>} The Mongoose model for the collection.
 */
export const getCollectionModel = <T extends Document>(modelName: string) => {
    // Explicitly check and use the model name passed in, as it reflects the entity file.
    const Model = mongoose.models[modelName] as mongoose.Model<T> | null;
    if (!Model) {
        throw new Error(
        `Model "${modelName}" not found in mongoose registry. Ensure ${modelName}.entity.ts was loaded.`,
        );
    }
    return Model;
};
