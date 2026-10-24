// Run after sourcing .env.supabase.local and .env.local, then unsetting the
// stale SUPABASE_ACCESS_TOKEN. Uses the existing E2E account; prints no secrets.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
assert(url && key && process.env.E2E_USER_A_EMAIL && process.env.E2E_USER_A_PASSWORD, 'Missing E2E configuration');
const sql = query => JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', query], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
})).rows;
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.auth.signInWithPassword({
  email: process.env.E2E_USER_A_EMAIL, password: process.env.E2E_USER_A_PASSWORD,
});
assert(!error && data.session, 'E2E login failed');
const headers = { apikey: key, Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
const guest = { apikey: key, 'Content-Type': 'application/json' };
const userId = data.user.id;
assert.match(userId, /^[a-f0-9-]{36}$/);
let minute;
let previous;
let providerFailure;
try {
  for (const origin of ['https://bzb-web.com', 'https://bzb-2-git-main-bzb1.vercel.app', 'https://bzb-2-test-bzb1.vercel.app']) {
    const r = await fetch(`${url}/functions/v1/geocode-address`, { method: 'OPTIONS', headers: { Origin: origin } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
  }
  const denied = await fetch(`${url}/functions/v1/geocode-address`, {
    method: 'OPTIONS', headers: { Origin: 'https://attacker.vercel.app' },
  });
  assert.notEqual(denied.headers.get('Access-Control-Allow-Origin'), 'https://attacker.vercel.app');
  console.log('PASS live CORS: production, project previews, foreign origin');

  for (const requestHeaders of [guest, headers]) {
    const r = await fetch(`${url}/rest/v1/rpc/is_email_alias_taken`, {
      method: 'POST', headers: requestHeaders, body: JSON.stringify({ p_email: 'nobody@security.invalid' }),
    });
    assert([401, 403, 404].includes(r.status), 'Email enumeration RPC exposed');
  }
  console.log('PASS live email alias RPC denied to guests and users');

  const unauthenticated = await fetch(`${url}/functions/v1/geocode-address`, {
    method: 'POST', headers: guest, body: JSON.stringify({ address: 'תל אביב' }),
  });
  assert.equal(unauthenticated.status, 401);
  const good = await fetch(`${url}/functions/v1/geocode-address`, {
    method: 'POST', headers, body: JSON.stringify({ address: 'דיזנגוף 50 תל אביב' }),
  });
  if (good.status !== 200) {
    providerFailure = `Authenticated geocode failed with HTTP ${good.status}; provider configuration must be fixed`;
    console.log('FAIL live provider response:', good.status);
  } else {
    const coordinates = await good.json();
    assert.equal(typeof coordinates.lat, 'number');
    assert.equal(typeof coordinates.lng, 'number');
    assert.equal(typeof coordinates.formattedAddress, 'string');
    console.log('PASS live provider coordinates');
  }

  // Seed only this E2E user's minute counter, avoiding 20 paid provider calls.
  minute = sql("select date_trunc('minute',now())::text as minute")[0].minute;
  const scope = `geocode:${userId}:minute`;
  previous = sql(`select requests from public.edge_request_counters where scope='${scope}' and window_start='${minute}'`)[0];
  sql(`insert into public.edge_request_counters(scope,window_start,requests) values('${scope}','${minute}',20)
    on conflict(scope,window_start) do update set requests=20`);
  const limited = await fetch(`${url}/functions/v1/geocode-address`, {
    method: 'POST', headers, body: JSON.stringify({ address: 'תל אביב' }),
  });
  assert.equal(limited.status, 429);
  assert(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal((await limited.json()).error, 'rate_limit_exceeded');
  console.log('PASS live geocode: authentication, server quota, Retry-After');

  const snapshot = () => sql(`select
    (select count(*) from public.payment_events where outcome='unknown_order')::int as events,
    (select count(*) from public.payment_webhook_unknown_buckets)::int as buckets,
    (select coalesce(sum(attempts),0) from public.payment_webhook_unknown_buckets)::int as attempts`)[0];
  const before = snapshot();
  await Promise.all(Array.from({ length: 12 }, async () => {
    const r = await fetch(`${url}/functions/v1/billing-webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ LowProfileId: `security-e2e-${crypto.randomUUID()}` }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  }));
  const after = snapshot();
  assert.equal(after.events, before.events);
  assert(after.buckets <= before.buckets + 1);
  assert(after.attempts >= before.attempts + 12);
  assert.equal(sql('select count(*)::int as count from public.payment_webhook_unknown_buckets where cardinality(sample_ids)>5')[0].count, 0);
  console.log('PASS live concurrent unknown webhooks: bounded rows, exact response, audit counts');
  assert(!providerFailure, providerFailure);
} finally {
  if (minute) {
    const scope = `geocode:${userId}:minute`;
    if (previous) sql(`update public.edge_request_counters set requests=${previous.requests} where scope='${scope}' and window_start='${minute}'`);
    else sql(`delete from public.edge_request_counters where scope='${scope}' and window_start='${minute}'`);
  }
  await client.auth.signOut();
}
