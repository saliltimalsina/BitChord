#!/usr/bin/env bash
# Builds the web player for music.saliltimalsina.com.np and deploys it to Vercel.
# Usage: web/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export BITCHORD_SITE_ORIGINS="https://music.saliltimalsina.com.np,http://localhost:5173"
export VITE_PARTY_SERVER_URL="${VITE_PARTY_SERVER_URL:-https://api.bitchord.kushagrasingh.in}"

pnpm build:site
cp deploy/vercel.json app/dist/vercel.json
mkdir -p app/dist/.vercel
cp deploy/vercel-project.json app/dist/.vercel/project.json
vercel deploy app/dist --prod --yes
