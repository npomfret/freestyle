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

sha="$(git rev-parse HEAD)"
short_sha="$(git rev-parse --short HEAD)"
subject="$(git log -1 --pretty=%s)"
step "Deploying $short_sha to $DEPLOY_HOST:$DEPLOY_PATH"
echo "  commit: $short_sha  $subject"

ssh "$DEPLOY_HOST" bash -se <<REMOTE
set -euo pipefail
cd "$DEPLOY_PATH"
compose="docker compose -f docker-compose.production.yml --env-file .env.production"
expected_sha="$sha"
echo "▸ git pull --ff-only"
git pull --ff-only
server_sha="\$(git rev-parse HEAD)"
if [[ "\$server_sha" != "\$expected_sha" ]]; then
    echo "✗ server checkout sha \$server_sha != deployed sha \$expected_sha" >&2
    echo "  the server pulled a different commit than expected — investigate" >&2
    exit 1
fi
echo "  ✓ server at \$(git rev-parse --short HEAD)"
echo "▸ build app image (GIT_SHA=\$expected_sha)"
\$compose build --build-arg "GIT_SHA=\$expected_sha" app
echo "▸ recreate app container"
\$compose up -d --force-recreate app
REMOTE

step "Health check ($DEPLOY_HEALTH_URL)"
healthy=0
for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    if ssh "$DEPLOY_HOST" "curl -fsS '$DEPLOY_HEALTH_URL'" >/dev/null 2>&1; then
        ok "healthy"
        healthy=1
        break
    fi
    if (( i < HEALTH_ATTEMPTS )); then
        warn "attempt $i/$HEALTH_ATTEMPTS not ready, retrying in 2s..."
        sleep 2
    fi
done

if (( healthy == 0 )); then
    err "health check failed after $HEALTH_ATTEMPTS attempts"
    err "tail server logs: ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && npm run deploy:logs'"
    exit 1
fi

step "Verify served bundle matches built image"
verify_out="$(ssh "$DEPLOY_HOST" bash -se <<'REMOTE'
set -euo pipefail
built="$(docker exec freestyle-app sh -c 'ls /app/web/dist/assets/index-*.js' 2>/dev/null | head -1 | sed -n 's|.*/\(index-[^.]*\.js\)|\1|p')"
served="$(curl -fsS http://127.0.0.1:3001/ | grep -o '/assets/index-[^"]*\.js' | head -1)"
echo "built=$built"
echo "served=$served"
REMOTE
)"
built_asset="$(echo "$verify_out" | sed -n 's/^built=//p')"
served_asset="$(echo "$verify_out" | sed -n 's/^served=//p')"

if [[ -z "$built_asset" || -z "$served_asset" ]]; then
    warn "could not verify served bundle (built='$built_asset' served='$served_asset')"
elif [[ "$served_asset" != "/assets/$built_asset" ]]; then
    err "served bundle ($served_asset) does not match built asset (/assets/$built_asset)"
    err "the container is serving a stale build — check docker logs and image"
    exit 1
else
    ok "served bundle is $served_asset"
fi

step "Deploy complete ($short_sha)"
