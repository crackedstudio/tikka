import { RpcService } from '../../network/rpc.service';
import { NetworkConfig } from '../../network/network.config';
import { ContractFn } from '../../contract/bindings';
import { getRaffleContractId } from '../../contract/constants';
import { ContractResponse } from '../../contract/response';
import { UserParticipation } from './user.types';
import {
  Account,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
  Address,
} from '@stellar/stellar-sdk';
import {
  RaffleNotFoundError,
  TikkaSdkError,
  TikkaSdkErrorCode,
  toTypedContractError,
} from '../../utils/errors';
import { assertValidPublicKey } from '../../utils/validation';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Human-readable description of an unexpected value's shape, for error messages. */
function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** A well-formed zero profile, returned for a user the contract has no record of. */
function emptyProfile(address: string): UserParticipation {
  return {
    address,
    totalRafflesEntered: 0,
    totalTicketsBought: 0,
    totalRafflesWon: 0,
    raffleIds: [],
  };
}

/**
 * Read-only user queries — no wallet or signing dependencies required.
 * Suitable for public dashboards and SSR pages.
 */
export class ReadOnlyUserService {
  private readonly contractId: string;

  constructor(
    private readonly rpcService: RpcService,
    private readonly networkConfig: NetworkConfig,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
  }

  /**
   * Fetch on-chain participation profile for a user address.
   * Alias for `getParticipation`.
   *
   * An address the contract has no participation record for yields a
   * well-formed zero profile rather than `null` or an exception, so callers
   * never have to guess whether a missing value means "no activity" or "the
   * read failed" — a failed read still raises a typed `TikkaSdkError`. A
   * response that is not a participation struct at all raises a typed
   * `InvalidResponse` error instead of becoming a partial profile.
   */
  async getProfile(address: string): Promise<ContractResponse<UserParticipation>> {
    assertValidPublicKey(address);
    try {
      const raw = await this.simulate<unknown>(ContractFn.GET_USER_PARTICIPATION, [
        new Address(address),
      ]);

      return { success: true, status: 'SUCCESS', value: this.mapParticipation(address, raw) };
    } catch (error: unknown) {
      // Contract error #1 (`RaffleNotFound`) is what `get_user_participation`
      // panics with for an unknown address: report it as "no activity yet".
      if (error instanceof RaffleNotFoundError) {
        return { success: true, status: 'SUCCESS', value: emptyProfile(address) };
      }
      throw error;
    }
  }

  /**
   * Fetch the list of raffle IDs a user has participated in.
   * Alias for participation raffle IDs, suitable for building history views.
   */
  async getHistory(address: string): Promise<ContractResponse<number[]>> {
    assertValidPublicKey(address);
    const profile = await this.getProfile(address);
    if (!profile.success) return profile as unknown as ContractResponse<number[]>;
    return { success: true, value: profile.value!.raffleIds };
  }

  private async simulate<T>(method: string, params: any[]): Promise<T> {
    const server = this.rpcService.getServer();
    const contract = new Contract(this.contractId);

    // The anonymous key is intentionally unfunded, so `getAccount` usually
    // fails; fall back to a real `Account` (not a duck-typed object) because
    // `TransactionBuilder` bumps the sequence number when it builds.
    let account: Account;
    try {
      account = await server.getAccount(ANON_KEY);
    } catch {
      account = new Account(ANON_KEY, '0');
    }

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(
          method,
          ...params.map((p) =>
            p instanceof Object && 'toScVal' in p ? p.toScVal() : nativeToScVal(p),
          ),
        ),
      )
      .setTimeout(30)
      .build();

    const simResp = await this.rpcService.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResp)) {
      const errorText = String((simResp as any).error ?? '');
      const message = `Read-only simulation of ${method} failed: ${errorText}`;
      // Surface recognised Soroban panic codes as typed errors instead of a
      // generic failure, so callers can match on a stable error type.
      throw (
        toTypedContractError(message, errorText) ??
        new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, message, errorText)
      );
    }

    const result = (simResp as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (result === undefined) {
      throw new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, `No return value from ${method}`);
    }
    return scValToNative(result) as T;
  }

  /**
   * Decodes `get_user_participation` field by field into the typed profile.
   *
   * The response comes off the chain, so anything that is not a struct — or a
   * counter that is not numeric — is rejected with a typed `InvalidResponse`
   * error rather than silently becoming a partially populated profile.
   */
  private mapParticipation(address: string, raw: unknown): UserParticipation {
    if (raw === null || raw === undefined) return emptyProfile(address);

    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidResponse,
        `Malformed contract response for user ${address}: expected a struct, received ${describeShape(raw)}`,
      );
    }

    const data = raw as Record<string, unknown>;

    return {
      address,
      totalRafflesEntered: readCount(data, 'total_raffles_entered', address),
      totalTicketsBought: readCount(data, 'total_tickets_bought', address),
      totalRafflesWon: readCount(data, 'total_raffles_won', address),
      raffleIds: readRaffleIds(data, address),
    };
  }
}

/**
 * Reads a required field, rejecting a struct that omits it. A missing field
 * means the decoded shape does not match the contract ABI, so the profile
 * would be partially populated — that is a malformed response, not a zero.
 */
function requireField(data: Record<string, unknown>, field: string, address: string): unknown {
  const value = data[field];
  if (value === null || value === undefined) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidResponse,
      `Malformed contract response for user ${address}: missing ${field}`,
    );
  }
  return value;
}

/**
 * Reads an unsigned integer field, accepting the `bigint` that 64-bit XDR
 * integers decode to. Anything that is not numeric is malformed.
 */
function readCount(data: Record<string, unknown>, field: string, address: string): number {
  const value = requireField(data, field, address);
  if (typeof value === 'number' || typeof value === 'bigint') return Number(value);

  throw new TikkaSdkError(
    TikkaSdkErrorCode.InvalidResponse,
    `Malformed contract response for user ${address}: expected ${field} to be numeric, received ${describeShape(value)}`,
  );
}

/** Reads the `raffle_ids` vector. */
function readRaffleIds(data: Record<string, unknown>, address: string): number[] {
  const value = requireField(data, 'raffle_ids', address);

  if (!Array.isArray(value)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidResponse,
      `Malformed contract response for user ${address}: expected raffle_ids to be an array, received ${describeShape(value)}`,
    );
  }

  return value.map((id) => {
    if (typeof id === 'number' || typeof id === 'bigint') return Number(id);
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidResponse,
      `Malformed contract response for user ${address}: expected raffle_ids to contain numbers, received ${describeShape(id)}`,
    );
  });
}
