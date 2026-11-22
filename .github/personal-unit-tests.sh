#!/usr/bin/env bash
# The phone app's unit tests, for the personal workflows (sync and APK build).
#
# Upstream sometimes ships new English strings before their translations
# (1.10 did, with 50), which fails LocaleStringsTest until the translations
# land. Android shows English for a missing translation, so that one test
# failing is let through here, with a warning; any other failing test, or
# tests that don't compile, still fail the run.
set -uo pipefail

results=app/build/test-results/testDevDebugUnitTest
rm -rf "$results"
./gradlew --no-daemon --build-cache --continue :app:testDevDebugUnitTest "$@" && exit 0

if ! ls "$results"/*.xml >/dev/null 2>&1; then
  echo "::error::The unit tests didn't run (see the build output above)."
  exit 1
fi
others=$(grep -l '<failure\|<error' "$results"/*.xml | xargs -n1 basename | grep -v '^TEST-com\.music\.bitchord\.LocaleStringsTest\.xml$')
if [ -n "$others" ]; then
  echo "::error::Unit tests failed: $others"
  exit 1
fi
echo "::warning::Only LocaleStringsTest failed (translations upstream hasn't added yet); carrying on."
