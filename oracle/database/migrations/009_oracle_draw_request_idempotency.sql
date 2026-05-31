-- Persistent idempotency ledger for draw request events observed by the oracle.

CREATE TABLE oracle_draw_requests (
  id                  BIGSERIAL   PRIMARY KEY,
  request_identity    TEXT        NOT NULL UNIQUE,
  ledger_sequence     INTEGER     NOT NULL,
  tx_hash             TEXT        NOT NULL,
  event_index         INTEGER     NOT NULL,
  raffle_id           INTEGER     NOT NULL,
  contract_request_id TEXT        NOT NULL,
  replayed            BOOLEAN     NOT NULL DEFAULT false,
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oracle_draw_requests_raffle_id
  ON oracle_draw_requests (raffle_id);

CREATE INDEX idx_oracle_draw_requests_chain_event
  ON oracle_draw_requests (ledger_sequence, tx_hash, event_index);

CREATE TABLE oracle_draw_request_replays (
  id                  BIGSERIAL   PRIMARY KEY,
  request_identity    TEXT        NOT NULL,
  ledger_sequence     INTEGER     NOT NULL,
  tx_hash             TEXT        NOT NULL,
  event_index         INTEGER     NOT NULL,
  raffle_id           INTEGER     NOT NULL,
  contract_request_id TEXT        NOT NULL,
  replayed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oracle_draw_request_replays_identity
  ON oracle_draw_request_replays (request_identity);
