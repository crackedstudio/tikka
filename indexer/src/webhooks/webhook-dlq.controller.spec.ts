import { WebhookDlqController } from "./webhook-dlq.controller";
import { WebhookDeadLetterService } from "./webhook-dlq.service";

describe("WebhookDlqController", () => {
  let controller: WebhookDlqController;
  let dlqService: any;

  beforeEach(() => {
    dlqService = {
      listAll: jest.fn(),
      replay: jest.fn(),
      replayAll: jest.fn(),
    };

    controller = new WebhookDlqController(dlqService);
  });

  describe("GET /admin/webhooks/dlq", () => {
    it("lists all dead-letter entries", async () => {
      dlqService.listAll.mockResolvedValue([{ id: "1" }, { id: "2" }]);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(dlqService.listAll).toHaveBeenCalled();
    });
  });

  describe("POST /admin/webhooks/dlq/replay/:id", () => {
    it("replays a single dead-letter entry", async () => {
      dlqService.replay.mockResolvedValue(true);

      const result = await controller.replay("entry-1");

      expect(result).toEqual({ ok: true });
      expect(dlqService.replay).toHaveBeenCalledWith("entry-1");
    });

    it("returns ok=false when entry not found", async () => {
      dlqService.replay.mockResolvedValue(false);

      const result = await controller.replay("nonexistent");

      expect(result).toEqual({ ok: false });
    });
  });

  describe("POST /admin/webhooks/dlq/replay", () => {
    it("replays all pending dead-letter entries", async () => {
      dlqService.replayAll.mockResolvedValue({
        replayed: 3,
        failed: 0,
        skipped: 0,
      });

      const result = await controller.replayAll();

      expect(result).toEqual({ replayed: 3, failed: 0, skipped: 0 });
    });
  });
});
