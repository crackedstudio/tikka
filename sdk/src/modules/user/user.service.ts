import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn, RaffleStatus } from '../../contract/bindings';
import {
  UserParticipation,
  GetParticipationParams,
  UserActivitySummary,
  UserRaffleActivity,
  UserTicket,
  GetUserActivityParams,
  WinningEntry,
} from './user.types';
import { assertValidPublicKey } from '../../utils/validation';
import { ContractResponse } from '../../contract/response';

/**
 * @category User
 * @remarks
 * Service for querying user participation data on the Tikka raffle contract.
 * Provides read-only access to user participation statistics including
 * raffle count, ticket purchases, and win history.
 *
 * @example
 * ```ts
 * const userService = app.get(UserService);
 *
 * // Get user's participation data
 * const result = await userService.getParticipation({
 *   address: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
 * });
 *
 * if (result.success && result.value) {
 *   console.log('User participation:');
 *   console.log(`  - Raffles entered: ${result.value.totalRafflesEntered}`);
 *   console.log(`  - Tickets bought: ${result.value.totalTicketsBought}`);
 *   console.log(`  - Raffles won: ${result.value.totalRafflesWon}`);
 *   console.log(`  - Raffle IDs: ${result.value.raffleIds.join(', ')}`);
 * }
 * ```
 */
@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * Aggregates all user's raffle and ticket activity on the contract.
   * Read-only — no signing required.
   *
   * @param params - Parameters containing the user's Stellar public key
   * @returns Promise containing user participation statistics
   * @throws Will reject if address is invalid
   *
   * @example
   * ```ts
   * const participation = await userService.getParticipation({
   *   address: userAddress
   * });
   *
   * if (participation.success) {
   *   console.log(`${participation.value?.totalTicketsBought} tickets purchased`);
   *   console.log(`Participated in raffles: ${participation.value?.raffleIds}`);
   * }
   * ```
   * Retrieves core user participation data from the Soroban contract.
   * Read-only — no signing required.
   *
   * @source contract
   */
  async getParticipation(
    params: GetParticipationParams,
  ): Promise<ContractResponse<UserParticipation>> {
    const { address } = params;
    assertValidPublicKey(address);

    const response = await this.contractService.simulateReadOnly<{
      total_raffles_entered: number;
      total_tickets_bought: number;
      total_raffles_won: number;
      raffle_ids: number[];
    }>(ContractFn.GET_USER_PARTICIPATION, [address]);

    if (response.status !== 'SUCCESS') {
      return { status: 'ERROR', error: response.error };
    }

    const d = response.value!;
    return {
      status: 'SUCCESS',
      value: {
        address,
        totalRafflesEntered: d.total_raffles_entered,
        totalTicketsBought: d.total_tickets_bought,
        totalRafflesWon: d.total_raffles_won,
        raffleIds: d.raffle_ids,
      },
    };
  }

  /**
   * Returns all tickets owned by a user across every raffle they entered.
   *
   * Calls `GET_USER_TICKETS` for each raffle ID returned by `getParticipation`.
   * The result includes per-ticket raffle IDs, suitable for display or refund
   * eligibility checks.
   *
   * @source contract
   */
  async getTickets(address: string): Promise<ContractResponse<UserTicket[]>> {
    assertValidPublicKey(address);

    const participation = await this.getParticipation({ address });
    if (!participation.success) {
      return { success: false, error: participation.error };
    }

    const tickets: UserTicket[] = [];

    for (const raffleId of participation.value!.raffleIds) {
      const res = await this.contractService.simulateReadOnly<number[]>(
        ContractFn.GET_USER_TICKETS,
        [raffleId, address],
      );

      if (res.success && Array.isArray(res.value)) {
        for (const ticketId of res.value) {
          tickets.push({ ticketId, raffleId });
        }
      }
    }

    return { success: true, value: tickets };
  }

  /**
   * Builds an aggregated `UserActivitySummary` from contract data.
   *
   * Aggregates raffles entered, tickets owned, wins, and creator activity
   * entirely from contract RPC calls. Pass `includeIndexerData: true` to
   * additionally annotate tickets with `purchasedAt` timestamps from an
   * indexer (not yet wired — currently returns undefined for indexer fields).
   *
   * Source-of-truth per field:
   * - `raffles`, `tickets`, `wonRaffleIds`, `createdRaffleIds`, `totals`
   *   → contract RPC (simulateReadOnly)
   * - `refundedTicketIds`, `totalRefunded`, `tickets[].purchasedAt`
   *   → indexer/backend (undefined until indexer integration is wired)
   *
   * @source contract (indexer fields are undefined until wired)
   */
  async getActivitySummary(
    params: GetUserActivityParams,
  ): Promise<ContractResponse<UserActivitySummary>> {
    const { address } = params;
    assertValidPublicKey(address);

    const participation = await this.getParticipation({ address });
    if (!participation.success) {
      return { success: false, error: participation.error };
    }

    const { raffleIds, totalRafflesWon } = participation.value!;

    const raffleActivities: UserRaffleActivity[] = [];
    const allTickets: UserTicket[] = [];
    const wonRaffleIds: number[] = [];
    const createdRaffleIds: number[] = [];

    for (const raffleId of raffleIds) {
      // Fetch raffle data (status, creator, winner)
      const raffleRes = await this.contractService.simulateReadOnly<any>(
        ContractFn.GET_RAFFLE_DATA,
        [raffleId],
      );

      // Fetch this user's tickets for the raffle
      const ticketRes = await this.contractService.simulateReadOnly<number[]>(
        ContractFn.GET_USER_TICKETS,
        [raffleId, address],
      );

      const raffleData = raffleRes.success ? raffleRes.value : null;
      const ticketIds: number[] = ticketRes.success && Array.isArray(ticketRes.value)
        ? ticketRes.value
        : [];

      for (const ticketId of ticketIds) {
        allTickets.push({ ticketId, raffleId });
      }

      const isCreator = raffleData?.creator === address;
      const isWinner = raffleData?.winner === address;

      if (isCreator) createdRaffleIds.push(raffleId);
      if (isWinner) wonRaffleIds.push(raffleId);

      raffleActivities.push({
        raffleId,
        status: raffleData?.status ?? RaffleStatus.Open,
        ticketIds,
        isCreator,
        isWinner,
        prizeAmount: isWinner && raffleData?.prize_amount != null
          ? String(raffleData.prize_amount)
          : undefined,
      });
    }

    const summary: UserActivitySummary = {
      address,
      raffles: raffleActivities,
      tickets: allTickets,
      wonRaffleIds,
      createdRaffleIds,
      totals: {
        rafflesEntered: raffleIds.length,
        ticketsBought: allTickets.length,
        rafflesWon: totalRafflesWon,
        rafflesCreated: createdRaffleIds.length,
      },
      // Indexer-backed fields — not yet wired
      refundedTicketIds: undefined,
      totalRefunded: undefined,
    };

    return { success: true, value: summary };
  }
 /**
   * Returns claimable prize entries for a given address.
   *
   * Filters the user's activity summary for won raffles, then checks
   * on-chain raffle data to determine whether each prize has been claimed.
   *
   * A prize is considered unclaimed when the raffle is Finalized and the
   * winner field still matches the address (the contract clears this on claim).
   *
   * @param address - The winner's Stellar public key
   * @returns Array of WinningEntry objects, one per won raffle
   */
  async getWinnings(address: string): Promise {
    assertValidPublicKey(address);

    const activityResult = await this.getActivitySummary({ address });
    if (!activityResult.success) {
      return { success: false, error: activityResult.error };
    }

    const wonRaffles = activityResult.value!.raffles.filter((r) => r.isWinner);

    const winnings: WinningEntry[] = [];

    for (const raffle of wonRaffles) {
      const raffleRes = await this.contractService.simulateReadOnly<any>(
        ContractFn.GET_RAFFLE_DATA,
        [raffle.raffleId],
      );

      const raffleData = raffleRes.success ? raffleRes.value : null;

      // A prize is claimed when the on-chain winner field no longer matches.
      const claimed = raffleData ? raffleData.winner !== address : false;

      winnings.push({
        raffleId: raffle.raffleId,
        prizeAmount: raffle.prizeAmount ?? '0',
        prizeAsset: raffleData?.asset ?? 'XLM',
        claimed,
      });
    }

    return { success: true, value: winnings };
  }
}
