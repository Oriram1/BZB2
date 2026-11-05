#!/bin/zsh
# Runs the review notification delivery test against the local stack with stub providers.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env | sed 's/^/export /')"
export LOCAL_SUPABASE_URL="$API_URL" LOCAL_SERVICE_KEY="$SERVICE_ROLE_KEY"
openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/bzb-push-key.pem -out /tmp/bzb-push-cert.pem -days 1 -subj "/CN=127.0.0.1" >/dev/null 2>&1
NODE_TLS_REJECT_UNAUTHORIZED=0 deno test -A --no-lock --unsafely-ignore-certificate-errors=127.0.0.1 supabase/e2e/review-notifications.e2e.test.ts
