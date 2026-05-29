import { CallHandler, ExecutionContext, HttpException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { AuditLogInterceptor } from "./audit-log.interceptor";
import { MonitorService } from "./monitor.service";

describe("AuditLogInterceptor", () => {
  const monitorService = {
    logAudit: jest.fn(),
  } as unknown as MonitorService;

  function createContext(statusCode = 200): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "GET",
          originalUrl: "/monitor/stats",
          headers: { "x-admin-id": "admin-1" },
        }),
        getResponse: () => ({
          statusCode,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (monitorService.logAudit as jest.Mock).mockResolvedValue(undefined);
  });

  it("records successful admin actions", (done) => {
    const interceptor = new AuditLogInterceptor(monitorService);
    const context = createContext(200);
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: "admin-1",
            route: "/monitor/stats",
            method: "GET",
            statusCode: 200,
          }),
        );
        done();
      },
      error: done,
    });
  });

  it("records failed admin actions with error status code", (done) => {
    const interceptor = new AuditLogInterceptor(monitorService);
    const context = createContext(200);
    const handler: CallHandler = {
      handle: () => throwError(() => new HttpException("forbidden", 403)),
    };

    interceptor.intercept(context, handler).subscribe({
      next: () => done(new Error("Expected interceptor stream to error")),
      error: () => {
        expect(monitorService.logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: "admin-1",
            route: "/monitor/stats",
            method: "GET",
            statusCode: 403,
          }),
        );
        done();
      },
    });
  });
});
