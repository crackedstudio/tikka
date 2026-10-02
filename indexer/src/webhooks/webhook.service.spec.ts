import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { WebhookService, WebhookPayload } from "./webhook.service";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import {
  WebhookDeadLetterEntity,
  WebhookDlqReason,
} from "../database/entities/webhook-dead-letter.entity";
import { TracingService } from "../tracing/tracing.service";
import {
  MAX_DELIVERY_ATTEMPTS,
  backoffDelayMs,
} from "./webhook-delivery-policy";
import {
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_SECRET_ENV,
  WEBHOOK_SOURCE_HEADER,
  signWebhookBody,
} from "./webhook-signature";

/**
 * The indexer's outbound webhook delivery.
 *
 * This is a delivery-guarantee surface — retry, backoff, dead-lettering, and
 * signing — so the tests assert what a subscriber and an operator would
 * observe: how many times we called, how long we waited, what the signature
 * verifies to, whether a duplicate is recognisable, and what lands in the
 * dead-letter table.
 */

const SECRET = "test-secret";
const URL = "https://example.com/hook";

function makeWebhook(overrides: Partial<WebhookEntity> = {}): WebhookEntity {
  return {
    id: "wh-1",
    url: URL,
    supportedEvents: ["RaffleCreated"],
    isActive: true,
    failureCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WebhookEntity;
}

function okResponse() {
  return { ok: true, status: 200, statusText: "OK" };
}

function errorResponse(status: number, statusText = "Error") {
  return { ok: false, status, statusText };
}

/** What the backend interceptor does with the signature we send. */
function interceptorAccepts(
  rawBody: string,
  signatureHex: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(Buffer.from(rawBody))
    .digest("hex");
  const providedBuf = Buffer.from(signatureHex, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return (
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf)
  );
}

describe("WebhookService", () => {
  let service: WebhookService;
  let webhookRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let deliveryRepo: { create: jest.Mock; save: jest.Mock };
  let deadLetterRepo: { create: jest.Mock; save: jest.Mock };
  let tracing: { withSpan: jest.Mock };
  let sleepSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;

  /** Delivery audit rows written so far. */
  const deliveries = () =>
    deliveryRepo.save.mock.calls.map((call) => call[0] as any);
  const lastDelivery = () => deliveries().at(-1);
  const deadLetters = () =>
    deadLetterRepo.save.mock.calls.map((call) => call[0] as any);
  const fetchCall = (index: number) => fetchMock.mock.calls[index];
  const headersOf = (index: number) =>
    fetchCall(index)[1].headers as Record<string, string>;

  beforeEach(async () => {
    process.env[WEBHOOK_SIGNATURE_SECRET_ENV] = SECRET;

    webhookRepo = {
      find: jest.fn().mockResolvedValue([makeWebhook()]),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    deliveryRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    deadLetterRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    tracing = { withSpan: jest.fn((_name, _attrs, fn) => fn()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: getRepositoryToken(WebhookEntity), useValue: webhookRepo },
        {
          provide: getRepositoryToken(WebhookDeliveryEntity),
          useValue: deliveryRepo,
        },
        {
          provide: getRepositoryToken(WebhookDeadLetterEntity),
          useValue: deadLetterRepo,
        },
        { provide: TracingService, useValue: tracing },
      ],
    }).compile();

    service = module.get(WebhookService);

    // The policy's delays are asserted, not waited out.
    sleepSpy = jest
      .spyOn(service as any, "sleep")
      .mockResolvedValue(undefined);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env[WEBHOOK_SIGNATURE_SECRET_ENV];
    jest.restoreAllMocks();
  });

  describe("registerWebhook", () => {
    it("stores the url and its subscribed events", async () => {
      await service.registerWebhook(URL, ["RaffleCreated", "RaffleFinalized"]);

      expect(webhookRepo.create).toHaveBeenCalledWith({
        url: URL,
        supportedEvents: ["RaffleCreated", "RaffleFinalized"],
      });
      expect(webhookRepo.save).toHaveBeenCalled();
    });
  });

  describe("dispatch — targeting", () => {
    it("does nothing when no webhook subscribes to the event", async () => {
      webhookRepo.find.mockResolvedValue([
        makeWebhook({ supportedEvents: ["RaffleFinalized"] }),
      ]);

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(deliveries()).toHaveLength(0);
    });

    it("asks the repository for active webhooks only", async () => {
      // Inactive subscriptions are excluded by the query, not in memory; a
      // mock repository does not apply a WHERE clause, so assert the query the
      // service issues rather than implying it filters afterwards.
      webhookRepo.find.mockResolvedValue([]);

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(webhookRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fans out to every matching subscriber", async () => {
      webhookRepo.find.mockResolvedValue([
        makeWebhook({ id: "a", url: "https://a.example/hook" }),
        makeWebhook({ id: "b", url: "https://b.example/hook" }),
      ]);
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        "https://a.example/hook",
        "https://b.example/hook",
      ]);
      expect(deliveries()).toHaveLength(2);
    });

    it("exposes dispatchEvent as an alias", async () => {
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatchEvent("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatch — success", () => {
    it("delivers once, records success, and does not retry", async () => {
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 7 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();
      expect(lastDelivery()).toMatchObject({
        webhookUrl: URL,
        eventType: "RaffleCreated",
        payload: { eventType: "RaffleCreated", data: { raffleId: 7 } },
        status: "success",
        attempts: 1,
        errorResponse: null,
      });
      expect(deadLetters()).toHaveLength(0);
    });
  });

  describe("dispatch — retry policy", () => {
    it("does NOT retry a 4xx and dead-letters it as not retryable", async () => {
      fetchMock.mockResolvedValue(errorResponse(400, "Bad Request"));

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleepSpy).not.toHaveBeenCalled();
      expect(lastDelivery()).toMatchObject({
        status: "failed",
        attempts: 1,
        errorResponse: "HTTP Error: 400 Bad Request",
      });
      expect(deadLetters()).toEqual([
        expect.objectContaining({
          webhookUrl: URL,
          eventType: "RaffleCreated",
          reason: WebhookDlqReason.HTTP_ERROR,
          retryCount: 1,
          retryable: false,
          status: "pending",
        }),
      ]);
    });

    it("retries a 5xx with backoff, then succeeds", async () => {
      fetchMock
        .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledTimes(1);
      expect(sleepSpy).toHaveBeenCalledWith(backoffDelayMs(1));
      expect(lastDelivery()).toMatchObject({ status: "success", attempts: 2 });
      expect(deadLetters()).toHaveLength(0);
    });

    it("retries a 429, which is a 4xx but transient", async () => {
      fetchMock
        .mockResolvedValueOnce(errorResponse(429, "Too Many Requests"))
        .mockResolvedValueOnce(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(lastDelivery()).toMatchObject({ status: "success", attempts: 2 });
    });

    it("backs off exponentially: 2s then 4s", async () => {
      fetchMock.mockResolvedValue(errorResponse(500, "Internal Server Error"));

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(sleepSpy.mock.calls.map((call) => call[0])).toEqual([2_000, 4_000]);
    });

    it("stops at the attempt limit and dead-letters as retryable", async () => {
      fetchMock.mockResolvedValue(errorResponse(503, "Service Unavailable"));

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(MAX_DELIVERY_ATTEMPTS);
      expect(lastDelivery()).toMatchObject({
        status: "failed",
        attempts: MAX_DELIVERY_ATTEMPTS,
        errorResponse: "HTTP Error: 503 Service Unavailable",
      });
      // Exactly one dead letter for the delivery, not one per attempt.
      expect(deadLetters()).toEqual([
        expect.objectContaining({
          reason: WebhookDlqReason.HTTP_ERROR,
          retryCount: MAX_DELIVERY_ATTEMPTS,
          retryable: true,
          errorResponse: "HTTP Error: 503 Service Unavailable",
        }),
      ]);
    });

    it("retries a timeout and dead-letters it as a retryable timeout", async () => {
      // What `AbortSignal.timeout()` produces when a subscriber hangs.
      fetchMock.mockRejectedValue(
        new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      );

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(MAX_DELIVERY_ATTEMPTS);
      expect(deadLetters()).toEqual([
        expect.objectContaining({
          reason: WebhookDlqReason.TIMEOUT,
          retryable: true,
          retryCount: MAX_DELIVERY_ATTEMPTS,
        }),
      ]);
    });

    it("dead-letters an unreachable subscriber as retryable", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(deadLetters()).toEqual([
        expect.objectContaining({
          reason: WebhookDlqReason.UNREACHABLE,
          retryable: true,
        }),
      ]);
    });
  });

  describe("dispatch — signing", () => {
    it("signs the exact bytes it sends, and the receiver's check passes", async () => {
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 7 });

      const [url, init] = fetchCall(0);
      expect(url).toBe(URL);

      const headers = headersOf(0);
      expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
        signWebhookBody(SECRET, init.body as string),
      );
      // Not merely self-consistent: this is the interceptor's own algorithm
      // applied to the bytes on the wire.
      expect(
        interceptorAccepts(
          init.body as string,
          headers[WEBHOOK_SIGNATURE_HEADER],
          SECRET,
        ),
      ).toBe(true);
      expect(headers[WEBHOOK_SOURCE_HEADER]).toBe("indexer");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("sends the same signature on every attempt of one delivery", async () => {
      fetchMock
        .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      // The body is identical across attempts, so the signature must be too —
      // a changing signature would look like tampering to a strict verifier.
      expect(headersOf(0)[WEBHOOK_SIGNATURE_HEADER]).toBe(
        headersOf(1)[WEBHOOK_SIGNATURE_HEADER],
      );
      expect(fetchCall(0)[1].body).toBe(fetchCall(1)[1].body);
    });

    it("delivers unsigned and warns when no secret is configured", async () => {
      delete process.env[WEBHOOK_SIGNATURE_SECRET_ENV];
      const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(headersOf(0)).not.toHaveProperty(WEBHOOK_SIGNATURE_HEADER);
      expect(
        warn.mock.calls.some((call) =>
          String(call[0]).includes(WEBHOOK_SIGNATURE_SECRET_ENV),
        ),
      ).toBe(true);
    });
  });

  describe("dispatch — at-least-once and duplicates", () => {
    it("keeps one delivery id across retries so a duplicate is detectable", async () => {
      fetchMock
        .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(errorResponse(500, "Internal Server Error"))
        .mockResolvedValueOnce(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      const ids = fetchMock.mock.calls.map(
        (call) => (call[1].headers as Record<string, string>)[WEBHOOK_DELIVERY_ID_HEADER],
      );

      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toEqual(expect.any(String));
    });

    it("uses a distinct id for a separate dispatch of the same event", async () => {
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });
      await service.dispatch("RaffleCreated", { raffleId: 1 });

      const first = headersOf(0)[WEBHOOK_DELIVERY_ID_HEADER];
      const second = headersOf(1)[WEBHOOK_DELIVERY_ID_HEADER];

      expect(first).not.toBe(second);
    });

    it("gives each subscriber its own delivery id", async () => {
      webhookRepo.find.mockResolvedValue([
        makeWebhook({ id: "a", url: "https://a.example/hook" }),
        makeWebhook({ id: "b", url: "https://b.example/hook" }),
      ]);
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 1 });

      expect(headersOf(0)[WEBHOOK_DELIVERY_ID_HEADER]).not.toBe(
        headersOf(1)[WEBHOOK_DELIVERY_ID_HEADER],
      );
    });
  });

  describe("dispatch — tracing", () => {
    it("wraps the fan-out and each delivery in a span", async () => {
      fetchMock.mockResolvedValue(okResponse());

      await service.dispatch("RaffleCreated", { raffleId: 7 });

      const spans = tracing.withSpan.mock.calls.map((call) => call[0]);
      expect(spans).toContain("indexer.event.webhook");
      expect(spans).toContain("indexer.event.webhook.deliver");

      const fanOutAttrs = tracing.withSpan.mock.calls.find(
        (call) => call[0] === "indexer.event.webhook",
      )?.[1];
      expect(fanOutAttrs).toMatchObject({
        "event.type": "RaffleCreated",
        "raffle.id": 7,
      });
    });

    it("delivers without a tracing service", async () => {
      const untraced = new WebhookService(
        webhookRepo as any,
        deliveryRepo as any,
        deadLetterRepo as any,
      );
      jest.spyOn(untraced as any, "sleep").mockResolvedValue(undefined);
      fetchMock.mockResolvedValue(okResponse());

      await untraced.dispatch("RaffleCreated", { raffleId: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(tracing.withSpan).not.toHaveBeenCalled();
    });
  });

  describe("dispatch — resilience", () => {
    it("does not throw when the delivery audit row cannot be written", async () => {
      fetchMock.mockResolvedValue(okResponse());
      deliveryRepo.save.mockRejectedValue(new Error("db down"));
      const error = jest.spyOn(Logger.prototype, "error").mockImplementation();

      await expect(
        service.dispatch("RaffleCreated", { raffleId: 1 }),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalled();
    });

    it("does not throw when the dead letter cannot be written", async () => {
      fetchMock.mockResolvedValue(errorResponse(500, "Internal Server Error"));
      deadLetterRepo.save.mockRejectedValue(new Error("db down"));
      jest.spyOn(Logger.prototype, "error").mockImplementation();

      await expect(
        service.dispatch("RaffleCreated", { raffleId: 1 }),
      ).resolves.toBeUndefined();
    });
  });
});

/**
 * The service now injects the dead-letter repository, so the entity has to be
 * registered with TypeORM. It was registered nowhere — not in the DataSource's
 * `entities` (so no repository metadata existed) and not in any `forFeature` —
 * which meant `WebhookDeadLetterService` could not be constructed and the
 * indexer failed to boot. Asserted against the module sources so the
 * registration cannot go missing again.
 */
describe("webhook entity registration", () => {
  const read = (relativePath: string) =>
    readFileSync(resolve(__dirname, relativePath), "utf8");

  function arrayBlockAfter(source: string, marker: string): string {
    const start = source.indexOf(marker);
    if (start === -1) throw new Error(`No "${marker}" in module source`);
    const open = source.indexOf("[", start);
    const close = source.indexOf("]", open);
    return source.slice(open, close);
  }

  it("registers the dead-letter entity on the DataSource", () => {
    const source = read("../database/database.module.ts");
    const entities = arrayBlockAfter(source, "entities:");

    expect(entities).toContain("WebhookDeadLetterEntity");
  });

  it("registers it in TypeOrmModule.forFeature for injection", () => {
    const source = read("./webhooks.module.ts");
    const features = [...source.matchAll(/forFeature\(\[([\s\S]*?)\]/g)].map(
      (match) => match[1],
    );

    expect(features.length).toBeGreaterThan(0);
    expect(
      features.some((block) => block.includes("WebhookDeadLetterEntity")),
    ).toBe(true);
  });
});

/** Guard the payload shape the signature and delivery id are computed over. */
describe("webhook payload contract", () => {
  it("sends the documented envelope", () => {
    const payload: WebhookPayload = {
      eventType: "RaffleCreated",
      data: { raffleId: 1 },
    };
    expect(JSON.stringify(payload)).toBe(
      '{"eventType":"RaffleCreated","data":{"raffleId":1}}',
    );
  });
});
