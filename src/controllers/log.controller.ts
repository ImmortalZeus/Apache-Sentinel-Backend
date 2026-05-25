import { Request, Response, NextFunction } from 'express';
import { dbService } from '../services/db.service';
import { LogQueryDTO } from '../dtos/log.query.dto';
import { z } from 'zod';

export class LogController {
    /**
     * Get logs with filtering and pagination
     * GET /api/logs
     */
    async getLogs(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate query parameters
            const queryParams = LogQueryDTO.safeParse(req.query);
            if (!queryParams.success) {
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: queryParams.error.format()
                });
            }

            const { ip, browser, startDate, endDate, limit, offset, sortBy, sortOrder } = queryParams.data;

            // Convert string dates to Date objects if provided
            const filter: any = {};
            if (ip) filter.ip = ip;
            if (browser) filter.browser = browser;
            if (startDate) filter.startDate = new Date(startDate);
            if (endDate) filter.endDate = new Date(endDate);

            const options: any = {};
            if (limit !== undefined) options.limit = limit;
            if (offset !== undefined) options.offset = offset;
            if (sortBy) options.sortBy = sortBy;
            if (sortOrder) options.sortOrder = sortOrder;

            // Query logs from database
            const result = await dbService.queryLogs(filter, options);

            // Return successful response
            res.status(200).json({
                success: true,
                data: result.logs,
                pagination: {
                    total: result.total,
                    limit: result.limit,
                    offset: result.offset,
                    hasMore: result.offset + result.logs.length < result.total
                }
            });
        } catch (error) {
            console.error('Error in getLogs:', error);
            next(error);
        }
    }
}

export const logController = new LogController();