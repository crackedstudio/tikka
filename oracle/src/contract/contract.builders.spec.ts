import { ContractBuilders } from './contract.builders';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('ContractBuilders', () => {
  it('should build get_raffle_data invocation', () => {
    const inv = ContractBuilders.buildGetRaffleData(123);
    expect(inv.method).toEqual('get_raffle_data');
    expect(inv.args).toHaveLength(1);
    expect(inv.args[0].u32()).toEqual(123);
  });

  it('should build commit_randomness invocation', () => {
    const inv = ContractBuilders.buildCommitRandomness(123, 'deadbeef');
    expect(inv.method).toEqual('commit_randomness');
    expect(inv.args).toHaveLength(2);
    expect(inv.args[0].u32()).toEqual(123);
    expect(inv.args[1].bytes().toString('hex')).toMatch(/^deadbeef/); // Could have padding
  });

  it('should build reveal_randomness invocation', () => {
    const inv = ContractBuilders.buildRevealRandomness(123, 'secret', 'nonce');
    expect(inv.method).toEqual('reveal_randomness');
    expect(inv.args).toHaveLength(3);
    expect(inv.args[0].u32()).toEqual(123);
    expect(inv.args[1].bytes()).toHaveLength(32);
    expect(inv.args[2].bytes()).toHaveLength(16);
  });

  it('should build receive_randomness invocation', () => {
    const inv = ContractBuilders.buildReceiveRandomness(123, { seed: 'seed', proof: 'proof' });
    expect(inv.method).toEqual('receive_randomness');
    expect(inv.args).toHaveLength(3);
    expect(inv.args[0].u32()).toEqual(123);
    expect(inv.args[1].bytes()).toHaveLength(32);
    expect(inv.args[2].bytes()).toHaveLength(64);
  });
});
