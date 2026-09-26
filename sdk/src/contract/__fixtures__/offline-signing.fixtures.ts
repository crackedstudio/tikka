/**
 * Known-good offline-signing fixtures.
 *
 * Generated once with `@stellar/stellar-sdk` from a fixed Ed25519 seed and
 * deterministic transactions (fixed fee, sequence `0`, one `createAccount`
 * operation, explicit `timeBounds`). Ed25519 signatures are deterministic, so
 * the signed XDR and envelope hash are stable: a change in how the SDK builds
 * or signs an envelope breaks these tests instead of a user's transaction.
 *
 * `VALID_TESTNET` expires in 2100, `EXPIRED_TESTNET` in 2001, and
 * `VALID_MAINNET` is signed for the public network with the same seed.
 */
export const TESTNET_KEY_SECRET = 'SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X';
export const TESTNET_KEY_PUBLIC = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57';

export interface OfflineSigningFixture {
  unsignedXdr: string;
  signedXdr: string;
  /** Hex-encoded transaction hash as computed for the fixture's network. */
  hash: string;
}

export const VALID_TESTNET: OfflineSigningFixture = {
  unsignedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAD0hlcAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAA=',
  signedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAD0hlcAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAEURtIsAAAAQISunBTUR+WvO5d+/s3rpmJ/rdFG/bFqc7Q+cm+qoDgjgCOIVgha7jzlCOYZT3SXanToBsq142cxHdsAe6HnXQQ=',
  hash: 'b2a7fc275451e782e25f9fbe9b596714c1c3c4507f8acc79e94a5cade5368bb6',
};

export const EXPIRED_TESTNET: OfflineSigningFixture = {
  unsignedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAA7msoAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAA=',
  signedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAA7msoAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAEURtIsAAAAQM/ywrTWccRNjMKbSSWwTa0TgccB9e+ToUFKLplzKBduAxfKtUSqJfP9QBjrLKpsIicuRDdyDCp/IywbdKljyQM=',
  hash: '03e9b42609deff1bb48e507a987d342ff72054edff3a412387049608e5716fc9',
};

export const VALID_MAINNET: OfflineSigningFixture = {
  unsignedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAD0hlcAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAA=',
  signedXdr:
    'AAAAAgAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAD0hlcAAAAAAAAAAAEAAAAAAAAAAAAAAADqSmxj4pxSCr71UHsTLsX5lUd2rr6+e5JCHuppFEbSLAAAAAAAAAAAAAAAAAAAAAEURtIsAAAAQNItRy9fsWjMBPVy4p+u22kGN9Wt7T+g9IKbr2PqhEMyJq/RScWt31WZIXjZeIPAIECRf49YIGOPcJTdvqShFQY=',
  hash: '22000958f14ea4def95aaea3cc1dc67100ee70a63140208f42acde9f25457b60',
};
