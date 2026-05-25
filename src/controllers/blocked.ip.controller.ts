import { Request, Response, NextFunction } from 'express';
import { firewallService } from '../services/firewall.service';
import { dbService } from '../services/db.service';
import { BlockedIPQueryDTO, BlockIPRequestDTO, UnblockIPRequestDTO } from '../dtos/blocked.ip.dto';
import { z } from 'zod';

export class BlockedIPController {
    /**
     * Get blocked IPs with pagination
     * GET /api/blocked-ips
     */
    async getBlockedIPs(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate query parameters
            const queryResult = BlockedIPQueryDTO.safeParse(req.query);
            if (!queryResult.success) {
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: queryResult.error.format()
                });
            }

            const { limit, offset } = queryResult.data;

            // Get blocked IPs from database
            const result = await dbService.getBlockedIPs({
                limit: limit,
                offset: offset
            });

            // Return successful response
            res.status(200).json({
                success: true,
                data: result.ips,
                pagination: {
                    total: result.total,
                    limit: result.limit,
                    offset: result.offset,
                    hasMore: result.offset + result.ips.length < result.total
                }
            });
        } catch (error) {
            console.error('Error in getBlockedIPs:', error);
            next(error);
        }
    }

    /**
     * Block an IP address
     * POST /api/blocked-ips/block
     */
    async blockIP(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate request body
            const bodyData = BlockIPRequestDTO.safeParse(req.body);
            if (!bodyData.success) {
                return res.status(400).json({
                    error: 'Invalid request body',
                    details: bodyData.error.format()
                });
            }

            const { ip } = bodyData.data;

            // Block the IP using firewall service
            await firewallService.block(ip);

            // Return successful response
            res.status(200).json({
                success: true,
                message: `IP ${ip} has been blocked`
            });
        } catch (error) {
            console.error('Error in blockIP:', error);
            next(error);
        }
    }

    /**
     * Unblock an IP address
     * POST /api/blocked-ips/unblock
     */
    async unblockIP(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate request body
            const bodyData = UnblockIPRequestDTO.safeParse(req.body);
            if (!bodyData.success) {
                return res.status(400).json({
                    error: 'Invalid request body',
                    details: bodyData.error.format()
                });
            }

            const { ip } = bodyData.data;

            // Unblock the IP using firewall service
            await firewallService.unblock(ip);

            // Return successful response
            res.status(200).json({
                success: true,
                message: `IP ${ip} has been unblocked`
            });
        } catch (error) {
            console.error('Error in unblockIP:', error);
            next(error);
        }
    }
}

export const blockedIPController = new BlockedIPController();