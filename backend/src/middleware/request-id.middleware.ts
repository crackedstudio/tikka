import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers[REQUEST_ID_HEADER] as string || randomUUID();
    
    // Store in request for later use
    req.headers[REQUEST_ID_HEADER] = requestId;
    
    // Set response header
    res.setHeader(REQUEST_ID_HEADER, requestId);
    
    next();
  }
}
