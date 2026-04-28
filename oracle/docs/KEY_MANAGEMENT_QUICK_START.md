# Key Management Quick Start

## TL;DR

Replace insecure environment variable key storage with HSM-backed signing.

## Quick Setup

### Development (Current Method - Insecure)

```bash
KEY_PROVIDER=env
ORACLE_PRIVATE_KEY=S...
```

### Production - AWS KMS

```bash
# Install
npm install @aws-sdk/client-kms

# Configure
KEY_PROVIDER=aws-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:...

# IAM permissions needed: kms:Sign, kms:GetPublicKey
```

### Production - Google Cloud KMS

```bash
# Install
npm install @google-cloud/kms

# Configure
KEY_PROVIDER=gcp-kms
GCP_PROJECT_ID=my-project
GCP_KEY_RING_ID=oracle-keys
GCP_KEY_ID=oracle-signing-key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

# Permissions needed: cloudkms.cryptoKeyVersions.useToSign
```

## Environment Variables Reference

| Variable | Provider | Required | Description |
|----------|----------|----------|-------------|
| `KEY_PROVIDER` | All | Yes | `env`, `aws-kms`, or `gcp-kms` |
| `ORACLE_PRIVATE_KEY` | env | Yes | Stellar secret key (S...) |
| `AWS_REGION` | aws-kms | Yes | AWS region (e.g., us-east-1) |
| `AWS_KMS_KEY_ID` | aws-kms | Yes | KMS key ARN or ID |
| `GCP_PROJECT_ID` | gcp-kms | Yes | Google Cloud project ID |
| `GCP_LOCATION_ID` | gcp-kms | No | Location (default: global) |
| `GCP_KEY_RING_ID` | gcp-kms | Yes | KMS key ring ID |
| `GCP_KEY_ID` | gcp-kms | Yes | KMS key ID |
| `GCP_KEY_VERSION` | gcp-kms | No | Key version (default: 1) |

## Verification

Check logs for:
```
KeyService initialized with [provider-type] provider for address: G...
```

## See Also

- [Full Documentation](./KEY_MANAGEMENT.md)
- [IAM Policy Examples](./KEY_MANAGEMENT.md#configure-iam-policy)
- [Kubernetes Deployment](./KEY_MANAGEMENT.md#kubernetes-deployment)
