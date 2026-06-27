#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/aigcnong-unified}"
TARGET_REF="${1:-${TARGET_REF:-release/stable-provider-cloud-baseline}}"
PM2_PROCESS="${PM2_PROCESS:-aigcnong-video-api}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:4002}"
WEB_BASE_URL="${WEB_BASE_URL:-https://imagephotos.asia}"

cd "$APP_DIR"

if [[ ! -d .git ]]; then
  echo "[deploy] Not a Git repository: $APP_DIR" >&2
  exit 1
fi
if [[ ! -f .env && ! -f server/.env ]]; then
  echo "[deploy] Missing .env or server/.env; refusing to deploy." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[deploy] Working tree is not clean; refusing to deploy." >&2
  git status --short
  exit 1
fi

echo "[deploy] Fetching repository metadata"
git fetch --all --tags --prune

if git show-ref --verify --quiet "refs/remotes/origin/${TARGET_REF}"; then
  git checkout "$TARGET_REF"
  git pull --ff-only origin "$TARGET_REF"
else
  git checkout --detach "$TARGET_REF"
fi

export MOON_BUILD_BRANCH="${MOON_BUILD_BRANCH:-$(git branch --show-current)}"
export MOON_BUILD_BRANCH="${MOON_BUILD_BRANCH:-$TARGET_REF}"
export MOON_BUILD_COMMIT="$(git rev-parse HEAD)"
export MOON_BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > .build-version.json <<JSON
{
  "app": "MoonTv",
  "branch": "${MOON_BUILD_BRANCH}",
  "commit": "${MOON_BUILD_COMMIT}",
  "buildTime": "${MOON_BUILD_TIME}"
}
JSON

echo "[deploy] Installing dependencies"
npm install

echo "[deploy] Typechecking"
npm run typecheck --workspace server
npm run typecheck --workspace client

echo "[deploy] Building"
npm run build --workspace server
npm run build --workspace client

test -f client/dist/version.json
echo "[deploy] Built version:"
cat client/dist/version.json

echo "[deploy] Restarting PM2 process: $PM2_PROCESS"
pm2 restart "$PM2_PROCESS" --update-env

echo "[deploy] Validating Nginx configuration"
sudo nginx -t

API_BASE_URL="$API_BASE_URL" WEB_BASE_URL="$WEB_BASE_URL" bash scripts/check-version.sh

echo "[deploy] Complete: ${MOON_BUILD_COMMIT}"
