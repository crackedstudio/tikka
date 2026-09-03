#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORACLE_DIR="$SCRIPT_DIR/.."
ENC_FILE="${ORACLE_DIR}/.env.enc"
OUT_FILE="${ORACLE_DIR}/.env"

echo "Running decrypt-env.sh smoke test..."

# Setup mock sops
mkdir -p "$SCRIPT_DIR/test_bin"
cat << 'EOF' > "$SCRIPT_DIR/test_bin/sops"
#!/bin/bash
if [[ "$1" == "--decrypt" ]]; then
  echo "MOCK_SECRET=12345"
  exit 0
fi
echo "Mock sops error" >&2
exit 1
EOF
chmod +x "$SCRIPT_DIR/test_bin/sops"

export PATH="$SCRIPT_DIR/test_bin:$PATH"

# Setup fixture
echo "encrypted content" > "$ENC_FILE"
rm -f "$OUT_FILE"

# Run script
bash "$SCRIPT_DIR/decrypt-env.sh"

# Assertions
if [[ ! -f "$OUT_FILE" ]]; then
  echo "TEST FAILED: $OUT_FILE was not created." >&2
  exit 1
fi

CONTENT=$(cat "$OUT_FILE")
if [[ "$CONTENT" != "MOCK_SECRET=12345" ]]; then
  echo "TEST FAILED: Incorrect content in $OUT_FILE" >&2
  exit 1
fi

if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "win32" ]]; then
  PERMS=$(stat -c "%a" "$OUT_FILE" 2>/dev/null || stat -f "%Lp" "$OUT_FILE")
  if [[ "$PERMS" != "600" ]]; then
    echo "TEST FAILED: Expected mode 600, got $PERMS" >&2
    exit 1
  fi
else
  echo "Skipping permission check on Windows/MSYS"
fi

# Test missing file with SOPS_AGE_KEY_FILE
rm -f "$ENC_FILE" "$OUT_FILE"
export SOPS_AGE_KEY_FILE="mock_key"
set +e
bash "$SCRIPT_DIR/decrypt-env.sh" > /dev/null 2>&1
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "TEST FAILED: Script should exit non-zero when SOPS_AGE_KEY_FILE is set and .env.enc is missing." >&2
  exit 1
fi

echo "Smoke test passed successfully!"

# Cleanup
rm -f "$ENC_FILE" "$OUT_FILE"
rm -rf "$SCRIPT_DIR/test_bin"
