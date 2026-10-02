# ADR 0002 — Low-stakes PRNG threshold

- **Status:** Accepted
- **Decision:** Keep the PRNG path for prizes under 500 XLM, and say so on the raffle page.
- **Issue:** #1609

## Context

Draws at or above 500 XLM use an Ed25519 proof that anyone can check with the oracle public key. Draws under 500 XLM use `PrngService`: SHA-256 of the request id and raffle id. That output is reproducible, but the contract only checks the payload shape. A third party cannot prove the oracle was forced to submit that seed.

The fee estimator caps low-stakes reveals at 1,000,000 stroops (0.1 XLM) and high-stakes reveals at `ORACLE_MAX_FEE_STROOPS`, which defaults to 100,000,000 stroops (10 XLM). The PRNG path also skips a KMS signing round trip. Typical inclusion fees are far below either cap (on the order of a few hundred stroops), so the usual saving is latency, not 9.9 XLM. The cap is the quantified worst-case saving: up to 9.9 XLM of fee headroom per reveal, in exchange for a draw that is not authenticated by the oracle key.

## Decision

Keep the threshold at 500 XLM.

- Below 500 XLM the product accepts the weaker guarantee in exchange for the lower fee cap and the skipped signing round trip.
- At 500 XLM and above the product pays for a publicly checkable proof.
- The raffle page states which path applies to that prize, including the 500 XLM line.

Moving the line down would put more prizes on the unauthenticated path. Moving it up would spend the high-stakes fee cap on prizes the product currently treats as low-stakes. Neither change is justified by a measured fee that approaches the cap.

## Consequences

Participants in a raffle under 500 XLM can recompute the expected seed, and they can see that this is not the VRF path. They cannot treat that recomputation as proof the oracle submitted it. The cost of that honesty is a short disclosure on the raffle page, not a second randomness scheme.
