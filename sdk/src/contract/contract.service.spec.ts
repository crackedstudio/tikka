jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: jest.fn(),
    },
  };
});

import { Networks, rpc } from '@stellar/stellar-sdk';
import { ContractService } from './contract.service';
import { TransactionLifecycle } from './lifecycle';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig, TikkaNetwork } from '../network/network.config';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { WalletAdapter, WalletName } from '../wallet/wallet.interface';
import { ContractFn } from './bindings';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockConfig: NetworkConfig = {
  network: 'testnet' as TikkaNetwork,
  rpcUrl: 'https://rpc.com',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
};

const SOURCE_KEY  = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const TX_HASH     = 'deadbeef'.repeat(8);
const SIGNED_XDR  = 'AAAAAA==';
const ASSEMBLED_XDR = 'BBBBBB==';

const mockSimulateResult = {
  returnValue: 42,
  minResourceFee: '5000',
  assembledXdr: ASSEMBLED_XDR,
  networkPassphrase: Networks.TESTNET,
};

const mockSubmitResult = {
  returnValue: 99,
  txHash: TX_HASH,
  ledger: 300,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildService(withWallet = false) {
  const rpcService  = new RpcService(mockConfig);
  const horizonService = new HorizonService(mockConfig);
  let wallet: jest.Mocked<WalletAdapter> | undefined;

  if (withWallet) {
    wallet = {
      name: WalletName.Mock,
      isAvailable: jest.fn().mockReturnValue(true),
      getPublicKey: jest.fn().mockResolvedValue(SOURCE_KEY),
      signTransaction: jest.fn().mockResolvedValue({ signedXdr: SIGNED_XDR }),
      signMessage: jest.fn(),
      getNetwork: jest.fn(),
    } as unknown as jest.Mocked<WalletAdapter>;
  }

  const service = new ContractService(rpcService, horizonService, mockConfig, wallet);
  const lifecycle = (service as any).lifecycle as TransactionLifecycle;

  return { service, lifecycle, wallet };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContractService.simulateReadOnly()', () => {
  it('calls RpcService.simulateTransaction and decodes the return value', async () => {
    const { service } = buildService();
    const { nativeToScVal, scValToNative } = jest.requireActual('@stellar/stellar-sdk');

    const mockRetVal = 'mock-value';
    const simSpy = jest.spyOn(
      (service as any).rpc,
      'simulateTransaction',
    ).mockResolvedValue({
      minResourceFee: '0',
      result: { retval: nativeToScVal(mockRetVal) },
      transactionData: { build: () => ({ resources: () => ({ instructions: () => 0, diskReadBytes: () => 0, writeBytes: () => 0, footprint: () => ({ readOnly: () => [], readWrite: () => [] }) }) }) },
      stateChanges: [],
      latestLedger: 1,
      _parsed: true,
    } as any);

    jest.spyOn((service as any).horizon, 'loadAccount').mockResolvedValue({
      accountId: () => SOURCE_KEY,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => {},
    } as any);

    (rpc.assembleTransaction as jest.Mock).mockReturnValue({
      build: () => ({ toXDR: () => ASSEMBLED_XDR }),
    });

    const result = await service.simulateReadOnly(ContractFn.IS_PAUSED, []);
    expect(simSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockRetVal);
  });
});

describe('ContractService.invoke()', () => {
  it('throws WalletNotInstalled immediately when no wallet and simulateOnly is false', async () => {
    const { service } = buildService(false);
    await expect(
      service.invoke(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1]),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.WalletNotInstalled });
  });

  it('runs simulate → sign → submit → poll and returns InvokeResult', async () => {
    const { service, lifecycle } = buildService(true);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    jest.spyOn(lifecycle, 'sign').mockResolvedValue(SIGNED_XDR);
    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    const result = await service.invoke<number>(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], {
      sourcePublicKey: SOURCE_KEY,
    });

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      expect.objectContaining({ sourcePublicKey: SOURCE_KEY }),
    );
    expect(lifecycle.sign).toHaveBeenCalledWith(ASSEMBLED_XDR, Networks.TESTNET);
    expect(lifecycle.submit).toHaveBeenCalledWith(SIGNED_XDR);
    expect(lifecycle.poll).toHaveBeenCalledWith(TX_HASH, undefined);
    expect(result).toEqual({ result: 99, txHash: TX_HASH, ledger: 300 });
  });

  it('returns simulated result early when simulateOnly is true', async () => {
    const { service, lifecycle } = buildService(false);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    const signSpy = jest.spyOn(lifecycle, 'sign');

    const result = await service.invoke<number>(ContractFn.BUY_TICKET, [1], {
      simulateOnly: true,
      sourcePublicKey: SOURCE_KEY,
    });

    expect(signSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ result: 42, txHash: '', ledger: 0 });
  });

  it('passes memo through to lifecycle.simulate()', async () => {
    const { service, lifecycle } = buildService(true);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    jest.spyOn(lifecycle, 'sign').mockResolvedValue(SIGNED_XDR);
    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    await service.invoke(ContractFn.BUY_TICKET, [1], {
      sourcePublicKey: SOURCE_KEY,
      memo: { type: 'text', value: 'raffle-ref' },
    });

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1],
      expect.objectContaining({ memo: { type: 'text', value: 'raffle-ref' } }),
    );
  });

  it('passes poll config through to lifecycle.poll()', async () => {
    const { service, lifecycle } = buildService(true);

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);
    jest.spyOn(lifecycle, 'sign').mockResolvedValue(SIGNED_XDR);
    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    await service.invoke(ContractFn.BUY_TICKET, [1], {
      sourcePublicKey: SOURCE_KEY,
      poll: { timeoutMs: 90_000 },
    });

    expect(lifecycle.poll).toHaveBeenCalledWith(TX_HASH, { timeoutMs: 90_000 });
  });
});

describe('ContractService.buildUnsigned()', () => {
  it('returns UnsignedTxResult mapped from lifecycle.simulate()', async () => {
    const { service, lifecycle } = buildService();

    jest.spyOn(lifecycle, 'simulate').mockResolvedValue(mockSimulateResult as any);

    const result = await service.buildUnsigned(ContractFn.BUY_TICKET, [1, SOURCE_KEY, 1], SOURCE_KEY);

    expect(lifecycle.simulate).toHaveBeenCalledWith(
      ContractFn.BUY_TICKET,
      [1, SOURCE_KEY, 1],
      { sourcePublicKey: SOURCE_KEY, fee: undefined },
    );
    expect(result).toEqual({
      unsignedXdr: ASSEMBLED_XDR,
      simulatedResult: 42,
      fee: '5000',
      networkPassphrase: Networks.TESTNET,
    });
  });

  it('throws InvalidParams when sourcePublicKey is empty', async () => {
    const { service } = buildService();
    await expect(
      service.buildUnsigned(ContractFn.BUY_TICKET, [], ''),
    ).rejects.toMatchObject({ code: TikkaSdkErrorCode.InvalidParams });
  });
});

describe('ContractService.submitSigned()', () => {
  it('delegates to lifecycle.submit() and lifecycle.poll() and returns SubmitSignedResult', async () => {
    const { service, lifecycle } = buildService();

    jest.spyOn(lifecycle, 'submit').mockResolvedValue(TX_HASH);
    jest.spyOn(lifecycle, 'poll').mockResolvedValue(mockSubmitResult as any);

    const result = await service.submitSigned(SIGNED_XDR);

    expect(lifecycle.submit).toHaveBeenCalledWith(SIGNED_XDR);
    expect(lifecycle.poll).toHaveBeenCalledWith(TX_HASH);
    expect(result).toEqual({ result: 99, txHash: TX_HASH, ledger: 300 });
  });

  it('throws InvalidParams when signedXdr is empty', async () => {
    const { service } = buildService();
    await expect(service.submitSigned('')).rejects.toMatchObject({
      code: TikkaSdkErrorCode.InvalidParams,
    });
  });
});

describe('ContractService.setWallet() / setContractId()', () => {
  it('propagates setWallet to lifecycle', () => {
    const { service, lifecycle } = buildService();
    const setWalletSpy = jest.spyOn(lifecycle, 'setWallet');

    const mockWallet = { name: WalletName.Mock } as WalletAdapter;
    service.setWallet(mockWallet);

    expect(setWalletSpy).toHaveBeenCalledWith(mockWallet);
  });

  it('propagates setContractId to lifecycle', () => {
    const { service, lifecycle } = buildService();
    const setIdSpy = jest.spyOn(lifecycle, 'setContractId');

    service.setContractId('NEW_ID');

    expect(setIdSpy).toHaveBeenCalledWith('NEW_ID');
  });
});
