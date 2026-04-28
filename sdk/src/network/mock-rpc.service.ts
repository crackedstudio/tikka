import { Injectable } from '@nestjs/common';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

export interface MockRpcBehavior {
  delayMs?: number;
  failSimulation?: boolean;
  failSubmission?: boolean;
  failGetTransaction?: boolean;
  errorMessage?: string;
}

@Injectable()
export class MockRpcService {
  private behavior: MockRpcBehavior = {};

  configure(behavior: MockRpcBehavior) {
    this.behavior = { ...this.behavior, ...behavior };
  }

  async simulateTransaction(_tx: any): Promise<any> {
    await this.wait();
    if (this.behavior.failSimulation) {
      throw this.mockError('Mock simulation error');
    }
    return { status: 'SUCCESS', result: 'mock-simulated' };
  }

  async sendTransaction(_tx: any): Promise<any> {
    await this.wait();
    if (this.behavior.failSubmission) {
      throw this.mockError('Mock submission error');
    }
    return {
      status: 'PENDING',
      hash: `mock-hash-${Date.now()}`,
    };
  }

  async getTransaction(hash: string): Promise<any> {
    await this.wait();
    if (this.behavior.failGetTransaction) {
      throw this.mockError('Mock getTransaction error');
    }
    return {
      status: 'SUCCESS',
      hash,
      resultXdr: 'mock-result-xdr',
    };
  }

  private async wait() {
    if (!this.behavior.delayMs) return;
    await new Promise((resolve) => setTimeout(resolve, this.behavior.delayMs));
  }

  private mockError(defaultMessage: string) {
    return new TikkaSdkError(
      TikkaSdkErrorCode.NetworkError,
      this.behavior.errorMessage ?? defaultMessage,
    );
  }
}

