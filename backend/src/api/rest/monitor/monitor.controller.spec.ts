import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../../../auth/decorators/public.decorator";
import { MonitorController } from "./monitor.controller";

describe("MonitorController", () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  });

  it("does not carry the @Public() decorator — anonymous access is rejected", () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        return undefined;
      },
    );

    const handler = () => {};
    const klass = MonitorController;

    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      klass,
    ]);

    expect(isPublic).toBe(false);
  });

  it("does not allow JWT guard to be bypassed for any monitor route", () => {
    const methods = [
      "getJobs",
      "getStats",
      "getLatency",
      "getErrors",
      "getAuditLogs",
      "startBackfill",
      "getBackfillStatus",
      "getMaintenanceMode",
      "setMaintenanceMode",
    ];

    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    for (const method of methods) {
      const handler = (MonitorController.prototype as any)[method];
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        MonitorController,
      ]);
      expect(isPublic).toBe(false);
    }
  });
});
