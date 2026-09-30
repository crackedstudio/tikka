import { StrKey } from '@stellar/stellar-sdk';

export function normalizeStellarAddress(address: string): string {
  const normalized = address.trim().toUpperCase();
  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new TypeError('Invalid Stellar account address');
  }
  return normalized;
}