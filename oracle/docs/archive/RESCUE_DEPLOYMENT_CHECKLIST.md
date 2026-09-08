# Oracle Rescue Tool - Deployment Checklist

## Pre-Deployment

### Code Review
- [ ] Review RescueService implementation
- [ ] Review RescueController endpoints
- [ ] Review CLI interface
- [ ] Review unit tests
- [ ] Verify no TypeScript errors
- [ ] Check for security vulnerabilities

### Testing
- [ ] Run unit tests: `npm test src/rescue/rescue.service.spec.ts`
- [ ] Test CLI commands locally
- [ ] Test API endpoints locally
- [ ] Verify audit logging works
- [ ] Test with failed jobs in queue
- [ ] Test idempotency (re-running same operation)

### Documentation
- [ ] Review RESCUE_GUIDE.md
- [ ] Review ON_CALL_TROUBLESHOOTING.md
- [ ] Review RESCUE_QUICK_REF.md
- [ ] Update team wiki/docs
- [ ] Create runbook entries

## Deployment

### Build & Deploy
- [ ] Build oracle service: `npm run build`
- [ ] Deploy to staging environment
- [ ] Verify service starts successfully
- [ ] Check logs for errors
- [ ] Test rescue endpoints in staging

### Configuration
- [ ] Verify REDIS_HOST/PORT configured
- [ ] Verify SOROBAN_RPC_URL configured
- [ ] Verify RAFFLE_CONTRACT_ID configured
- [ ] Verify ORACLE_SECRET_KEY configured
- [ ] Check RPC failover URLs configured

### Access Control
- [ ] Restrict CLI access to authorized operators
- [ ] Add authentication to API endpoints (if needed)
- [ ] Configure firewall rules for API
- [ ] Set up VPN/bastion access
- [ ] Document access procedures

## Post-Deployment

### Monitoring
- [ ] Add metrics for rescue operations
- [ ] Set up alerts for high rescue frequency
- [ ] Monitor failed jobs count
- [ ] Track rescue operation latency
- [ ] Dashboard for rescue operations

### Alerting
- [ ] Alert on >5 rescues in 1 hour
- [ ] Alert on force-fail operations
- [ ] Alert on force-submit failures
- [ ] Alert on high failed jobs count
- [ ] Alert on rescue API errors

### Team Training
- [ ] Train on-call engineers on CLI usage
- [ ] Walk through common scenarios
- [ ] Practice rescue operations in staging
- [ ] Review troubleshooting guide
- [ ] Conduct tabletop exercises

### Documentation
- [ ] Add to on-call runbook
- [ ] Update incident response procedures
- [ ] Document escalation paths
- [ ] Create FAQ for common issues
- [ ] Share quick reference card

## Operational Readiness

### Day 1
- [ ] Monitor rescue operations closely
- [ ] Review all rescue logs
- [ ] Check for any issues
- [ ] Gather operator feedback
- [ ] Document any problems

### Week 1
- [ ] Review rescue operation patterns
- [ ] Identify common failure modes
- [ ] Optimize retry strategies
- [ ] Update documentation based on learnings
- [ ] Conduct retrospective

### Month 1
- [ ] Analyze rescue metrics
- [ ] Identify automation opportunities
- [ ] Review audit logs for compliance
- [ ] Update monitoring/alerting
- [ ] Plan improvements

## Security Checklist

### Access Control
- [ ] Limit CLI access to authorized users
- [ ] Implement API authentication
- [ ] Use role-based access control
- [ ] Audit operator permissions
- [ ] Review access logs regularly

### Audit Trail
- [ ] Verify all operations logged
- [ ] Test log retrieval
- [ ] Set up log archival
- [ ] Configure log retention policy
- [ ] Enable log monitoring

### Compliance
- [ ] Document rescue procedures
- [ ] Define approval workflows
- [ ] Set up compliance reporting
- [ ] Schedule regular audits
- [ ] Train on compliance requirements

## Rollback Plan

If issues arise:

1. **Disable Rescue Endpoints**
   ```bash
   # Remove RescueModule from app.module.ts temporarily
   # Redeploy without rescue functionality
   ```

2. **Revert to Manual Process**
   - Use direct Redis commands
   - Use contract interaction tools
   - Document manual steps taken

3. **Investigate Issues**
   - Review logs
   - Check for bugs
   - Test in staging
   - Fix and redeploy

## Success Metrics

Track these metrics to measure success:

- **Rescue Success Rate**: % of successful rescue operations
- **Time to Rescue**: Average time from failure to resolution
- **Failed Jobs Count**: Number of jobs requiring rescue
- **Operator Efficiency**: Time spent on rescue operations
- **Automation Rate**: % of failures auto-recovered vs manual

## Support

### Internal Contacts
- **On-Call Lead**: [Name/Contact]
- **Oracle Team**: [Slack Channel]
- **Security Team**: [Contact]
- **DevOps Team**: [Contact]

### External Resources
- Stellar Discord: [Link]
- Soroban Docs: https://developers.stellar.org/docs/smart-contracts
- Oracle Repo: [GitHub Link]

## Continuous Improvement

### Regular Reviews
- [ ] Weekly: Review rescue operations
- [ ] Monthly: Analyze patterns and trends
- [ ] Quarterly: Update procedures and docs
- [ ] Annually: Comprehensive audit

### Feedback Loop
- [ ] Collect operator feedback
- [ ] Track common issues
- [ ] Identify automation opportunities
- [ ] Update documentation
- [ ] Improve tooling

### Automation Opportunities
- [ ] Auto-retry certain failure patterns
- [ ] Auto-escalate critical failures
- [ ] Auto-generate incident reports
- [ ] Predictive failure detection
- [ ] Self-healing mechanisms

## Sign-Off

### Deployment Approval
- [ ] Engineering Lead: _________________ Date: _______
- [ ] Security Review: _________________ Date: _______
- [ ] Operations Lead: _________________ Date: _______
- [ ] Product Owner: ___________________ Date: _______

### Post-Deployment Verification
- [ ] Staging Tests Passed: _____________ Date: _______
- [ ] Production Deployed: ______________ Date: _______
- [ ] Monitoring Active: ________________ Date: _______
- [ ] Team Trained: _____________________ Date: _______

## Notes

Use this section for deployment-specific notes, issues encountered, or lessons learned:

```
[Add notes here]
```

---

**Last Updated**: [Date]  
**Version**: 1.0  
**Owner**: [Team/Person]
