# TH1-1798 — Prompt suggestions upstream review

Issue: https://linear.app/th1337/issue/TH1-1798/upstream-prompt-suggestions-series-patches-0005-0017-0023-to
Branch: dispatch/TH1-1798 (review evidence only); PR head TH1-1798-prompt-suggestions at 95cee63a8; base d6fa23189.
Done: Sol PR-ready review BLOCKING; review.txt records P1 old-host event-feed rejection, P2 concurrency budget bypass, P2 invisible web save errors.
PR comment: https://github.com/getpaseo/paseo/pull/7753#issuecomment-6372635941 (one comment, updated with adversarial outcome; no PR-branch edits/readiness/merge).
Verification: build:protocol/diff-check passed; one targeted reproduction failed (3 calls vs cap 2; 30 existing tests skipped); exact-base schema control and 9-locale parity checked; CI action_required/no jobs; handoff-branch precommit format/typecheck passed (not PR-head checks).
Decided: adversarial required — full actual diff exceeded semif context limit, so default yes; exactly one separate read-only Sol review completed, same blockers, no additional confident findings.
Next: author fixes blocking findings, same reviewer confirms briefly, lead handles readiness/CI; review evidence and reproduction patch pushed on this branch (253ba66f7 verified); Linear review outcome recorded.
Open questions: none; no full suites or independent full typecheck/lint/browser/native/Electron execution claimed; temporary review artifacts cleaned.
