TH1-1767 — project paseo-ops; source branch port/TH1-1767 in hteo1337/paseo.
Done: unchanged70-entry v0.12 series replayed with git am -3 on v0.12.0; source replay head181e5b018; no fix exported.
Verification: npm ci --ignore-scripts and build:server passed; agent-manager.test.ts268/268 passed once; compiled manager/Claude provider match installed m5 SHA256.
Finding: isolated fresh import and actual stuck-session transcript replay both unload; no failing regression or live guard identified.
Next: read dispatch/TH1-1767 handoffs/TH1-1767-evidence.md and replay-import.mjs for complete reproducible evidence; obtain live guard state without loading mirrors.
Patch repo: branch dispatch/TH1-1767 in paseo-app-patches; --replayed rejects historical0002 on stable; future fix must export independently after existing0070.
Limits: no installation, daemon/app restart, live mirror inspect/reload/archive or model turn; no PR-ready review consumed.
Open: root cause, fix, fork review/upstream PR, patch payload/PR and post-install15-minute verification.
