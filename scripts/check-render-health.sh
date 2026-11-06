#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${RENDER_HEALTH_URL:-}" ]]; then
  echo '::error::Set the repository variable RENDER_HEALTH_URL to https://<your-service>.onrender.com/api/health.'
  exit 1
fi
if [[ "$RENDER_HEALTH_URL" != https://* ]]; then
  echo '::error::RENDER_HEALTH_URL must use HTTPS.'
  exit 1
fi

health_file="$RUNNER_TEMP/render-health.json"
for attempt in 1 2 3; do
  if curl --fail --silent --show-error \
    --proto '=https' \
    --connect-timeout 10 --max-time 60 \
    --output "$health_file" \
    "$RENDER_HEALTH_URL" \
    && python3 -c 'import json, sys; data = json.load(open(sys.argv[1])); sys.exit(0 if isinstance(data, dict) and data.get("ok") is True else 1)' "$health_file"; then
    echo "Render health check passed (attempt $attempt)."
    exit 0
  fi
  echo "::warning::Health check attempt $attempt failed; the service may be starting."
  if [[ "$attempt" -lt 3 ]]; then sleep 5; fi
done

echo '::error::Render did not return a successful health response after three attempts.'
exit 1
