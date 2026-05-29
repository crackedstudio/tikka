import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { MonitorService } from "./monitor.service";

type MonitorRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type MonitorResponse = {
  statusCode?: number;
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly monitorService: MonitorService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MonitorRequest>();
    const response = context.switchToHttp().getResponse<MonitorResponse>();
    const method = request.method ?? "UNKNOWN";
    const route = request.originalUrl ?? request.url ?? "unknown";
    const adminId = this.resolveAdminId(request);

    return next.handle().pipe(
      tap(() => {
        this.writeAuditLog({
          adminId,
          route,
          method,
          statusCode: response.statusCode ?? 200,
        });
      }),
      catchError((error: unknown) => {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof (error as { status?: unknown }).status === "number"
            ? ((error as { status: number }).status ?? 500)
            : 500;

        this.writeAuditLog({
          adminId,
          route,
          method,
          statusCode,
        });

        return throwError(() => error);
      }),
    );
  }

  private resolveAdminId(request: MonitorRequest): string {
    const header = request.headers?.["x-admin-id"];
    const adminId = Array.isArray(header) ? header[0] : header;

    return adminId?.trim() || "unknown-admin";
  }

  private writeAuditLog(entry: {
    adminId: string;
    route: string;
    method: string;
    statusCode: number;
  }) {
    void this.monitorService.logAudit({
      adminId: entry.adminId,
      route: entry.route,
      method: entry.method,
      statusCode: entry.statusCode,
      timestamp: new Date().toISOString(),
    });
  }
}
