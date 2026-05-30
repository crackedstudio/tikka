#!/bin/bash

# Verification script for Oracle Component Health Implementation
# Runs: linting, unit tests, build

set -e  # Exit on first error

echo "================================"
echo "Oracle Component Health Verification"
echo "================================"

cd /workspaces/tikka/oracle

echo ""
echo "1. Running linter..."
npm run lint || {
  echo "❌ Linting failed"
  exit 1
}
echo "✅ Linting passed"

echo ""
echo "2. Running tests..."
npm run test -- --testPathPattern="health" || {
  echo "❌ Tests failed"
  exit 1
}
echo "✅ Health tests passed"

echo ""
echo "3. Building oracle..."
npm run build || {
  echo "❌ Build failed"
  exit 1
}
echo "✅ Build succeeded"

echo ""
echo "================================"
echo "✅ All verifications passed!"
echo "================================"
echo ""
echo "Component Health Features:"
echo "- Listener (event stream) status"
echo "- Queue depth monitoring"
echo "- Key provider availability"
echo "- Randomness provider availability"
echo "- Network/RPC connectivity"
echo "- Submitter success rate tracking"
echo ""
echo "New API endpoints:"
echo "- GET /health (Kubernetes probe)"
echo "- GET /oracle/components (detailed component status)"
echo "- GET /oracle/status (full status with components)"
