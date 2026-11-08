# TH1-2410 — Per-device credentials

- Issue: https://linear.app/th1337/issue/TH1-2410/security-paseo-app-per-device-credentials-so-phones-never-need-the
- Repo: hteo1337/paseo; branch: dispatch/TH1-2410; based on fork/main 550ddec46. Recovery branch has not landed; host-page prompt untouched.
- Done: hash-only device store, bounded expiring socket-bound approval, explicit copied grants, list/revoke, live-session revocation, device hello authentication and secure native storage; browser storage is tab memory only.
- Done: Pair device management UI and approval notices; no credential added to pairing URLs/QRs or host registry. Raw error payload logging removed to avoid credential disclosure.
- Verification: baseline new regression failed (Server sent no subprotocol); changed bootstrap-auth.test.ts suite 6/6 passed; npm run typecheck passed; npm run lint passed (0 warnings/errors); npm run format passed.
- Verification: isolated encrypted relay SDK approve/connect/revoke smoke passed; no issued secret in persisted JSON/pairing URL. Headless pair-device-relay spec exited 1 without completed test result; UI unverified.
- Next: exact-head Sol review, adversarial Sol review and read-only security-auditor pass; retry dispatcher (backend_busy); complete UI/fleet verification. Semif says adversarial_required (0.99759). Open/update security draft PR and push.
- Open questions: fork main lacks the routed fleet code described by the issue; current implementation approves separately per host. Fleet-wide behavior is not established. No merge/install/restart authorized.
