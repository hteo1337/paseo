# Prompt suggestions — more trigger points

Branch `feat/prompt-suggestions-triggers`, cut from the branch under review in
getpaseo/paseo#5047. Nothing here touches that PR until it lands.

Today a suggestion exists only if a turn finishes while a client is listening,
and it lives in memory. Open a chat whose last turn ended before the daemon
restarted and the composer is empty. Teo asked for three more moments.

## A — opening a chat with history

The client asks for suggestions when it shows a chat whose composer is empty and
for which it holds none. New request/response pair
`agent.prompt_suggestions.request` (agentId, requestId). The service answers from
a per-agent cache when the timeline has not moved since it generated, otherwise
generates. Rate limited per agent so reopening a chat repeatedly costs one call.

Acceptance: reopen a chat after a daemon restart, suggestions appear within a few
seconds; reopening again sends no second generation.

## B — a brand-new empty chat

No conversation to read, so the prompt is built from the workspace instead:
branch, recent commits, changed files, and the repo's own README title line.
Separate style key `newChatSuggestions` with its own default rules, so a repo can
steer it through paseo.json like the rest.

This sends repo state to the metadata model, which conversation-only suggestions
never did — document it, and keep it behind the same host setting.

Acceptance: a new chat in a dirty repo proposes work that names real files; the
same chat in an empty directory proposes nothing rather than inventing.

## C — an agent waiting on the user

Only for a permission request of kind `question`: the provider asked something
and the answer is prose. Tool, plan and mode approvals are excluded — a suggestion
that says "yes, allow it" is a suggestion to skip reading it.

Acceptance: a question permission produces reply suggestions; a tool permission
produces none, proven by a test that fails if the kind filter is removed.

## Order

A, then C, then B. A is the one that fixes the complaint; B is the largest and
the only one that changes what leaves the machine.

## Gate

`npm run test:unit -w @getpaseo/server`, protocol, client and app suites,
typecheck, lint, format. Live check on the installed daemon for each trigger.
