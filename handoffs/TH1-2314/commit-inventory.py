#!/usr/bin/env python3
"""Measure export history without rewriting or exporting it."""
import json
import subprocess

refs = subprocess.check_output(
    ['git', 'rev-list', '--reverse', 'v0.15.0..HEAD'], text=True
).splitlines()
counts = {'total': len(refs), 'source_only': 0, 'handoff_only': 0, 'mixed': 0, 'empty': 0}
mixed = []
for ref in refs:
    paths = subprocess.check_output(
        ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', ref], text=True
    ).splitlines()
    source = [p for p in paths if not p.startswith('handoffs/')]
    handoff = [p for p in paths if p.startswith('handoffs/')]
    kind = 'mixed' if source and handoff else 'source_only' if source else 'handoff_only' if handoff else 'empty'
    counts[kind] += 1
    if kind == 'mixed':
        subject = subprocess.check_output(['git', 'show', '-s', '--format=%s', ref], text=True).strip()
        mixed.append({'commit': ref, 'subject': subject, 'source_paths': source})
print(json.dumps({'counts': counts, 'mixed': mixed}, indent=2))
