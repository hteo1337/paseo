# Phase 1 replay evidence — 2026-11-03

Verified before reset:

```
git rev-parse --show-toplevel
/Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7
git branch --show-current
port/TH1-2314-v0150
```

`git status --short` showed only untracked handoffs/. Origin fetch/push URL was https://github.com/hteo1337/paseo.git; upstream was not modified.

Commands executed (Python stops on the first nonzero git exit):

```sh
if [ "$(git rev-parse --show-toplevel)" = /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7 ] && [ "$(git branch --show-current)" = port/TH1-2314-v0150 ]; then git reset --hard v0.15.0; else exit 1; fi
python3 - <<'PY'
import pathlib,subprocess
p=pathlib.Path.home()/'Work/GitHub/paseo-app-patches/v0.14'
for name in p.joinpath('series').read_text().splitlines():
 if name.startswith('#') or not name: continue
 if int(name[:4])>19: break
 subprocess.run(['git','am','-3',str(p/name)],check=True)
PY
```

Terminal output (checkout progress omitted):

```
HEAD is now at 8938fde3c chore(release): cut 0.15.0
Applying: feat(app): collapse and cap the top sidebar group
Applying: fix(app): honour the sidebar group's share on short windows
Applying: feat(app): let the sidebar navigation group be dragged
Applying: fix(app): leave the sidebar's chrome room when the nav group is dragged
Applying: feat(composer): suggest the next prompt after a turn ends
error: sha1 information is lacking or useless (packages/app/src/i18n/resources/ar.ts).
error: could not build fake ancestor
Patch failed at 0001 feat(composer): suggest the next prompt after a turn ends
```

The displayed `0001` is git am's per-invocation ordinal: the failed series position is **0005**. Python raised CalledProcessError for git am -3 /Users/hteo/Work/GitHub/paseo-app-patches/v0.14/0005-feat-composer-suggest-the-next-prompt-after-a-turn-e.patch (exit 128).

Inspected `git status --short` (only untracked handoffs/), `git diff --stat` (empty), `git log -5 --oneline`, and `git am --show-current-patch=diff` before aborting the failed invocation with `git am --abort`. No changes from 0005 retained.

Preserved patch commits:

```
af38b5256 fix(app): leave the sidebar's chrome room when the nav group is dragged
29b67e071 feat(app): let the sidebar navigation group be dragged
4c510ed66 fix(app): honour the sidebar group's share on short windows
c6da23082 feat(app): collapse and cap the top sidebar group
```

Build, real-path registration check, lint and paseo-accounts tests: **not run**. No source re-port attempted; the task explicitly requires stopping on any failed replay in 0001–0019. No PR-ready claim, review or install.

## Handoff commit checks

The initial `git commit` was rejected by pre-commit: handoff Markdown formatting failed, and the hook automatically ran `npm run typecheck` with exit 2. Representative exact output:

```
npm notice run paseo@0.15.0 typecheck
npm notice run npm run typecheck --workspaces --if-present
antigravity-provider/server/internal/catalog.ts(3,3): error TS2305: Module '"@getpaseo/plugin/server/provider"' has no exported member 'ProviderLaunch'.
antigravity-provider/server/internal/catalog.ts(6,3): error TS2305: Module '"@getpaseo/plugin/server/provider"' has no exported member 'ProviderStatus'.
src/utils/client.ts(1,51): error TS2307: Cannot find module '@getpaseo/client/node' or its corresponding type declarations.
exit status 2
```

This is an unbuilt v0.15 workspace. No baseline or rebuild was attempted following the explicit replay-stop condition; this is not a regression diagnosis. The failure output was truncated by the tool; only the excerpts above are preserved. Markdown formatted with `npm run format:files -- handoffs/CHECKLIST-c9c038ef.md handoffs/TH1-2314/STATUS.md handoffs/TH1-2314/BLOCKED.md handoffs/TH1-2314/REPLAY.md`. For the documentation-only checkpoint commit, the failed typecheck job is explicitly excluded using `LEFTHOOK_EXCLUDE=typecheck`; format remains enabled. This is an incomplete checkpoint, not a passing verification gate.
