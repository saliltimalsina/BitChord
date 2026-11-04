#!/usr/bin/env bash
# Builds the web player for music.saliltimalsina.com.np and deploys it to Vercel.
# Usage: web/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export BITCHORD_SITE_ORIGINS="https://music.saliltimalsina.com.np,http://localhost:5173"
export VITE_PARTY_SERVER_URL="${VITE_PARTY_SERVER_URL:-https://api.bitchord.kushagrasingh.in}"

pnpm build:site
cp deploy/vercel.json app/dist/vercel.json

# Deploy from the repository root with the project named outright, as the
# deploy that works does: run from web/, the CLI eyed the deploy/ folder and
# answered "Not authorized".
VERCEL_ORG_ID="$(python3 -c "import json; print(json.load(open('deploy/vercel-project.json'))['orgId'])")"
VERCEL_PROJECT_ID="$(python3 -c "import json; print(json.load(open('deploy/vercel-project.json'))['projectId'])")"
export VERCEL_ORG_ID VERCEL_PROJECT_ID
cd ..
vercel deploy web/app/dist --prod --yes
