#!/usr/bin/env bash
# Post-deploy smoke test for EquipDispatch (Hable Equipment).
# Logs in with the seeded admin, then verifies the core authenticated pages
# render 200. Runs against localhost on the droplet to skip Cloudflare's bot
# challenge (GHA runner IPs are blocked at the edge). Exits non-zero on any
# failure so the workflow marks the deploy red.

set -uo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3700}"
EMAIL="${SMOKE_EMAIL:-stee@equipdispatch.com}"
PASSWORD="${SMOKE_PASSWORD:-Admin123!}"

FAILED=0
ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1" >&2; FAILED=1; }

echo "Smoke testing $BASE_URL"

# 1) Public login page renders.
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
[ "$CODE" = "200" ] && ok "GET /login → 200" || fail "GET /login → $CODE"

# 2) Log in. Capture the ed_session cookie value directly from the Set-Cookie
#    header — the cookie is flagged Secure in prod, so curl won't replay it over
#    http from a jar; we forward it explicitly instead.
HEADERS=$(curl -s -D - -o /tmp/ed-login-body.json -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
SESSION=$(printf '%s' "$HEADERS" | grep -i 'set-cookie: ed_session=' | sed -E 's/.*ed_session=([^;]+);.*/\1/' | tr -d '\r')

if [ -n "$SESSION" ] && grep -q '"user"' /tmp/ed-login-body.json; then
  ok "login as $EMAIL"
else
  fail "login failed: $(cat /tmp/ed-login-body.json)"
  rm -f /tmp/ed-login-body.json
  exit 1
fi
rm -f /tmp/ed-login-body.json

COOKIE="ed_session=$SESSION"

# 3) /api/me returns the session user.
ME=$(curl -s -H "Cookie: $COOKIE" "$BASE_URL/api/me")
echo "$ME" | grep -q "$EMAIL" && ok "/api/me resolves session" || fail "/api/me: $ME"

# 4) Core authenticated pages render.
for path in /tracker /reporting /configuration /users /audit /support; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Cookie: $COOKIE" "$BASE_URL$path")
  [ "$CODE" = "200" ] && ok "GET $path → 200" || fail "GET $path → $CODE"
done

# 5) Orders API returns data (proves DB connectivity + seed).
ORDERS=$(curl -s -H "Cookie: $COOKIE" "$BASE_URL/api/tracker/orders?limit=1")
echo "$ORDERS" | grep -q '"orders"' && ok "/api/tracker/orders returns data" || fail "orders API: $ORDERS"

if [ "$FAILED" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "Smoke test FAILED."
  exit 1
fi
