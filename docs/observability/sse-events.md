# SSE Event Catalogue

The raffle event stream is `GET /raffles/:id/events`. It currently publishes one event:

| Event                  | When it fires                                                     | Payload                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticket_count_updated` | After the backend processes a ticket-count update for the raffle. | `TicketCountUpdatedPayload`: `{ raffleId: number, ticketsSold: number, updatedAt: number }`, where `updatedAt` is Unix epoch time in milliseconds. |

Each frame includes an `id` field, scoped to the raffle stream, and the event name above. The payload type and event name are exported by `@tikka/types` and consumed by the backend and client.

Browsers reconnecting an `EventSource` send the most recently received ID in `Last-Event-ID`. The backend replays newer events from an in-memory buffer of the latest 100 updates per raffle. If the requested ID is older than the retained buffer, the backend sends the latest ticket count so the client can resynchronize; intermediate counts outside the buffer are not replayed. A connection without `Last-Event-ID` receives only new updates.
