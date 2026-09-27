/**
 * Reusable end-to-end flows shared by `examples/` scripts and the opt-in
 * testnet integration suite (`src/test/integration`).
 *
 * They live under `src/` so test files inside `rootDir` can import them
 * without pulling in the example entry points (whose `main()` side effects
 * and out-of-root paths break `tsc --noEmit` and Jest).
 */

import { RaffleService } from '../modules/raffle/raffle.service';
import { TicketService } from '../modules/ticket/ticket.service';
import { RaffleParams } from '../modules/raffle/raffle.types';
import { BuyTicketResult } from '../modules/ticket/ticket.types';
import { RaffleTxResponse, TxResponse } from '../contract/response';
import { TxMemo } from '../contract/contract.service';

export async function createRaffleFlow(
  raffleService: RaffleService,
  params?: Partial<RaffleParams>,
): Promise<RaffleTxResponse<number>> {
  const ticketPrice = params?.ticketPrice ?? process.env.TIKKA_TICKET_PRICE ?? '1';
  const assetCode =
    (typeof params?.asset === 'string' ? params.asset : params?.asset?.code) ??
    process.env.TIKKA_ASSET_CODE ??
    'XLM';
  const assetIssuer =
    (typeof params?.asset === 'object' ? params.asset.issuer : undefined) ??
    process.env.TIKKA_ASSET_ISSUER ??
    '';
  const maxTickets = params?.maxTickets ?? parseInt(process.env.TIKKA_MAX_TICKETS ?? '50', 10);
  const durationHours = parseInt(process.env.TIKKA_DURATION_HOURS ?? '24', 10);
  const endTime = params?.endTime ?? Date.now() + durationHours * 60 * 60 * 1000;
  const metadataCid = params?.metadataCid ?? process.env.TIKKA_METADATA_CID ?? '';

  const asset = assetIssuer ? { code: assetCode, issuer: assetIssuer } : { code: assetCode };

  return raffleService.create({
    ticketPrice,
    asset,
    maxTickets,
    endTime,
    allowMultiple: params?.allowMultiple ?? true,
    metadataCid,
  });
}

export async function buyTicketsFlow(
  ticketService: TicketService,
  params: { raffleId: number; quantity?: number },
): Promise<RaffleTxResponse<BuyTicketResult>> {
  const quantity = params.quantity ?? parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);
  return ticketService.buy({ raffleId: params.raffleId, quantity });
}

export async function cancelRaffleFlow(
  raffleService: RaffleService,
  params: { raffleId: number; memo?: TxMemo },
): Promise<TxResponse<void>> {
  return raffleService.cancel(params);
}
