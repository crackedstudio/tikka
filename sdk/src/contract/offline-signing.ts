import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export function buildUnsignedOfflineTransaction(
  sourcePublicKey: string,
  networkPassphrase: string = Networks.TESTNET,
): string {
  const account = new Account(sourcePublicKey, '0');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.createAccount({
        destination: sourcePublicKey,
        startingBalance: '0',
      }),
    )
    .setTimeout(30)
    .build();

  return tx.toXDR();
}

export function signTransactionOffline(
  unsignedXdr: string,
  secretKey: string,
  networkPassphrase: string = Networks.TESTNET,
): string {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  const keypair = Keypair.fromSecret(secretKey);
  tx.sign(keypair);
  return tx.toXDR();
}

export function verifyOfflineSignature(
  signedXdr: string,
  publicKey: string,
  networkPassphrase: string = Networks.TESTNET,
): boolean {
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const keypair = Keypair.fromPublicKey(publicKey);
  const hash = tx.hash();
  const signature = tx.signatures[0]?.signature();

  return signature ? keypair.verify(hash, signature) : false;
}
