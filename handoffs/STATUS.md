# TH1-662 — merged; branch preservation

Issue: https://linear.app/th1337/issue/TH1-662/real-paseo-project-groups-daemon-identity-rules-cli-and-sidebar — Done, project paseo-ops.
Branch: feat/th1-662-project-groups; original delivery checkpoint 26ca4d74682f57f3a6c0303f6de915763e3579d1 and all five original commits retained.
Source PR https://github.com/hteo1337/paseo/pull/6 merged as 5cff3748c384769bbb148b2ca211acc0a657801b; direct full-tree diff against original local HEAD is empty.
Patch PR https://github.com/hteo1337/paseo-app-patches/pull/15 is merged as 37396197593bfb27373e0ffb1fb0d8a76a274265.
On 2026-10-12 the remote task branch was absent; release/v0.11.2-patches is a5617884e37b500fc1854ae5ad02c1bfd56b32cc, adding the independent PR #7 guard follow-up.
Preservation: recreated and pushed the task branch from the existing local history plus documentation only; leave the release branch and both merged PRs untouched.
Detailed original verification remains in git show 26ca4d746:handoffs/STATUS.md and handoffs/evidence; rollout instructions remain in handoffs/ROLLOUT.md.
No tests, builds, re-review, install, restart, deploy, or deletion performed; rollout/runtime acceptance stays with the fleet owner.
