import mongoose from "mongoose";
import { Log } from '../entities/log.entity';
import { BlockedIP } from '../entities/blocked.ip.entity';

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
     * Get a reference to the Log collection model.
     */
    getLogModel() {
        return Log
    }

    /**
     * Get a reference to the BlockedIP collection model.
     */
    getBlockedIPModel() {
        return BlockedIP
    }

    /**
     * Query logs with filtering and pagination
     * @param filter Filter criteria for logs
     * @param options Pagination and sorting options
     * @returns Promise with logs and total count
     */
    async queryLogs(
        filter: {
            ip?: string;
            browser?: string;
            startDate?: Date;
            endDate?: Date;
            [key: string]: any;
        },
        options: {
            limit?: number;
            offset?: number;
            sortBy?: string;
            sortOrder?: 'ASC' | 'DESC';
        } = {}
    ): Promise<{
        logs: any[];
        total: number;
        limit: number;
        offset: number;
    }> {
        try {
            // Build MongoDB query
            const query: any = {};

            if (filter.ip) {
                query.remoteIp = filter.ip;
            }

            if (filter.browser) {
                query.browser = { $regex: filter.browser, $options: 'i' }; // Case insensitive
            }

            if (filter.startDate || filter.endDate) {
                query.time = {};
                if (filter.startDate) {
                    query.time.$gte = filter.startDate;
                }
                if (filter.endDate) {
                    query.time.$lte = filter.endDate;
                }
            }

            // Add any additional filters
            Object.keys(filter).forEach(key => {
                if (!['ip', 'browser', 'startDate', 'endDate'].includes(key)) {
                    query[key] = filter[key];
                }
            });

            // Set up options
            const limit = options.limit ?? 0; // 0 means no limit
            const offset = options.offset ?? 0;
            const sortBy = options.sortBy ?? 'time';
            const sortOrder = options.sortOrder ?? 'DESC';
            const sort: any = {};
            sort[sortBy] = sortOrder === 'ASC' ? 1 : -1;

            // Execute queries in parallel for better performance
            const [logs, total] = await Promise.all([
                Log.find(query)
                    .sort(sort)
                    .skip(offset)
                    .limit(limit > 0 ? limit : 0)
                    .exec(),
                Log.countDocuments(query).exec()
            ]);

            return {
                logs,
                total,
                limit: limit > 0 ? limit : 0,
                offset
            };
        } catch (error) {
            console.error('Error querying logs:', error);
            throw error;
        }
    }

    /**
     * Get currently blocked IPs with pagination.
     * Uses aggregation to find IPs whose latest action = 'block'.
     */
    async getBlockedIPs(
        options: {
            limit?: number;
            offset?: number;
            sortBy?: string;
            sortOrder?: 'ASC' | 'DESC';
        } = {}
    ): Promise<{
        ips: string[];
        total: number;
        limit: number;
        offset: number;
    }> {
        try {
            const limit = options.limit ?? 0;
            const offset = options.offset ?? 0;
            const sortBy = options.sortBy ?? 'timestamp';
            const sortOrder = options.sortOrder ?? 'DESC';
            const sort: any = {};
            sort[sortBy] = sortOrder === 'ASC' ? 1 : -1;

            // Aggregation: group by ip, keep latest action, filter only blocked
            const [aggResult, totalResult] = await Promise.all([
                BlockedIP.aggregate([
                    { $sort: { ip: 1, timestamp: -1 } },
                    {
                        $group: {
                            _id: '$ip',
                            latestAction: { $first: '$action' },
                            timestamp: { $first: '$timestamp' }
                        }
                    },
                    { $match: { latestAction: 'block' } },
                    { $sort: sort },
                    { $skip: offset },
                    ...(limit > 0 ? [{ $limit: limit }] : [])
                ]).exec(),
                BlockedIP.aggregate([
                    { $sort: { ip: 1, timestamp: -1 } },
                    {
                        $group: {
                            _id: '$ip',
                            latestAction: { $first: '$action' }
                        }
                    },
                    { $match: { latestAction: 'block' } },
                    { $count: 'total' }
                ]).exec()
            ]);

            const ips = aggResult.map((doc: any) => doc._id);
            const total = totalResult.length > 0 ? totalResult[0].total : 0;

            return {
                ips,
                total,
                limit: limit > 0 ? limit : 0,
                offset
            };
        } catch (error) {
            console.error('Error getting blocked IPs:', error);
            throw error;
        }
    }
}

export const dbService = new DbService()