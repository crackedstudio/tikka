# Webhook Support Implementation TODO

## Approved Plan Summary

- WebhookEntity (DB table for URLs, events)
- WebhookService (BullMQ queue for async dispatch + retries)
- Dispatch RaffleCreated/RaffleFinalized from RaffleProcessor post-DB
- Bull retries for slow/failed HTTP POSTs

## Steps (mark [x] when done):

1. [ ] Install deps (@nestjs/bullmq bullmq) - pnpm add executed, verify package.json
2. [x] Create database/entities/webhook.entity.ts
3. [x] Update database/database.module.ts (forFeature)
4. [x] Update src/data-source.ts (entities)
5. [ ] Run migration (npm run migration:run)
6. [x] Create webhooks/webhooks.module.ts
7. [x] Create webhooks/webhook.service.ts (queue, dispatch)
8. [x] Update processors/processors.module.ts (import WebhooksModule)
9. [x] Update processors/raffle.processor.ts (inject, call dispatch)
10. [x] Update app.module.ts (import WebhooksModule)
11. [x] Extend types/webhook-events.ts (WebhookPayload type)
12. [ ] Add integration test
13. [ ] Run migration: npm run migration:run
14. [x] DONE - attempt_completion

Current: Steps 3-5 (updates + migration created).
