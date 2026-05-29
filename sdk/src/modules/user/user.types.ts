/**
 * Aggregated user participation data from the Tikka raffle contract.
 * @category User
 *
 * Represents a snapshot of a user's complete interaction history
 * with the raffle contract, including all raffles they've entered,
 * tickets purchased, and wins achieved.
 *
 * @example
 * ```ts
 * const participation: UserParticipation = {
 *   address: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36',
 *   totalRafflesEntered: 5,
 *   totalTicketsBought: 12,
 *   totalRafflesWon: 1,
 *   raffleIds: [101, 105, 203, 204, 205]
 * };
 * ```
 */
export interface UserParticipation {
  /** User's Stellar public key address */
  address: string;
  /** Total number of unique raffles this user has participated in */
  totalRafflesEntered: number;
  /** Total number of tickets purchased across all raffles */
  totalTicketsBought: number;
  /** Total number of raffles this user has won */
  totalRafflesWon: number;
  /** Array of raffle IDs this user has participated in */
  raffleIds: number[];
}

/**
 * Parameters for querying user participation statistics.
 * @category User
 *
 * @example
 * ```ts
 * const params: GetParticipationParams = {
 *   address: userAddress
 * };
 * const result = await userService.getParticipation(params);
 * ```
 */
export interface GetParticipationParams {
  /** User's Stellar public key address to query */
  address: string;
}
