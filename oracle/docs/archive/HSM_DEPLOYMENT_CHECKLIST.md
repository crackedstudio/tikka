# HSM Deployment Checklist

Use this checklist when deploying HSM-backed key management to production.

## Pre-Deployment

### Planning
- [ ] Choose HSM provider (AWS KMS or Google Cloud KMS)
- [ ] Review security requirements and compliance needs
- [ ] Estimate costs based on expected signing volume
- [ ] Schedule deployment window
- [ ] Notify stakeholders

### Infrastructure Setup
- [ ] Create KMS key in chosen provider
- [ ] Configure IAM policies/service accounts
- [ ] Test IAM permissions
- [ ] Set up monitoring and alerting
- [ ] Configure audit logging (CloudTrail/Cloud Audit Logs)

### Development
- [ ] Install KMS SDK dependencies
  ```bash
  npm install @aws-sdk/client-kms  # or @google-cloud/kms
  ```
- [ ] Update configuration files
- [ ] Create Kubernetes secrets/configmaps
- [ ] Update deployment manifests

### Testing
- [ ] Test in development environment
- [ ] Test in staging environment
- [ ] Verify signing operations work
- [ ] Verify public key retrieval
- [ ] Load test signing performance
- [ ] Test error handling and retries
- [ ] Verify monitoring and alerts

## Deployment

### Backup
- [ ] Backup current Kubernetes secrets
  ```bash
  kubectl get secret oracle-secrets -o yaml > backup-secrets.yaml
  ```
- [ ] Backup current deployment
  ```bash
  kubectl get deployment oracle -o yaml > backup-deployment.yaml
  ```
- [ ] Document current configuration
- [ ] Save rollback procedures

### Deploy
- [ ] Create new secrets with HSM configuration
- [ ] Update deployment manifest
- [ ] Apply changes to Kubernetes
  ```bash
  kubectl apply -f k8s/production/
  ```
- [ ] Monitor rollout
  ```bash
  kubectl rollout status deployment/oracle
  ```

### Verification
- [ ] Check pod logs for successful initialization
  ```bash
  kubectl logs -f deployment/oracle | grep "KeyService initialized"
  ```
- [ ] Verify provider type in logs
  ```
  Expected: "KeyService initialized with aws-kms provider"
  ```
- [ ] Test signing operation
- [ ] Monitor error rates
- [ ] Check latency metrics
- [ ] Verify audit logs are being generated

## Post-Deployment

### Monitoring (First 24 Hours)
- [ ] Monitor signing success rate (target: 100%)
- [ ] Monitor signing latency (expected: 10-50ms)
- [ ] Monitor KMS API errors (target: 0)
- [ ] Monitor application logs for errors
- [ ] Check KMS usage and costs
- [ ] Verify audit logs are complete

### Cleanup (After 48 Hours)
- [ ] Verify system stability
- [ ] Remove old secrets
  ```bash
  kubectl delete secret oracle-secrets-old
  ```
- [ ] Remove backup files from secure storage
- [ ] Update documentation
- [ ] Notify stakeholders of successful migration

### Documentation
- [ ] Update deployment documentation
- [ ] Update runbooks
- [ ] Update disaster recovery procedures
- [ ] Document lessons learned
- [ ] Update team wiki/knowledge base

## Rollback Checklist

If issues occur:

### Quick Rollback
- [ ] Apply backup deployment
  ```bash
  kubectl apply -f backup-deployment.yaml
  ```
- [ ] Verify rollback successful
- [ ] Check logs for errors
- [ ] Notify stakeholders

### Full Rollback
- [ ] Restore secrets
  ```bash
  kubectl apply -f backup-secrets.yaml
  ```
- [ ] Restore deployment
  ```bash
  kubectl apply -f backup-deployment.yaml
  ```
- [ ] Verify system operational
- [ ] Document rollback reason
- [ ] Plan remediation

## Troubleshooting

### Common Issues

#### "AWS SDK not installed"
- [ ] Install SDK: `npm install @aws-sdk/client-kms`
- [ ] Rebuild Docker image
- [ ] Redeploy

#### "Access Denied" from KMS
- [ ] Verify IAM permissions
- [ ] Check IAM role/service account binding
- [ ] Test KMS access manually
- [ ] Review CloudTrail/Audit logs

#### High Latency
- [ ] Check network connectivity to KMS
- [ ] Verify KMS endpoint region
- [ ] Check for rate limiting
- [ ] Review application logs

#### Signing Failures
- [ ] Check KMS key status
- [ ] Verify key permissions
- [ ] Check application logs
- [ ] Test KMS access manually

## Success Criteria

Deployment is successful when:

- [x] All pods running and healthy
- [x] Logs show correct provider initialization
- [x] Signing operations succeeding at 100%
- [x] Latency within acceptable range (10-50ms)
- [x] No KMS API errors
- [x] Audit logs being generated
- [x] Monitoring and alerts working
- [x] No increase in application errors
- [x] Stakeholders notified

## Contacts

### Escalation
- **DevOps Team:** [contact info]
- **Security Team:** [contact info]
- **On-Call Engineer:** [contact info]

### Vendor Support
- **AWS Support:** [case link]
- **Google Cloud Support:** [case link]

## References

- [Key Management Guide](./KEY_MANAGEMENT.md)
- [Migration Guide](./MIGRATION_TO_HSM.md)
- [Implementation Summary](./HSM_IMPLEMENTATION_SUMMARY.md)
- [Kubernetes Examples](../k8s/examples/)

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Approved By:** _______________  
**Rollback Plan Tested:** [ ] Yes [ ] No
