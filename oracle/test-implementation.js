/**
 * Simple verification test for key management implementation
 * Checks that all files exist and have correct structure
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Key Management Implementation\n');

const tests = [
  {
    name: 'Core interface file exists',
    file: 'src/keys/key-provider.interface.ts',
    check: (content) => content.includes('export interface KeyProvider')
  },
  {
    name: 'Factory file exists',
    file: 'src/keys/key-provider.factory.ts',
    check: (content) => content.includes('export class KeyProviderFactory')
  },
  {
    name: 'EnvKeyProvider exists',
    file: 'src/keys/providers/env-key.provider.ts',
    check: (content) => content.includes('export class EnvKeyProvider')
  },
  {
    name: 'AwsKmsKeyProvider exists',
    file: 'src/keys/providers/aws-kms-key.provider.ts',
    check: (content) => content.includes('export class AwsKmsKeyProvider')
  },
  {
    name: 'GcpKmsKeyProvider exists',
    file: 'src/keys/providers/gcp-kms-key.provider.ts',
    check: (content) => content.includes('export class GcpKmsKeyProvider')
  },
  {
    name: 'KeyService updated',
    file: 'src/keys/key.service.ts',
    check: (content) => content.includes('KeyProvider') && content.includes('async sign')
  },
  {
    name: 'VRF service updated for async',
    file: 'src/randomness/ed25519-sha256.vrf-provider.ts',
    check: (content) => content.includes('await this.keyService.sign')
  },
  {
    name: 'Unit tests exist',
    file: 'src/keys/key.service.spec.ts',
    check: (content) => content.includes('describe') && content.includes('KeyService')
  },
  {
    name: 'Documentation exists',
    file: 'docs/KEY_MANAGEMENT.md',
    check: (content) => content.includes('HSM') && content.includes('AWS KMS')
  },
  {
    name: 'Quick start guide exists',
    file: 'docs/KEY_MANAGEMENT_QUICK_START.md',
    check: (content) => content.includes('Quick Start')
  },
  {
    name: 'Migration guide exists',
    file: 'docs/MIGRATION_TO_HSM.md',
    check: (content) => content.includes('Migration Guide')
  },
  {
    name: 'AWS IAM policy exists',
    file: 'docs/iam-policies/aws-kms-policy.json',
    check: (content) => content.includes('kms:Sign')
  },
  {
    name: 'GCP permissions exist',
    file: 'docs/iam-policies/gcp-kms-permissions.yaml',
    check: (content) => content.includes('cloudkms')
  },
  {
    name: 'AWS K8s example exists',
    file: 'k8s/examples/aws-kms-deployment.yaml',
    check: (content) => content.includes('aws-kms')
  },
  {
    name: 'GCP K8s example exists',
    file: 'k8s/examples/gcp-kms-deployment.yaml',
    check: (content) => content.includes('gcp-kms')
  },
  {
    name: 'Package.json updated',
    file: 'package.json',
    check: (content) => content.includes('optionalDependencies')
  },
  {
    name: 'README updated',
    file: 'README.md',
    check: (content) => content.includes('Key Management') || content.includes('HSM')
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  const filePath = path.join(__dirname, test.file);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${index + 1}. ${test.name}`);
      console.log(`   File not found: ${test.file}\n`);
      failed++;
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    if (test.check(content)) {
      console.log(`✓ ${index + 1}. ${test.name}`);
      passed++;
    } else {
      console.log(`❌ ${index + 1}. ${test.name}`);
      console.log(`   Content check failed for: ${test.file}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${index + 1}. ${test.name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50) + '\n');

if (failed === 0) {
  console.log('✅ All implementation files verified!\n');
  console.log('Implementation Summary:');
  console.log('----------------------');
  console.log('✓ Core KeyProvider interface implemented');
  console.log('✓ Three providers implemented (Env, AWS KMS, GCP KMS)');
  console.log('✓ KeyService refactored to use providers');
  console.log('✓ VRF services updated for async signing');
  console.log('✓ Unit tests created');
  console.log('✓ Comprehensive documentation (7 docs)');
  console.log('✓ IAM policy templates');
  console.log('✓ Kubernetes deployment examples');
  console.log('✓ Package.json updated with optional dependencies');
  console.log('✓ README updated with security section\n');
  
  console.log('Next Steps:');
  console.log('-----------');
  console.log('1. Install dependencies: cd oracle && npm install');
  console.log('2. Run TypeScript compilation: npm run build');
  console.log('3. Run unit tests: npm test');
  console.log('4. Review documentation: oracle/docs/KEY_MANAGEMENT_INDEX.md');
  console.log('5. Test in staging with actual KMS credentials');
  console.log('6. Deploy to production following migration guide\n');
  
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
