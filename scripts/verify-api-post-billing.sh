#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLOW_PHASE=post_billing "$SCRIPT_DIR/verify-api-flow.sh" "$@"
