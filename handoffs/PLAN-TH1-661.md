# TH1-661 — remaining OpenCode abort deadline

Session: TH1-661-d7bb5b3b
Status: running
Repair the one remaining confirm-review finding: cap shutdown session.abort at 2s without abandoning server release ownership. Add one regression to the affected existing OpenCode suite, prove it fails unchanged, carry fix/test to v0.11.2 and regenerate 0061 against its pinned series prefix. Run only affected OpenCode test file(s) and typecheck:server once; format/scoped lint. Commit/push source, port and patch branches; update STATUS and Linear. Same Sol reviewer confirms next. No merge/install or unrelated work.
Checklist: handoffs/CHECKLIST-d7bb5b3b.md
