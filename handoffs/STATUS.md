# TH1-661 — fixes and v0.11.2 port; awaiting Sol re-review

Issue: https://linear.app/th1337/issue/TH1-661; PRs: https://github.com/hteo1337/paseo/pull/2 and https://github.com/hteo1337/paseo-app-patches/pull/10.
Branches: `feat/idle-agent-unload` (implementation `dddfa37cd`), `th1-661-idle-unload-v0.11.2` (implementation `b3de9caf4`), patches `feat/idle-agent-unload-v0103`.
Done: ACP RPC deadlines, independent bounded idle sweeps retaining ownership, Reload descendant cleanup barrier, and derived-provider forwarding.
Port: all semantic combinations retained; schema regenerated; `v0.11/0061` exported; task tag `th1-661-patch-source-v0.11.2` preserves generated source.
Verification: source 7 passed; port 286 focused passes; typecheck:server once exit 0; final server build exit 0; 58-patch series applies; all 32 payload files match source.
Baseline: MCP workspace creation and workspace child projectKey assertions fail on untouched release; source has one pre-existing lint error; port scoped lint passes.
Next: Sol re-review of source PR #2, port branch and patch PR #10; leave PRs open. Do not merge or install.
Open: CI/full-suite/installed behavior unverified; no approval needed to prepare review. See TH1-661-VERIFICATION.md and source TH1-661-REVIEW-HISTORY.md.
decided: export against actual v0.11 series prefix and preserve untouched recovery payloads; reuse existing dependencies and keep main daemon running.
