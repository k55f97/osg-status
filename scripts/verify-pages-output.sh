#!/usr/bin/env bash
#
# Publish gate for .github/workflows/deploy.yml.
#
# `npx wrangler pages deploy .vercel/output/static` REPLACES the whole site:
# whatever sits in that directory becomes status.openshopgraph.org, and every
# file absent from it is gone from the live site. The generating step
# (`npx @cloudflare/next-on-pages`) is fail-closed against its own *process*
# failure only — a non-zero exit stops the job. Nothing asserted that the
# directory it hands on actually contains a site, so an empty or truncated
# build directory would have been published as-is and taken the status page
# down without a single red step in the run. A status page that is silently
# blank is the one outage nothing else in this system reports.
#
# This script is that assertion. deploy.yml runs it directly after the build
# and therefore BEFORE the first production mutation (`terraform apply`), so a
# broken build costs nothing in production: the job stops while Cloudflare is
# still untouched.
#
# Thresholds are measured against a real build of main at f9aaded
# (@cloudflare/next-on-pages 1.13.12, next 14.2.28, node 22.17.0):
#   49 files total | _worker.js/index.js 27423 bytes | 18 files under
#   _next/static, of which 16 are .js chunks.
# MIN_FILES is deliberately far below the measured 49. This gate exists to
# catch "empty" and "half", not to police the size of a legitimate change.
#
# Deliberately NOT checked: index.html. This site has no prerendered index —
# `/` and `/incidents` are rendered at request time by _worker.js, and a
# correct build of main produces no index.html at all (measured: only 404.html
# and 500.html exist at the root). Asserting it would be red on arrival.

set -euo pipefail

DIR="${1:-.vercel/output/static}"
MIN_FILES=20

fail() {
  echo "::error::publish gate: $1"
  echo "publish gate REFUSED the deploy: $DIR is not a complete build." >&2
  exit 1
}

[ -d "$DIR" ] ||
  fail "$DIR does not exist — the page build produced no output directory."

# The Pages entrypoint. Without it Cloudflare serves the static assets only,
# and every real route of the status page (/, /incidents, /api/data) is a 404.
[ -s "$DIR/_worker.js/index.js" ] ||
  fail "$DIR/_worker.js/index.js is missing or empty — nothing would serve / or /incidents."

# Tells Pages which paths go to the worker instead of the asset store. Missing
# it, requests never reach the entrypoint above.
[ -s "$DIR/_routes.json" ] ||
  fail "$DIR/_routes.json is missing or empty — Pages would route no request to the worker."

[ -d "$DIR/_next/static" ] ||
  fail "$DIR/_next/static does not exist — the client bundle was not emitted."

chunks=$(find "$DIR/_next/static" -type f -name '*.js' | wc -l | tr -d ' ')
[ "$chunks" -ge 1 ] ||
  fail "no JavaScript chunk under $DIR/_next/static — the page would load without its client bundle."

files=$(find "$DIR" -type f | wc -l | tr -d ' ')
[ "$files" -ge "$MIN_FILES" ] ||
  fail "only $files files in $DIR, expected at least $MIN_FILES — the build looks truncated."

echo "publish gate OK: $files files, $chunks client chunks, worker entrypoint present."
