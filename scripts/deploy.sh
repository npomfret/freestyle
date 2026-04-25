#!/usr/bin/env bash
#
# Deploy Freestyle to the production server.
#
# Each commit is built and tagged as freestyle-app:<sha>. Because the
# image tag is unique per commit, the compose service references a new
# image, so the container is always recreated and there is no "did the
# cache reuse the old image" failure mode.
#
# Local pre-flight: clean tree, on deploy branch, in sync with upstream,
# type-checks pass.
#
# Remote: git pull, build freestyle-app:<sha>, recreate container with
# APP_IMAGE_TAG=<sha>, assert the running container's image matches the
# freshly built image, health check, assert the served bundle differs
# from what was served before the deploy.
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

if ! compile_out="$(npm run compile 2>&1)"; then
    err "type-check (npm run compile) failed:"
    printf '%s\n' "$compile_out" >&2
    exit 1
fi
ok "type-check (npm run compile) passed"

sha_full="$(git rev-parse HEAD)"
sha="$(git rev-parse --short=12 HEAD)"
subject="$(git log -1 --pretty=%s)"
step "Deploying $sha to $DEPLOY_HOST:$DEPLOY_PATH"
echo "  commit: $sha  $subject"
echo "  image:  freestyle-app:$sha"

step "Capture pre-deploy state"
pre_served="$(ssh "$DEPLOY_HOST" "curl -fsS http://127.0.0.1:3001/ 2>/dev/null" | grep -o '/assets/index-[^\"]*\.js' | head -1 || true)"
echo "  pre-deploy bundle: ${pre_served:-<none>}"

step "Remote: pull, build, recreate"
# Database safety: only the 'app' service is ever passed to docker compose.
# 'db' is never built, recreated, or stopped by this script. The named volume
# freestyle_pgdata persists across all operations here.
ssh "$DEPLOY_HOST" bash -se <<REMOTE
set -euo pipefail
cd "$DEPLOY_PATH"

export APP_IMAGE_TAG="$sha"
compose="docker compose -f docker-compose.production.yml --env-file .env.production"

echo "▸ git pull --ff-only"
git pull --ff-only
server_sha="\$(git rev-parse HEAD)"
if [[ "\$server_sha" != "$sha_full" ]]; then
    echo "✗ server checkout sha \$server_sha != deployed sha $sha_full" >&2
    exit 1
fi
echo "  ✓ server at \$(git rev-parse --short HEAD)"

# Confirm db is up before we touch the app, and assert we're not about
# to act on it. Fail early if the db container is missing — recreating
# it would risk reinitialising from schema.sql if the volume were ever
# lost, and the deploy script is not the place to handle that.
if ! docker inspect freestyle-db --format '{{.State.Status}}' >/dev/null 2>&1; then
    echo "✗ freestyle-db container is missing — refusing to deploy" >&2
    echo "  bring the database up manually first" >&2
    exit 1
fi
echo "  ✓ freestyle-db present (will not be touched)"

echo "▸ build freestyle-app:$sha"
\$compose build app
built_id="\$(docker image inspect freestyle-app:$sha --format '{{.Id}}' 2>/dev/null || true)"
if [[ -z "\$built_id" ]]; then
    echo "✗ build did not produce freestyle-app:$sha" >&2
    exit 1
fi
echo "  ✓ image id: \$built_id"

# Also tag as :latest so manual deploy:up scripts (which have no
# APP_IMAGE_TAG) use the current image rather than a stale one.
docker tag "freestyle-app:$sha" freestyle-app:latest
echo "  ✓ also tagged freestyle-app:latest"

echo "▸ recreate app container with APP_IMAGE_TAG=$sha"
\$compose up -d app

container_image="\$(docker inspect freestyle-app --format '{{.Image}}')"
if [[ "\$container_image" != "\$built_id" ]]; then
    echo "✗ container is not running freestyle-app:$sha" >&2
    echo "  container image: \$container_image" >&2
    echo "  expected:        \$built_id" >&2
    exit 1
fi
echo "  ✓ app container running freshly built image"

# Sanity: db must still be running after the app recreate.
db_status="\$(docker inspect freestyle-db --format '{{.State.Status}}' 2>/dev/null || echo missing)"
if [[ "\$db_status" != "running" ]]; then
    echo "✗ freestyle-db status is '\$db_status' after deploy — investigate immediately" >&2
    exit 1
fi
echo "  ✓ freestyle-db still running"
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
    err "tail server logs: ssh $DEPLOY_HOST 'cd $DEPLOY_PATH && APP_IMAGE_TAG=$sha npm run deploy:logs'"
    exit 1
fi

step "Verify served bundle changed"
post_served="$(ssh "$DEPLOY_HOST" "curl -fsS http://127.0.0.1:3001/ 2>/dev/null" | grep -o '/assets/index-[^\"]*\.js' | head -1 || true)"
echo "  post-deploy bundle: ${post_served:-<none>}"

if [[ -z "$post_served" ]]; then
    err "could not parse asset path from served HTML after deploy"
    exit 1
fi

if [[ -n "$pre_served" && "$pre_served" == "$post_served" ]]; then
    warn "served bundle filename unchanged ($post_served)"
    warn "this is expected only if the web sources did not change since last deploy"
else
    ok "served bundle changed: ${pre_served:-<none>} → $post_served"
fi

step "Deploy complete ($sha)"
