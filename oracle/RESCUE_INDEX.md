# Oracle Rescue Tool - Documentation Index

Quick navigation guide for all Oracle Rescue documentation and source files.

## 📚 Start Here

**New to Oracle Rescue?** Start with these:
1. [RESCUE_COMPLETE.md](./RESCUE_COMPLETE.md) - Overview and quick start
2. [RESCUE_QUICK_REF.md](./RESCUE_QUICK_REF.md) - Quick reference card
3. [RESCUE_GUIDE.md](./RESCUE_GUIDE.md) - Comprehensive user guide

## 📖 Documentation

### User Guides
- **[RESCUE_GUIDE.md](./RESCUE_GUIDE.md)** - Complete usage guide with examples
  - Architecture overview
  - Usage examples for all commands
  - API usage with curl examples
  - Decision tree for choosing actions
  - Best practices and troubleshooting

- **[RESCUE_QUICK_REF.md](./RESCUE_QUICK_REF.md)** - One-page quick reference
  - Emergency commands
  - Decision tree
  - Common scenarios
  - API endpoints

- **[ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md)** - On-call handbook
  - Quick reference commands
  - Common failure scenarios
  - Escalation matrix
  - Incident response template
  - Contact information

### Technical Documentation
- **[RESCUE_IMPLEMENTATION.md](./RESCUE_IMPLEMENTATION.md)** - Technical details
  - Component descriptions
  - Architecture diagrams
  - Integration details
  - API specifications
  - Future enhancements

- **[RESCUE_FEATURE_SUMMARY.md](./RESCUE_FEATURE_SUMMARY.md)** - Feature overview
  - Problem statement
  - Solution architecture
  - Key features
  - Use cases
  - Success criteria

- **[src/rescue/README.md](./src/rescue/README.md)** - Module documentation
  - Quick start
  - File descriptions
  - API endpoints
  - Usage examples

### Deployment & Operations
- **[RESCUE_DEPLOYMENT_CHECKLIST.md](./RESCUE_DEPLOYMENT_CHECKLIST.md)** - Deployment guide
  - Pre-deployment checklist
  - Deployment steps
  - Post-deployment verification
  - Rollback plan
  - Sign-off template

- **[VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md)** - Completion checklist
  - Implementation checklist (120 items)
  - Feature completeness
  - Code quality checks
  - Testing verification
  - Deployment readiness

### Testing & Quality
- **[TEST_REPORT.md](./TEST_REPORT.md)** - Test results
  - Test suite results (9/9 passed)
  - Code quality checks
  - Feature completeness
  - Integration tests
  - Recommendations

- **[RESCUE_COMPLETE.md](./RESCUE_COMPLETE.md)** - Implementation summary
  - What was built
  - Files created
  - Test results
  - Usage examples
  - Next steps

## 💻 Source Code

### Core Implementation
Located in `src/rescue/`:

- **[rescue.module.ts](./src/rescue/rescue.module.ts)** - NestJS module
  - Module configuration
  - Dependency injection
  - Service providers

- **[rescue.service.ts](./src/rescue/rescue.service.ts)** - Core business logic
  - `reEnqueueJob()` - Re-enqueue failed jobs
  - `forceSubmit()` - Force submit randomness
  - `forceFail()` - Force fail invalid jobs
  - `getFailedJobs()` - List failed jobs
  - `getAllJobs()` - List all jobs
  - `getRescueLogs()` - View audit logs

- **[rescue.controller.ts](./src/rescue/rescue.controller.ts)** - REST API
  - `POST /rescue/re-enqueue`
  - `POST /rescue/force-submit`
  - `POST /rescue/force-fail`
  - `GET /rescue/failed-jobs`
  - `GET /rescue/jobs`
  - `GET /rescue/logs`

- **[rescue.cli.ts](./src/rescue/rescue.cli.ts)** - CLI interface
  - Command parsing
  - User-friendly output
  - Help text
  - Error handling

### Testing
- **[rescue.service.spec.ts](./src/rescue/rescue.service.spec.ts)** - Unit tests
  - 15+ test cases
  - All core functionality covered
  - Edge cases tested

- **[test-rescue.js](./test-rescue.js)** - Manual test script
  - Automated verification
  - File existence checks
  - Syntax validation
  - Integration verification

## 🚀 Quick Commands

### CLI Usage
```bash
# Help
npm run oracle:rescue help

# List failed jobs
npm run oracle:rescue list-failed

# Re-enqueue
npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason "<reason>"

# Force submit
npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason "<reason>"

# Force fail
npm run oracle:rescue force-fail <jobId> --operator <name> --reason "<reason>"

# View logs
npm run oracle:rescue logs [--raffle <id>] [--limit <n>]
```

### API Usage
```bash
# Re-enqueue
curl -X POST http://localhost:3003/rescue/re-enqueue \
  -H "Content-Type: application/json" \
  -d '{"jobId":"12345","operator":"alice","reason":"..."}'

# Force submit
curl -X POST http://localhost:3003/rescue/force-submit \
  -H "Content-Type: application/json" \
  -d '{"raffleId":42,"requestId":"req_123","operator":"bob","reason":"..."}'

# List failed jobs
curl http://localhost:3003/rescue/failed-jobs

# View logs
curl http://localhost:3003/rescue/logs?limit=50
```

### Testing
```bash
# Run unit tests
npm test src/rescue/rescue.service.spec.ts

# Run manual verification
node test-rescue.js

# Check TypeScript
npx tsc --noEmit
```

## 📋 Common Tasks

### For Users
1. **Learn the basics**: Read [RESCUE_GUIDE.md](./RESCUE_GUIDE.md)
2. **Quick reference**: Keep [RESCUE_QUICK_REF.md](./RESCUE_QUICK_REF.md) handy
3. **Troubleshooting**: Check [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md)

### For Developers
1. **Understand architecture**: Read [RESCUE_IMPLEMENTATION.md](./RESCUE_IMPLEMENTATION.md)
2. **Review code**: Check files in `src/rescue/`
3. **Run tests**: Execute `npm test src/rescue/rescue.service.spec.ts`

### For Operations
1. **Deploy**: Follow [RESCUE_DEPLOYMENT_CHECKLIST.md](./RESCUE_DEPLOYMENT_CHECKLIST.md)
2. **On-call**: Use [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md)
3. **Monitor**: Set up alerts from deployment guide

## 🔍 Find What You Need

### I want to...
- **Learn how to use the tool** → [RESCUE_GUIDE.md](./RESCUE_GUIDE.md)
- **Get a quick command reference** → [RESCUE_QUICK_REF.md](./RESCUE_QUICK_REF.md)
- **Troubleshoot an issue** → [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md)
- **Understand the architecture** → [RESCUE_IMPLEMENTATION.md](./RESCUE_IMPLEMENTATION.md)
- **Deploy to production** → [RESCUE_DEPLOYMENT_CHECKLIST.md](./RESCUE_DEPLOYMENT_CHECKLIST.md)
- **Review test results** → [TEST_REPORT.md](./TEST_REPORT.md)
- **Check implementation status** → [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md)
- **See what was built** → [RESCUE_COMPLETE.md](./RESCUE_COMPLETE.md)
- **Understand features** → [RESCUE_FEATURE_SUMMARY.md](./RESCUE_FEATURE_SUMMARY.md)
- **Review the code** → `src/rescue/*.ts`

## 📊 File Statistics

### Documentation
- **Total Files**: 10
- **Total Lines**: 2500+
- **User Guides**: 3
- **Technical Docs**: 3
- **Operational Docs**: 4

### Source Code
- **Total Files**: 5
- **Total Lines**: 1200+
- **Services**: 1
- **Controllers**: 1
- **Modules**: 1
- **CLI**: 1
- **Tests**: 1

### Test Files
- **Total Files**: 2
- **Test Cases**: 15+
- **Test Suites**: 9

## 🎯 By Role

### On-Call Engineer
1. [RESCUE_QUICK_REF.md](./RESCUE_QUICK_REF.md) - Keep this open
2. [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md) - Your handbook
3. [RESCUE_GUIDE.md](./RESCUE_GUIDE.md) - Detailed reference

### Developer
1. [RESCUE_IMPLEMENTATION.md](./RESCUE_IMPLEMENTATION.md) - Architecture
2. [src/rescue/README.md](./src/rescue/README.md) - Module docs
3. Source files in `src/rescue/` - Code

### DevOps Engineer
1. [RESCUE_DEPLOYMENT_CHECKLIST.md](./RESCUE_DEPLOYMENT_CHECKLIST.md) - Deploy
2. [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) - Verify
3. [TEST_REPORT.md](./TEST_REPORT.md) - Test results

### Product Manager
1. [RESCUE_COMPLETE.md](./RESCUE_COMPLETE.md) - Overview
2. [RESCUE_FEATURE_SUMMARY.md](./RESCUE_FEATURE_SUMMARY.md) - Features
3. [TEST_REPORT.md](./TEST_REPORT.md) - Quality

## 🔗 Related Documentation

### Oracle Service
- [README.md](./README.md) - Oracle service overview
- [COMMIT_REVEAL.md](./COMMIT_REVEAL.md) - Commit-reveal pattern
- [MULTI_ORACLE.md](./MULTI_ORACLE.md) - Multi-oracle setup

### Project Root
- [../README.md](../README.md) - Project overview
- [../QUICK_START.md](../QUICK_START.md) - Getting started

## 📞 Support

### Documentation Issues
If you find issues with documentation:
1. Check this index for the right file
2. Review the specific documentation
3. Report issues to the team

### Code Issues
If you find issues with code:
1. Review [RESCUE_IMPLEMENTATION.md](./RESCUE_IMPLEMENTATION.md)
2. Check source files in `src/rescue/`
3. Run tests: `npm test src/rescue/rescue.service.spec.ts`
4. Report issues to the team

### Operational Issues
If you encounter operational issues:
1. Check [ON_CALL_TROUBLESHOOTING.md](./ON_CALL_TROUBLESHOOTING.md)
2. Review [RESCUE_GUIDE.md](./RESCUE_GUIDE.md)
3. Escalate per escalation matrix

---

**Last Updated**: 2024  
**Version**: 1.0  
**Status**: Complete
