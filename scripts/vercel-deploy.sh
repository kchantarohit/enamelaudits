#!/usr/bin/env bash
# One-command Vercel setup + deploy. Works in Termux (Android), macOS and Linux.
#   bash scripts/vercel-deploy.sh
# Safe to re-run: it only asks for variables that are missing.
set -euo pipefail
cd "$(dirname "$0")/.."
V="npx --yes vercel"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "Checking tools"
command -v node >/dev/null || { echo "Install Node first:  pkg install -y nodejs-lts"; exit 1; }
command -v openssl >/dev/null || { echo "Install OpenSSL first:  pkg install -y openssl-tool"; exit 1; }
[ -d node_modules/nodemailer ] || npm install --no-audit --no-fund

say "Running tests"
npm test --silent >"${TMPDIR:-/tmp}/enamel-test.log" 2>&1 && echo "tests passed" || { tail -30 "${TMPDIR:-/tmp}/enamel-test.log"; echo "Tests failed, not deploying."; exit 1; }

say "Vercel login"
$V whoami >/dev/null 2>&1 || $V login

say "Linking project"
[ -f .vercel/project.json ] || $V link --yes

say "Checking environment variables"
EXISTING="$($V env ls production 2>/dev/null || true)"
has() { grep -Eq "(^|[[:space:]])$1([[:space:]]|$)" <<<"$EXISTING"; }

# Remove a SITE_URL that was saved wrong (the app now detects its own Vercel URL).
if has SITE_URL; then $V env rm SITE_URL production -y >/dev/null 2>&1 && echo "removed old SITE_URL (auto-detected now)"; fi

ask() { # name, help text, secret?
  local name=$1 help=$2 secret=${3:-}
  if has "$name"; then echo "✓ $name already set"; return; fi
  echo; echo "$name — $help"
  local val=""
  while [ -z "$val" ]; do
    if [ -n "$secret" ]; then read -r -s -p "  paste value (hidden): " val; echo; else read -r -p "  value: " val; fi
  done
  printf '%s' "$val" | $V env add "$name" production >/dev/null && echo "✓ $name saved"
}

ask STRIPE_SECRET_KEY     "Stripe > Developers > API keys > Secret key (sk_test_...)" secret
ask GMAIL_USER            "the Gmail address that sends reports"
ask GMAIL_APP_PASSWORD    "myaccount.google.com/apppasswords (16 letters)" secret
ask OWNER_EMAIL           "where lead/sale alerts go (e.g. your Gmail)"
if has CRON_SECRET; then echo "✓ CRON_SECRET already set"; else openssl rand -hex 32 | tr -d '\n' | $V env add CRON_SECRET production >/dev/null && echo "✓ CRON_SECRET generated"; fi

say "Deploying to production"
$V --prod --yes

NAME="$(node -p "try{require('./.vercel/project.json').projectName||''}catch{''}")"
SITE="https://${NAME}.vercel.app"

say "Health check: $SITE/api/health"
HEALTH="$(curl -fsS "$SITE/api/health" 2>/dev/null || true)"
if [ -n "$HEALTH" ]; then echo "$HEALTH"; else echo "Could not reach $SITE (your production domain may differ: see the 'Production:' line above)."; fi

if ! has STRIPE_WEBHOOK_SECRET; then
  cat <<MSG

Last step (one time) — connect Stripe:
  1. Stripe > Developers > Webhooks > Add endpoint
       URL:    $SITE/api/stripe-webhook
       Events: checkout.session.completed, checkout.session.async_payment_succeeded
  2. Copy its Signing secret (whsec_...), then re-run:  bash scripts/vercel-deploy.sh
MSG
  read -r -p "Paste the whsec_ secret now (or press Enter to do it later): " -s WH; echo
  if [ -n "${WH:-}" ]; then
    printf '%s' "$WH" | $V env add STRIPE_WEBHOOK_SECRET production >/dev/null && echo "✓ STRIPE_WEBHOOK_SECRET saved, redeploying…"
    $V --prod --yes >/dev/null && echo "✓ redeployed" && curl -fsS "$SITE/api/health" 2>/dev/null || true
  fi
fi
echo; echo "Done. Test: open $SITE, run a free snapshot, then buy with card 4242 4242 4242 4242."
