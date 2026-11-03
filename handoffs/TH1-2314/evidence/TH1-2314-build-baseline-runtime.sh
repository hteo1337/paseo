#!/bin/sh
set -u
cd /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline || exit 125
revision=$(git rev-parse --short=9 HEAD)
for package in protocol relay highlight plugin; do
  logfile="/tmp/TH1-2314-independent-${revision}-${package}-build.log"
  npm run "build:${package}:clean" > "$logfile" 2>&1
  result=$?
  printf '%s %s build exit %s\n' "$revision" "$package" "$result"
  if [ "$result" != 0 ]; then
    # Reproduce the known duplicate-property type error without substituting code:
    # TypeScript still emits JS; all runtime outputs are verified afresh below.
    if [ "$package" != protocol ] || ! rg -q 'error TS1117' "$logfile"; then exit 125; fi
    if rg 'error TS' "$logfile" | rg -v 'error TS1117' >/dev/null; then exit 125; fi
  fi
done
node /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7/handoffs/TH1-2314/baseline-imports.mjs "$PWD" > "/tmp/TH1-2314-independent-${revision}-resolution.log" 2>&1 || exit 125
