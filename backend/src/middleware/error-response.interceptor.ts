import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { REQUEST_ID_HEADER } from './request-id.middleware';

@Injectable()
export class ErrorResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers?.[REQUEST_ID_HEADER] as string;

    return next.handle().pipe(
      catchError((error) => {
        // Add request ID to error response
        if (error.response && typeof error.response === 'object') {
          error.response.requestId = requestId;
        } else if (error.message) {
          // For other error types, create a structured response
          error.response = {
            message: error.message,
            requestId,
          };
        }
        
        return throwError(() => error);
      }),
    );
  }
}
