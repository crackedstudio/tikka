# Secure Key Management with HSM Support

## Overview

The Oracle service now supports Hardware Security Module (HSM) backed key management through AWS KMS and Google Cloud KMS. This eliminates the security risk of exposing private keys in environment variables.

## Architecture

### KeyProvider Interface

All key providers implement the `KeyProvider` interface:

```typescript
interface KeyProvider {
  getPublicKey(): Promise<string>;
  getPublicKeyBuffer(): Promise<Buffer>;
  sign(data: Buffer): Promise<Buffer>;
  getProviderType(): string;
}
```

### Available Providers

1. **EnvKeyProvider** (Development/Testing)
   - Loads private key from `ORACLE_PRIVATE_KEY` environment variable
   - ⚠️ Private key is stored in memory
   - Use only for development and testing

2. **AwsKmsKeyProvider** (Production)
   - Uses AWS Key Management Service
   - Private key never leaves the HSM
   - Signing operations performed in AWS infrastructure

3. **GcpKmsKeyProvider** (Production)
   - Uses Google Cloud Key Management Service
   - Private key never leaves the HSM
   - Signing operations performed in Google Cloud infrastructure

## Configuration

### Environment-Based Provider (Default)

```bash
# .env
KEY_PROVIDER=env
ORACLE_PRIVATE_KEY=S...  # Stellar secret key
```

### AWS KMS Provider

```bash
# .env
KEY_PROVIDER=aws-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012

# AWS credentials (via environment or IAM role)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### Google Cloud KMS Provider

```bash
# .env
KEY_PROVIDER=gcp-kms
GCP_PROJECT_ID=my-project
GCP_LOCATION_ID=global
GCP_KEY_RING_ID=oracle-keys
GCP_KEY_ID=oracle-signing-key
GCP_KEY_VERSION=1

# GCP credentials (via GOOGLE_APPLICATION_CREDENTIALS or default credentials)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Setup Instructions

### AWS KMS Setup

#### 1. Install AWS SDK

```bash
cd oracle
npm install @aws-sdk/client-kms
```

#### 2. Create KMS Key

```bash
# Create a KMS key for signing
aws kms create-key \
  --description "Oracle signing key" \
  --key-usage SIGN_VERIFY \
  --key-spec ECC_SECG_P256K1

# Note: AWS KMS doesn't natively support Ed25519
# For Ed25519, consider AWS CloudHSM or store public key separately
```

#### 3. Configure IAM Policy

Create an IAM policy with the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:REGION:ACCOUNT:key/KEY_ID"
    }
  ]
}
```

Attach this policy to:
- The IAM user (if using access keys)
- The IAM role (if using EC2/ECS/EKS)

#### 4. Update Configuration

```bash
# Set environment variables
export KEY_PROVIDER=aws-kms
export AWS_REGION=us-east-1
export AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/...
```

### Google Cloud KMS Setup

#### 1. Install Google Cloud SDK

```bash
cd oracle
npm install @google-cloud/kms
```

#### 2. Create KMS Key Ring and Key

```bash
# Set variables
PROJECT_ID=my-project
LOCATION=global
KEY_RING=oracle-keys
KEY_NAME=oracle-signing-key

# Create key ring
gcloud kms keyrings create $KEY_RING \
  --location $LOCATION \
  --project $PROJECT_ID

# Create signing key with Ed25519
gcloud kms keys create $KEY_NAME \
  --keyring $KEY_RING \
  --location $LOCATION \
  --purpose asymmetric-signing \
  --default-algorithm ec-sign-ed25519 \
  --project $PROJECT_ID
```

#### 3. Configure Service Account Permissions

```bash
# Create service account
gcloud iam service-accounts create oracle-signer \
  --display-name "Oracle Signing Service" \
  --project $PROJECT_ID

# Grant permissions
gcloud kms keys add-iam-policy-binding $KEY_NAME \
  --keyring $KEY_RING \
  --location $LOCATION \
  --member "serviceAccount:oracle-signer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/cloudkms.signerVerifier \
  --project $PROJECT_ID

# Create and download key
gcloud iam service-accounts keys create oracle-key.json \
  --iam-account oracle-signer@${PROJECT_ID}.iam.gserviceaccount.com \
  --project $PROJECT_ID
```

#### 4. Update Configuration

```bash
# Set environment variables
export KEY_PROVIDER=gcp-kms
export GCP_PROJECT_ID=my-project
export GCP_LOCATION_ID=global
export GCP_KEY_RING_ID=oracle-keys
export GCP_KEY_ID=oracle-signing-key
export GCP_KEY_VERSION=1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/oracle-key.json
```

## Kubernetes Deployment

### AWS KMS with IRSA (IAM Roles for Service Accounts)

```yaml
# k8s/deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: oracle-service
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/oracle-kms-role
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oracle
spec:
  template:
    spec:
      serviceAccountName: oracle-service
      containers:
      - name: oracle
        env:
        - name: KEY_PROVIDER
          value: "aws-kms"
        - name: AWS_REGION
          value: "us-east-1"
        - name: AWS_KMS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: oracle-secrets
              key: kms-key-id
```

### Google Cloud KMS with Workload Identity

```yaml
# k8s/deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: oracle-service
  annotations:
    iam.gke.io/gcp-service-account: oracle-signer@PROJECT.iam.gserviceaccount.com
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oracle
spec:
  template:
    spec:
      serviceAccountName: oracle-service
      containers:
      - name: oracle
        env:
        - name: KEY_PROVIDER
          value: "gcp-kms"
        - name: GCP_PROJECT_ID
          value: "my-project"
        - name: GCP_LOCATION_ID
          value: "global"
        - name: GCP_KEY_RING_ID
          value: "oracle-keys"
        - name: GCP_KEY_ID
          value: "oracle-signing-key"
```

## Migration Guide

### From Environment Variables to HSM

1. **Backup Current Setup**
   ```bash
   # Save current private key securely
   echo $ORACLE_PRIVATE_KEY > backup-key.txt
   chmod 600 backup-key.txt
   ```

2. **Set Up HSM Provider**
   - Follow AWS KMS or GCP KMS setup instructions above
   - Test in a staging environment first

3. **Update Configuration**
   ```bash
   # Update environment variables
   export KEY_PROVIDER=aws-kms  # or gcp-kms
   # Add provider-specific variables
   ```

4. **Deploy and Verify**
   ```bash
   # Deploy updated configuration
   kubectl apply -f k8s/
   
   # Check logs
   kubectl logs -f deployment/oracle
   
   # Look for: "KeyService initialized with aws-kms provider"
   ```

5. **Remove Old Private Key**
   ```bash
   # After successful verification
   unset ORACLE_PRIVATE_KEY
   # Remove from secrets/config
   ```

## Security Best Practices

### ✅ DO

- Use HSM providers (AWS KMS, GCP KMS) in production
- Rotate KMS keys regularly
- Use IAM roles/Workload Identity instead of static credentials
- Monitor KMS API usage for anomalies
- Enable CloudTrail/Cloud Audit Logs for KMS operations
- Use separate KMS keys for different environments

### ❌ DON'T

- Use `EnvKeyProvider` in production
- Store private keys in version control
- Share KMS keys across multiple services
- Grant overly broad KMS permissions
- Disable audit logging

## Troubleshooting

### Error: "AWS SDK not installed"

```bash
cd oracle
npm install @aws-sdk/client-kms
```

### Error: "Failed to retrieve public key from AWS KMS"

Check IAM permissions:
```bash
aws kms get-public-key --key-id $AWS_KMS_KEY_ID
```

### Error: "Google Cloud KMS SDK not installed"

```bash
cd oracle
npm install @google-cloud/kms
```

### Error: "Failed to sign data with GCP KMS"

Check service account permissions:
```bash
gcloud kms keys get-iam-policy $KEY_NAME \
  --keyring $KEY_RING \
  --location $LOCATION
```

### Verify Provider is Active

Check application logs:
```bash
# Should see one of:
# "KeyService initialized with env provider"
# "KeyService initialized with aws-kms provider"
# "KeyService initialized with gcp-kms provider"
```

## Performance Considerations

### Latency

- **EnvKeyProvider**: <1ms (in-memory)
- **AwsKmsKeyProvider**: 10-50ms (network call to AWS)
- **GcpKmsKeyProvider**: 10-50ms (network call to GCP)

### Caching

Public keys are cached after first retrieval to minimize HSM calls.

### Rate Limits

- AWS KMS: 1,200 requests/second (shared across operations)
- GCP KMS: 60,000 requests/minute

For high-throughput scenarios, consider request batching or caching strategies.

## Cost Estimation

### AWS KMS

- Key storage: $1/month per key
- Signing operations: $0.03 per 10,000 requests

### Google Cloud KMS

- Key storage: $0.06/month per key version
- Signing operations: $0.03 per 10,000 requests

Example: 1M signatures/month = ~$3 in signing costs

## References

- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [Google Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [Ed25519 Signature Scheme](https://ed25519.cr.yp.to/)
- [Stellar Key Management](https://developers.stellar.org/docs/encyclopedia/security/key-management)
