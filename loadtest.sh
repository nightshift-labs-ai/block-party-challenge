#!/usr/bin/env bash
# Load test for the DevOps section: bash loadtest.sh <base-url> [connections=200] [seconds=30]
# Hits the static page and the leaderboard read path; prints a summary for README.
set -euo pipefail
URL=${1:?base url}; C=${2:-200}; D=${3:-30}
export PATH=/home/agent/tools/node22/bin:$PATH
for p in / "/api/leaderboard?board=main"; do
  echo "== $URL$p  ($C connections, ${D}s)"
  npx -y autocannon@7 -c "$C" -d "$D" --renderStatusCodes "$URL$p" 2>&1 | grep -E "Latency|Req/Sec|2xx|non 2xx|requests in|─" | head -14
done
