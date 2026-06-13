#!/usr/bin/env bash
set -e

APP_DIR="/www/wwwroot/ecommerce-ai-workflow"
APP_NAME="ecommerce-ai-workflow"
PORT_VALUE="${PORT:-3000}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

cd "$APP_DIR"

git fetch origin main
git reset --hard origin/main

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local is missing. Restore it before deploying."
  exit 1
fi

rm -rf .next
npm install --registry="$NPM_REGISTRY" --no-audit --loglevel=warn
npm run build

if [ ! -f .next/standalone/server.js ]; then
  echo "ERROR: .next/standalone/server.js was not generated."
  exit 1
fi

# Next standalone needs static assets copied next to server.js.
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -r public .next/standalone/public
fi

set -a
. ./.env.local
set +a

pm2 delete "$APP_NAME" || true
PORT="$PORT_VALUE" HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js --name "$APP_NAME"
pm2 save

sleep 2
curl -f "http://127.0.0.1:$PORT_VALUE" >/dev/null

/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload

pm2 status
