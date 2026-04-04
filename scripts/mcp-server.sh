#!/bin/bash
cd "$(dirname "$0")/.."
set -a
source .env 2>/dev/null || true
set +a
exec npx tsx src/mcp/index.ts
