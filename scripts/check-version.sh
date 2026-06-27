#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:4002}"
WEB_BASE_URL="${WEB_BASE_URL:-https://imagephotos.asia}"

echo "[version-check] API: ${API_BASE_URL}/api/version"
curl --fail --silent --show-error "${API_BASE_URL%/}/api/version"
echo

echo "[version-check] Web: ${WEB_BASE_URL}/version.json"
curl --fail --silent --show-error "${WEB_BASE_URL%/}/version.json"
echo
