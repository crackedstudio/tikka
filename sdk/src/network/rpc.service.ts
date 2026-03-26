import { Injectable } from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';
import { NetworkConfig, RpcConfig, DEFAULT_RPC_CONFIG } from './network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * RpcService
 * Combines Stellar RPC SDK with configurable transport (timeouts, headers, failover).
 */
@Injectable()
export class RpcService {
  private server: rpc.Server;
  private rpcConfig: RpcConfig;

  constructor(
    private readonly networkConfig: NetworkConfig,
    rpcConfig?: RpcConfig,
  ) {
    this.rpcConfig = { ...DEFAULT_RPC_CONFIG, ...rpcConfig };

    this.server = new rpc.Server(networkConfig.rpcUrl, {
      allowHttp: networkConfig.rpcUrl.startsWith('http://'),
    });
  }

  /** Get underlying rpc.Server */
  getServer(): rpc.Server {
    return this.server;
  }

  /** Update RPC config at runtime */
  configure(config: Partial<RpcConfig>): void {
    this.rpcConfig = { ...this.rpcConfig, ...config };
  }

  /** Override RPC endpoint */
  setEndpoint(url: string): void {
    this.rpcConfig.endpoint = url;
    this.server = new rpc.Server(url, {
      allowHttp: url.startsWith('http://'),
    });
  }

  /** Simulate transaction */
  async simulateTransaction(
    tx: any,
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    try {
      return await this.withTimeout(() =>
        this.server.simulateTransaction(tx),
      );
    } catch (err: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /** Send transaction */
  async sendTransaction(
    tx: any,
  ): Promise<rpc.Api.SendTransactionResponse> {
    try {
      return await this.withTimeout(() =>
        this.server.sendTransaction(tx),
      );
    } catch (err: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        `Submission failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /** Poll transaction status */
  async getTransaction(
    hash: string,
    timeoutMs = this.rpcConfig.timeoutMs ?? 30_000,
    intervalMs = 2_000,
  ): Promise<rpc.Api.GetTransactionResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const resp = await this.server.getTransaction(hash);
      if (resp.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        return resp;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new TikkaSdkError(
      TikkaSdkErrorCode.Timeout,
      `Transaction ${hash} not confirmed within ${timeoutMs}ms`,
    );
  }

  /* ---------------- Helpers ---------------- */

  /** Wrap calls with timeout support */
  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const timeoutMs = this.rpcConfig.timeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new TikkaSdkError(
            TikkaSdkErrorCode.Timeout,
            `RPC request timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      fn()
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}