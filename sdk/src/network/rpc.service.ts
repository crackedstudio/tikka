import { Injectable } from '@nestjs/common';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { NetworkConfig } from './network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * Thin wrapper around the Soroban RPC client.
 * Provides typed helpers for simulation, submission, and polling.
 */
@Injectable()
export class RpcService {
  private server: SorobanRpc.Server;

  constructor(private readonly config: NetworkConfig) {
    this.server = new SorobanRpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith('http://'),
    });
  }

  /** Underlying SorobanRpc.Server instance */
  getServer(): SorobanRpc.Server {
    return this.server;
  }

  /** Simulate a transaction (read-only or fee estimation). */
  async simulateTransaction(
    tx: any, // Transaction type from stellar-sdk
  ): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    try {
      return await this.server.simulateTransaction(tx);
    } catch (err: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /** Submit (send) a signed transaction. */
  async sendTransaction(
    tx: any,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    try {
      return await this.server.sendTransaction(tx);
    } catch (err: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        `Submission failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /** Poll until a transaction is confirmed or fails. */
  async getTransaction(
    hash: string,
    timeoutMs = 30_000,
    intervalMs = 2_000,
  ): Promise<SorobanRpc.Api.GetTransactionResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const resp = await this.server.getTransaction(hash);
      if (resp.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
        return resp;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new TikkaSdkError(
      TikkaSdkErrorCode.Timeout,
      `Transaction ${hash} not confirmed within ${timeoutMs}ms`,
    );
  }
}
