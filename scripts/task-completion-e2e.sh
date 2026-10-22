#!/bin/zsh
# Isolated UI + real database run. Requires a running local Supabase stack.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .env.supabase.local
set +a
# Capture credentials without printing them. The test refuses remote API URLs.
eval "$(supabase status -o env | sed 's/^/export /')"
export LOCAL_SUPABASE_URL="$API_URL"
export LOCAL_ANON_KEY="$ANON_KEY"
export LOCAL_SERVICE_KEY="$SERVICE_ROLE_KEY"
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export E2E_BASE_URL="http://127.0.0.1:5187"
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort > /tmp/busybee-completion-vite.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
  kill -0 "$server_pid"
  if curl -fsS "$E2E_BASE_URL" >/dev/null 2>&1; then break; fi
  sleep 1
done
npx playwright test e2e/task-completion.spec.ts --workers=1

deno test -A --no-lock supabase/e2e/wallet.e2e.test.ts
