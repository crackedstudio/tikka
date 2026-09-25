# Oracle Key Rotation Runbook

This document describes how to securely rotate the Oracle's signing key without downtime and how to verify that rotation succeeded. The oracle supports rotating the active key while ensuring that in-flight requests can still be processed. There is a 24-hour grace period during which the old key remains valid.

## Providers

Depending on how your oracle is configured (via `KEY_PROVIDER`), follow the instructions for your specific provider.

### AWS KMS (Recommended)
1. **Create New Key**: In the AWS Console, create a new asymmetric KMS key (ECC_ED25519) in the same region. Note the new `KeyId` or ARN.
2. **Retrieve Public Key**: Ensure the new public key is known (you can verify via AWS CLI: `aws kms get-public-key --key-id <KeyId>`).
3. **Trigger Rotation**: Use the Admin endpoint to trigger rotation by providing the new key identifier, encrypted appropriately if required.
   ```bash
   curl -X POST http://<oracle-url>/oracle/admin/rotate-key \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"providerType": "aws-kms", "encryptedKey": "<base64_encoded_encrypted_key>"}'
   ```
4. **Update Env**: Update `AWS_KMS_KEY_ID` in your deployment configuration so future restarts use the new key.

### GCP KMS
1. **Create New Key Version**: In Google Cloud Console, navigate to your Key Ring and create a new key version for the asymmetric signing key.
2. **Trigger Rotation**: Use the Admin endpoint similarly, updating the `providerType` and supplying the new `GCP_KMS_KEY_PATH`.
   ```bash
   curl -X POST http://<oracle-url>/oracle/admin/rotate-key \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"providerType": "gcp-kms", "encryptedKey": "<base64_encoded_encrypted_key_path>"}'
   ```
3. **Update Env**: Update `GCP_KMS_KEY_PATH` in your deployment configuration.

### Environment Variable (`env`)
*Note: Using `env` in production is disabled by default unless explicitly overridden.*
1. **Generate New Keypair**: Use Stellar SDK to generate a new keypair.
2. **Trigger Rotation**: 
   ```bash
   curl -X POST http://<oracle-url>/oracle/admin/rotate-key \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"providerType": "env", "encryptedKey": "<base64_encoded_encrypted_secret>"}'
   ```
3. **Update Env**: Update `ORACLE_SECRET_KEY` in your environment.

## Verification
- **Endpoint Response**: The `/oracle/admin/rotate-key` endpoint should return a `200 OK` with the new and previous public keys.
- **Logs**: Check the Oracle logs. You should see `Key rotation completed` and `New public key:` logged.
- **On-chain State**: Verify that the contract's registered oracle key has been updated. The `ContractService` will automatically submit an `update_oracle_key` transaction to the contract.

## Rollback
If the new key is not working correctly, you must roll back before the 24-hour grace period expires.
1. **Trigger Rotation to Old Key**: Send a rotation request using the old key's material/identifier.
2. **Revert Config**: Revert the environment variables (`AWS_KMS_KEY_ID`, `GCP_KMS_KEY_PATH`, or `ORACLE_SECRET_KEY`) to their previous values.
3. **Verify On-chain**: Ensure the on-chain key has reverted.
