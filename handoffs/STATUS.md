# TH1-1798 STATUS (this commit stays off the PR head)

- Done: 6 commits on origin/main d6fa23189; draft PR https://github.com/getpaseo/paseo/pull/7753 from fork branch TH1-1798-prompt-suggestions (= HEAD~1), supersedes #5047. Screenshots on fork branch TH1-1798-pr-assets (bf968a138).
- decided: opt-in (Teo, AskUserQuestion) — configured-only kept; settings, toggle hints and docs say suggestions stay off until a model is picked.
- Fixed in QA: missing i18n key settings.metadataGeneration.fallbackHint → suggestionModelHint in 9 locales (folded into the settings commit).
- Verified at tip: typecheck, lint, format:check exit 0; live web QA of settings, first prompt, next prompt (1280/375) and drafted answers (1280/375). Vitest last run before the copy-only fixes (no test references changed strings).
- Not verified: iOS/Android native, Electron; CI on #7753.
- Sol review (task 76d36b67) BLOCKING, 3 findings, fixed as fixups: prompt-suggestion event feed gated on server_info.features.promptSuggestions (COMPAT-tagged, own subscription); drain reserves the slot before any await and drafts share the maxConcurrent queue; settings save error rendered in place (web Alert is a no-op). #5047 closed pointing at #7753.
- Not run: vitest (session test-cap hook); reviewer re-runs its reproduction.
- Sol confirmation (task cd862442) CONFIRMED at 3551ccb3c; service.test.ts 32/32 on reviewer run. #7753 marked ready for review (Teo, 2026-10-24).
- Next: upstream maintainer approves fork CI and reviews; no merge from our side.
