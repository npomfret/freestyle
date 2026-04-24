#!/usr/bin/env bash
#
# Deploy Freestyle to the production server.
#
# Local pre-flight (clean tree, on deploy branch, in sync with upstream,
# type-checks) → remote pull → rebuild app image → recreate app
# container → health check.
#
# Overridable via env:
#   DEPLOY_HOST          SSH target                         (default: root@fsd.snowmonkey.co.uk)
#   DEPLOY_PATH          Server checkout path               (default: /opt/freestyle)
#   DEPLOY_BRANCH        Branch that is deployed            (default: main)
#   DEPLOY_HEALTH_URL    URL curled on the server to verify (default: http://127.0.0.1:3001/health)
#   HEALTH_ATTEMPTS      Health-check retries               (default: 10)

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@fsd.snowmonkey.co.uk}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/freestyle}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3001/health}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-10}"

step() { printf '\n▸ %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  · %s\n' "$*"; }
err()  { printf '✗ %s\n' "$*" >&2; }

step "Pre-flight"

if [[ -n "$(git status --porcelain)" ]]; then
    err "working tree is not clean — commit or stash first"
    git status --short >&2
    exit 1
fi
ok "working tree clean"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
    err "on branch '$current_branch', expected '$DEPLOY_BRANCH'"
    exit 1
fi
ok "on branch $DEPLOY_BRANCH"

git fetch upstream "$DEPLOY_BRANCH" --quiet
ahead="$(git rev-list --count "upstream/$DEPLOY_BRANCH..HEAD")"
behind="$(git rev-list --count "HEAD..upstream/$DEPLOY_BRANCH")"
if [[ "$ahead" != "0" ]]; then
    err "$ahead local commit(s) not pushed — run: git push upstream $DEPLOY_BRANCH"
    exit 1
fi
if [[ "$behind" != "0" ]]; then
    err "$behind commit(s) behind upstream — pull first"
    exit 1
fi
ok "in sync with upstream/$DEPLOY_BRANCH"

npm run compile >/dev/null
ok "type-check (npm run compile) passed"

sha="$(git rev-parse --short HEAD)"
subject="$(git log -1 --pretty=%s)"
step "Deploying $sha to $DEPLOY_HOST:$DEPLOY_PATH"
echo "  commit: $sha  $subject"

ssh "$DEPLOY_HOST" bash -se <<REMOTE
set -euo pipefail
cd "$DEPLOY_PATH"
compose="docker compose -f docker-compose.production.yml --env-file .env.production"
echo "▸ git pull --ff-only"
git pull --ff-only
echo "▸ build app image"
\$compose build app
echo "▸ recreate app container"
\$compose up -d app
REMOTE

step "Health check ($DEPLOY_HEALTH_URL)"
for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    if ssh "$DEPLOY_HOST" "curl -fsS '$DEPLOY_HEALTH_URL'" >/dev/null 2>&1; then
        ok "healthy"
        step "Deploy complete ($sha)"
        exit 0
    fi
    if (( i < HEALTH_ATTEMPTS )); then
        warn "attempt $i/$HEALTH_ATTEMPTS not ready, retrying in 2s..."
        sleep 2
    fi
done

err "health check failed after $HEALTH_ATTEMPTS attempts"
err "tail server logs: ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && npm run deploy:logs'"
exit 1
