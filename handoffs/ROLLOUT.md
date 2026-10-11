# TH1-662 grouping rollout — owner 2e198e3b only

This task does not install or restart. Grouping is the second rollout after TH1-630 recovery/uniqueness on m5 and m4. Final commit, patch hashes and PRs will be filled after the owner's revised integration heads arrive. Keep the first rollout's checkpoint/idle/signing/backup procedure.

1. Review/merge the source PR after uniqueness and the patch PR against main. Refresh the patch checkout and verify its HEAD contains the supplied0057 bytes. Do not re-export0001–0056. Check all prior payload hashes against validation/project-grouping-prior-sha256.json.
2. Before the second daemon startup, retain backed mapping at $PASEO_HOME/ops-scratch/ws-clean/grouping.tsv. m5 has the original mapping. m4 does NOT have that canonical file (checked2026-10-11). The supplied grouping/grouping-source.tsv has277 rows across BOTH hosts, including7 m4 rename rows. Read-only inspection against m4 projects/projects.json found6 currently eligible exact id/root/prefix matches; one no longer matches. Filter the supplied TSV to host=m4 before staging; the migration itself retains the id/root/prefix/action guards. Verify against current records again before startup. Do not infer removals from prefixes without TSV authority. Migration refuses missing roots, different IDs, unsupported groups and non-rename actions.
   Stage the filtered m4 evidence only in the rollout session, before daemon startup:

```sh
python3 - <<'PY_STAGE'
import csv
from pathlib import Path
source = Path.home() / '.paseo/ops-scratch/grouping/grouping-source.tsv'
target = Path.home() / '.paseo/ops-scratch/ws-clean/grouping.tsv'
with source.open() as stream:
    reader = csv.DictReader(stream, delimiter='\t')
    fields = reader.fieldnames
    rows = [row for row in reader if row['host'] == 'm4']
if target.exists():
    raise SystemExit('Existing mapping must be inspected before replacement')
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('w') as stream:
    writer = csv.DictWriter(stream, fields, delimiter='\t', lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
PY_STAGE
```

3. Build one host at a time from the complete v0.11/series on upstream v0.11.2. In an isolated build worktree, run the following sequentially (never build:server's concurrent dependency shortcut):

```sh
# PATCH_REPO is the merged paseo-app-patches checkout; BUILD_DIR is the owner's isolated build worktree.
# Apply every non-comment series entry with git am, in order, to a clean v0.11.2 checkout.
while IFS= read -r payload; do
  case "$payload" in ''|'#'*) continue ;; esac
  git -C "$BUILD_DIR" am "$PATCH_REPO/v0.11/$payload" || exit 1
done < "$PATCH_REPO/v0.11/series"
cd "$BUILD_DIR"
npm ci
npm run build:client:clean
npm run build:highlight:clean
npm run build:plugin:clean
npm run build:relay:clean
npm run build --workspace=@getpaseo/server
npm run build --workspace=@getpaseo/cli
npm run build --workspace=@getpaseo/expo-two-way-audio
(cd packages/app && PASEO_WEB_PLATFORM=electron npx expo export --platform web --max-workers 1)
npm run build:main --workspace=@getpaseo/desktop
```

4. Package/sign/notarize with the first rollout's verified v0.11.2 signing configuration. Before packaging, write the marker from the exact applied series:

```sh
python3 - "$PATCH_REPO" "$BUILD_DIR" <<'PY_MARKER'
import datetime, hashlib, json, subprocess, sys
from pathlib import Path
patches, build = map(Path, sys.argv[1:])
series = (patches / 'v0.11/series').read_bytes()
payloads = [line for line in series.decode().splitlines() if line.strip() and not line.startswith('#')]
digest = hashlib.sha256(series + b''.join((patches / 'v0.11' / name).read_bytes() for name in payloads)).hexdigest()[:16]
head = subprocess.check_output(['git', '-C', str(build), 'rev-parse', 'HEAD'], text=True).strip()
marker = {'localBuild': True, 'baseTag': 'v0.11.2', 'seriesHash': digest, 'head': head,
          'builtAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}
(build / 'packages/desktop/assets/local-build.json').write_text(json.dumps(marker, indent=2))
PY_MARKER
(cd "$BUILD_DIR/packages/desktop" && npx electron-builder --config electron-builder.yml --mac --arm64)
BUILT="$BUILD_DIR/packages/desktop/release/mac-arm64/Paseo.app"
node "$PATCH_REPO/validation/mac-signing.js" "$BUILT"
# Rollout owner only, after checkpointing agents and verifying the signed bundle/marker:
~/.claude-setup/bin/paseo-patched-update.sh --install-app "$BUILT" --wait
# Transfer the verified bundle to m4 with the first rollout's procedure, run the same validator,
# then run --install-app <transferred-bundle> --wait on m4.
```

The prebuilt --install-app path was inspected: it bypasses root-series build selection, checks the bundle marker/signature, waits for idle and validates installed asar equality. This task did not run the packaging/signing/install commands. Preserve local-build.json's baseTag/head/seriesHash provenance. Validate the resulting signed bundle and install/restart using the rollout owner's existing procedure, serially on m5 then m4. The inspected m4 ~/.claude-setup/bin/paseo-patched-update.sh currently reads the ROOT v0.10.3 series and its library requires the clone root; it does not select v0.11 as README claims. Do not invoke it blindly for this series or point it to a subfolder its guard rejects. Owner was notified. This grouping patch does not modify installer tooling. 5. After startup, inspect group JSON and migrated names. Configure ordered automatic rules below, after inspecting existing rule IDs. CLI flags omitted preserve the daemon's latest group defaults. Manual set/unset wins over all rules; metadata updates apply to every same-name member/rule. Platform rule must precede the broader company rule. Fleet tooling path/owner must come from the reviewed mapping, not a blanket directory guess.

```sh
paseo project group ls --json
paseo project ls --json
paseo project group rule add platform 'Nexus Platform' --repo-prefix bf- --order 1
paseo project group rule add blackforge-owner BlackForge --owner BlackHubTechnologies --order 0
paseo project group rule add blackforge-path BlackForge --path '~/Work/GitHub/BlackForge/**'
# paseo project group rule add fleet-path 'Fleet tooling' --path '<reviewed fleet root>/**' --order 2
paseo workspace ls --group 'Nexus Platform' --json
paseo workspace ls --group 'BlackForge' --json
paseo workspace ls --group 'Fleet tooling' --json
```

6. Verify server_info.features.projectGroups; desktop and mobile/web headers, project/workspace counts, attention badges, ungrouped section and collapsed Scratch. Collapse a group then relaunch that client; another client keeps its own collapse preferences. Toggle hide workspaces with no live agent. Change a project's group while filtering/collapsing/ordering that repository and confirm preferences persist. Verify divergent host assignments and empty/pinned placement headers. Confirm worktree/review clones stay with their canonical repository and no directory changed. This task provides a generated text rendering and web bundle, not installed UI/native acceptance.

Needs Teo: no unresolved product decisions. Needs rollout owner: authoritative revised heads, staging the backed m4 TSV, signed packaging/install and desktop/mobile runtime acceptance. PR review/merge belongs to the rollout owner.
