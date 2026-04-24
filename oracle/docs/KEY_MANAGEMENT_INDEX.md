# Key Management Documentation Index

Complete guide to HSM-backed key management for the Oracle service.

## 🚀 Getting Started

New to HSM key management? Start here:

1. **[Quick Start Guide](./KEY_MANAGEMENT_QUICK_START.md)** (5 minutes)
   - Environment variable reference
   - Quick setup for AWS KMS and GCP KMS
   - Verification steps

2. **[Comprehensive Guide](./KEY_MANAGEMENT.md)** (30 minutes)
   - Detailed architecture overview
   - Step-by-step setup instructions
   - Configuration examples
   - Troubleshooting guide

## 📋 Planning & Migration

Ready to migrate to production?

3. **[Migration Guide](./MIGRATION_TO_HSM.md)** (1 hour)
   - Pre-migration checklist
   - Phase-by-phase migration steps
   - Rollback procedures
   - Post-migration monitoring

4. **[Deployment Checklist](./HSM_DEPLOYMENT_CHECKLIST.md)** (Reference)
   - Pre-deployment tasks
   - Deployment steps
   - Verification procedures
   - Success criteria

## 🔧 Technical Details

For developers and architects:

5. **[Implementation Summary](./HSM_IMPLEMENTATION_SUMMARY.md)** (15 minutes)
   - Architecture overview
   - Component structure
   - Code changes
   - Performance impact
   - Security improvements

## 📦 Examples & Templates

Ready-to-use configurations:

6. **IAM Policies**
   - [AWS KMS Policy](./iam-policies/aws-kms-policy.json)
   - [GCP KMS Permissions](./iam-policies/gcp-kms-permissions.yaml)

7. **Kubernetes Deployments**
   - [AWS KMS Deployment](../k8s/examples/aws-kms-deployment.yaml)
   - [GCP KMS Deployment](../k8s/examples/gcp-kms-deployment.yaml)

## 🎯 Quick Reference

### Environment Variables

| Variable | Provider | Required | Description |
|----------|----------|----------|-------------|
| `KEY_PROVIDER` | All | Yes | `env`, `aws-kms`, or `gcp-kms` |
| `ORACLE_PRIVATE_KEY` | env | Yes | Stellar secret key |
| `AWS_REGION` | aws-kms | Yes | AWS region |
| `AWS_KMS_KEY_ID` | aws-kms | Yes | KMS key ARN |
| `GCP_PROJECT_ID` | gcp-kms | Yes | GCP project ID |
| `GCP_KEY_RING_ID` | gcp-kms | Yes | KMS key ring ID |
| `GCP_KEY_ID` | gcp-kms | Yes | KMS key ID |

### Setup Commands

**AWS KMS:**
```bash
npm install @aws-sdk/client-kms
export KEY_PROVIDER=aws-kms
export AWS_REGION=us-east-1
export AWS_KMS_KEY_ID=arn:aws:kms:...
```

**Google Cloud KMS:**
```bash
npm install @google-cloud/kms
export KEY_PROVIDER=gcp-kms
export GCP_PROJECT_ID=my-project
export GCP_KEY_RING_ID=oracle-keys
export GCP_KEY_ID=oracle-signing-key
```

### Verification

Check logs for:
```
KeyService initialized with [provider-type] provider for address: G...
```

## 🔍 Troubleshooting

Common issues and solutions:

| Issue | Solution | Reference |
|-------|----------|-----------|
| SDK not installed | `npm install @aws-sdk/client-kms` | [Guide](./KEY_MANAGEMENT.md#troubleshooting) |
| Access denied | Check IAM permissions | [Policies](./iam-policies/) |
| High latency | Check network/region | [Guide](./KEY_MANAGEMENT.md#performance-considerations) |
| Signing failures | Verify key status | [Migration](./MIGRATION_TO_HSM.md#troubleshooting) |

## 📊 Comparison

### Security

| Aspect | Env Provider | HSM Provider |
|--------|--------------|--------------|
| Key Storage | Environment | HSM |
| Key Exposure | In memory | Never |
| Audit Logging | None | Full |
| Key Rotation | Manual | Automated |
| Compliance | ❌ | ✅ |

### Performance

| Provider | Latency | Throughput | Cost |
|----------|---------|------------|------|
| Env | <1ms | Unlimited | $0 |
| AWS KMS | 10-50ms | 1,200/s | ~$3/1M |
| GCP KMS | 10-50ms | 60k/min | ~$3/1M |

## 🎓 Learning Path

### For Operators

1. Read [Quick Start](./KEY_MANAGEMENT_QUICK_START.md)
2. Review [Migration Guide](./MIGRATION_TO_HSM.md)
3. Use [Deployment Checklist](./HSM_DEPLOYMENT_CHECKLIST.md)
4. Bookmark [Troubleshooting](./KEY_MANAGEMENT.md#troubleshooting)

### For Developers

1. Read [Implementation Summary](./HSM_IMPLEMENTATION_SUMMARY.md)
2. Review code in `oracle/src/keys/`
3. Study [Kubernetes Examples](../k8s/examples/)
4. Run tests: `npm test`

### For Architects

1. Read [Comprehensive Guide](./KEY_MANAGEMENT.md)
2. Review [Implementation Summary](./HSM_IMPLEMENTATION_SUMMARY.md)
3. Evaluate [Performance Impact](./HSM_IMPLEMENTATION_SUMMARY.md#performance-impact)
4. Plan [Migration Strategy](./MIGRATION_TO_HSM.md)

## 🔗 External Resources

### AWS KMS
- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-kms/)

### Google Cloud KMS
- [Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [Cloud KMS Best Practices](https://cloud.google.com/kms/docs/best-practices)
- [Node.js Client Library](https://cloud.google.com/nodejs/docs/reference/kms/latest)

### Cryptography
- [Ed25519 Signature Scheme](https://ed25519.cr.yp.to/)
- [Stellar Key Management](https://developers.stellar.org/docs/encyclopedia/security/key-management)

## 📞 Support

### Documentation Issues
- Found a typo? Submit a PR
- Need clarification? Open an issue
- Have a question? Ask in team chat

### Production Issues
- Check [Troubleshooting Guide](./KEY_MANAGEMENT.md#troubleshooting)
- Review [Migration Rollback](./MIGRATION_TO_HSM.md#rollback-procedure)
- Contact on-call engineer

## ✅ Checklist

Before going to production:

- [ ] Read all documentation
- [ ] Test in staging environment
- [ ] Configure monitoring and alerts
- [ ] Set up audit logging
- [ ] Document rollback procedure
- [ ] Train team on new system
- [ ] Schedule deployment window
- [ ] Notify stakeholders

## 🎉 Success!

Once deployed, you'll have:

✅ Enterprise-grade key management  
✅ HSM-backed security  
✅ Full audit trail  
✅ Automated key rotation  
✅ Compliance-ready infrastructure  

---

**Last Updated:** 2026-04-23  
**Version:** 1.0.0  
**Maintainer:** DevOps Team
