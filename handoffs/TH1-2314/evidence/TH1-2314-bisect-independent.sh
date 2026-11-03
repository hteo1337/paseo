#!/bin/sh
cd /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline || exit 125
revision=$(git rev-parse --short=9 HEAD)
/tmp/TH1-2314-build-baseline-runtime.sh > "/tmp/TH1-2314-independent-${revision}-runtime-build.log" 2>&1 || exit 125
(cd packages/server && npx vitest run src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts) > "/tmp/TH1-2314-independent-${revision}-test.log" 2>&1
result=$?
printf '%s test exit %s; resolution table and fresh runtime build logs recorded\n' "$revision" "$result"
exit "$result"
