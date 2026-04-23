# Migration Guide: Environment Variables to HSM

## Overview

This guide walks you through migrating from insecure environment variable key storage to HSM-backed key management.

## Pre-Migration Checklist

- [ ] Choose HSM provider (AWS KMS or Google Cloud KMS)
- [ ] Set up HSM key and permissions
- [ ] Test in staging environment
- [ ] Document rollback procedure
- [ ] Schedule maintenance window (minimal downtime)

## Migration Steps

### Phase 1: Preparation (No Downtime)

#### 1. Create HSM Key

**AWS KMS:**
```bash
aws kms create-key \
  --description "Oracle signing key - Production" \
  --key-usage SIGN_VERIFY \
  --key-spec ECC_SECG_P256K1 \
  --tags TagKey=Environment,TagValue=production
```

**Google Cloud KMS:**
```bash
gcloud kms keys create oracle-signing-key-prod \
  --keyring oracle-keys \
  --location global \
  --purpose asymmetric-signing \
  --default-algorithm ec-sign-ed25519
```

#### 2. Configure IAM/Service Account

**AWS:**
```bash
# Create IAM policy
aws iam create-policy \
  --policy-name OracleKMSSigningPolicy \
  --policy-document file://docs/iam-policies/aws-kms-policy.json

# Attach to role (EKS/ECS) or user
aws iam attach-role-policy \
  --role-name oracle-service-role \
  --policy-arn arn:aws:iam::ACCOUNT:policy/OracleKMSSigningPolicy
```

**GCP:**
```bash
# Create service account
gcloud iam service-accounts create oracle-signer-prod \
  --display-name "Oracle Signing Service - Production"

# Grant permissions
gcloud kms keys add-iam-policy-binding oracle-signing-key-prod \
  --keyring oracle-keys \
  --location global \
  --member "serviceAccount:oracle-signer-prod@PROJECT.iam.gserviceaccount.com" \
  --role roles/cloudkms.signerVerifier
```

#### 3. Install Dependencies

```bash
cd oracle

# For AWS KMS
npm install @aws-sdk/client-kms

# For Google Cloud KMS
npm install @google-cloud/kms
```

### Phase 2: Staging Validation (No Production Impact)

#### 1. Update Staging Configuration

```bash
# staging.env
KEY_PROVIDER=aws-kms  # or gcp-kms
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:...

# Keep old config as backup
# ORACLE_PRIVATE_KEY=S...  # commented out
```

#### 2. Deploy to Staging

```bash
# Update staging deployment
kubectl apply -f k8s/staging/

# Verify logs
kubectl logs -f deployment/oracle -n staging

# Expected log:
# "KeyService initialized with aws-kms provider for address: G..."
```

#### 3. Run Integration Tests

```bash
# Test VRF computation
npm run test:integration

# Test transaction signing
npm run test:e2e

# Monitor for errors
kubectl logs -f deployment/oracle -n staging | grep -i error
```

#### 4. Performance Testing

```bash
# Measure signing latency
# Expected: 10-50ms for HSM vs <1ms for env provider

# Load test
# Ensure throughput meets requirements
```

### Phase 3: Production Migration (Minimal Downtime)

#### 1. Backup Current Configuration

```bash
# Save current secrets
kubectl get secret oracle-secrets -n production -o yaml > backup-secrets.yaml

# Save current deployment
kubectl get deployment oracle -n production -o yaml > backup-deployment.yaml
```

#### 2. Update Production Secrets

```bash
# Create new secret with HSM configuration
kubectl create secret generic oracle-secrets-hsm \
  --from-literal=key-provider=aws-kms \
  --from-literal=aws-region=us-east-1 \
  --from-literal=aws-kms-key-id=arn:aws:kms:... \
  -n production
```

#### 3. Update Deployment Configuration

```yaml
# k8s/production/deployment.yaml
spec:
  template:
    spec:
      containers:
      - name: oracle
        env:
        - name: KEY_PROVIDER
          valueFrom:
            secretKeyRef:
              name: oracle-secrets-hsm
              key: key-provider
        - name: AWS_REGION
          valueFrom:
            secretKeyRef:
              name: oracle-secrets-hsm
              key: aws-region
        - name: AWS_KMS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: oracle-secrets-hsm
              key: aws-kms-key-id
        # Remove ORACLE_PRIVATE_KEY reference
```

#### 4. Rolling Deployment

```bash
# Apply updated deployment
kubectl apply -f k8s/production/deployment.yaml

# Watch rollout
kubectl rollout status deployment/oracle -n production

# Monitor logs
kubectl logs -f deployment/oracle -n production
```

#### 5. Verify Production

```bash
# Check logs for successful initialization
kubectl logs deployment/oracle -n production | grep "KeyService initialized"

# Monitor for errors
kubectl logs deployment/oracle -n production | grep -i error

# Check metrics
# - Signing operations succeeding
# - No increase in error rate
# - Latency within acceptable range
```

### Phase 4: Cleanup (After Successful Migration)

#### 1. Remove Old Secrets (After 24-48 Hours)

```bash
# Verify everything is working
# Monitor for 24-48 hours

# Remove old secret
kubectl delete secret oracle-secrets -n production

# Remove backup files from secure location
rm backup-secrets.yaml
```

#### 2. Update Documentation

- [ ] Update deployment docs
- [ ] Update runbooks
- [ ] Update disaster recovery procedures
- [ ] Notify team of changes

## Rollback Procedure

If issues occur during migration:

### Quick Rollback

```bash
# Restore previous deployment
kubectl apply -f backup-deployment.yaml

# Verify rollback
kubectl rollout status deployment/oracle -n production

# Check logs
kubectl logs -f deployment/oracle -n production
```

### Full Rollback

```bash
# Restore secrets
kubectl apply -f backup-secrets.yaml

# Restore deployment
kubectl apply -f backup-deployment.yaml

# Verify
kubectl get pods -n production
kubectl logs -f deployment/oracle -n production
```

## Troubleshooting

### Issue: "AWS SDK not installed"

```bash
cd oracle
npm install @aws-sdk/client-kms
# Rebuild Docker image
docker build -t oracle:latest .
```

### Issue: "Access Denied" from KMS

```bash
# Verify IAM permissions
aws kms describe-key --key-id $AWS_KMS_KEY_ID

# Test signing
aws kms sign \
  --key-id $AWS_KMS_KEY_ID \
  --message-type RAW \
  --signing-algorithm ECDSA_SHA_256 \
  --message fileb://test-message.bin
```

### Issue: High Latency

- Check network connectivity to KMS endpoint
- Verify KMS endpoint is in same region
- Consider caching strategies for high-throughput scenarios

### Issue: Rate Limiting

- AWS KMS: 1,200 req/s shared across operations
- GCP KMS: 60,000 req/min
- Implement exponential backoff
- Consider request batching

## Post-Migration Monitoring

### Key Metrics to Monitor

1. **Signing Success Rate**
   - Should remain at 100%
   - Alert if drops below 99.9%

2. **Signing Latency**
   - Expected: 10-50ms (vs <1ms for env provider)
   - Alert if exceeds 100ms

3. **KMS API Errors**
   - Monitor for throttling
   - Monitor for access denied errors

4. **Cost**
   - Track KMS API usage
   - Expected: ~$3 per 1M signatures

### Logging

Ensure these log entries appear:
```
✅ "KeyService initialized with aws-kms provider"
✅ "Signed X bytes using AWS KMS"
❌ "AWS KMS signing failed" (should not appear)
```

### Alerts

Set up alerts for:
- KMS signing failures
- High latency (>100ms)
- Rate limiting errors
- IAM permission errors

## Security Improvements

After migration, you've achieved:

✅ Private keys never exposed in environment variables
✅ Private keys never stored in memory
✅ All signing operations audited (CloudTrail/Cloud Audit Logs)
✅ Centralized key management
✅ Key rotation capabilities
✅ Compliance with security best practices

## Next Steps

1. **Enable Key Rotation**
   ```bash
   # AWS KMS
   aws kms enable-key-rotation --key-id $AWS_KMS_KEY_ID
   ```

2. **Set Up Monitoring Dashboard**
   - KMS API usage
   - Signing latency
   - Error rates

3. **Document Disaster Recovery**
   - Key backup procedures
   - Failover scenarios
   - Contact information

4. **Regular Security Audits**
   - Review IAM policies quarterly
   - Audit KMS access logs
   - Test rollback procedures

## Support

For issues during migration:
1. Check logs: `kubectl logs -f deployment/oracle`
2. Review [KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md)
3. Test in staging first
4. Have rollback plan ready
