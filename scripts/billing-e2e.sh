#!/bin/zsh
# End-to-end run of per-task billing against the LOCAL Supabase stack and a
# stand-in Cardcom. Needs `supabase start` to be running.
#
#   scripts/billing-e2e.sh
#
# Nothing here talks to the real project or to a real Cardcom terminal.
set -e
cd "$(dirname "$0")/.."

eval "$(supabase status -o env | sed 's/^/export /')"
export LOCAL_SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}"
export LOCAL_ANON_KEY="$ANON_KEY"
export LOCAL_SERVICE_KEY="$SERVICE_ROLE_KEY"
export LOCAL_DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "== database scenarios"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/task_billing.test.sql 2>&1 | grep -E "NOTICE|ERROR" | sed 's/psql:[^ ]* //'

echo "== HTTP end-to-end"
deno test -A --no-lock supabase/e2e/billing.e2e.test.ts
