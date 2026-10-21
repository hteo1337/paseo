# Codex MCP session selection verification

The implementation was verified in an isolated source worktree without installing
it into the running Paseo application or changing live configuration.

| Check                                                                                           | Result                    |
| ----------------------------------------------------------------------------------------------- | ------------------------- |
| Native provider, selection, manager, projections, storage, persistence and MCP-tool unit suites | 710 passed across 7 files |
| SDK tests, including bare provider defaults and capability gating                               | 25 passed                 |
| Protocol create and wire-compatibility tests                                                    | 19 passed                 |
| Real SDK/WebSocket daemon boundary with fake provider and durable reload                        | 1 passed                  |
| Whole-monorepo typecheck and normal server/CLI dependency build                                 | Passed                    |
| Whole-monorepo typecheck, normal commit hooks, server/CLI build                                 | Passed                    |
| All 26 changed TypeScript source/test/script files: lint                                        | Passed                    |
| Formatting of changed files and Git whitespace check                                            | Passed                    |

The bounded daemon test is
`packages/server/src/server/plugins/mcp-selection.e2e.test.ts`. It uses a temporary
workspace and fake Codex client, checks native provider inputs and approval settings,
then reloads persisted configuration. It creates no model turn. It required loopback
binding permission; an initial sandbox refusal and superseded approval rejection were
resolved before the successful isolated run.

The opt-in `scripts/probe-codex-mcp-selection.mts` exercises the production Codex
session implementation with an existing account and dummy stdio MCP fixtures.
The task owner verified two concurrent sessions, selected/coordination startup,
unselected and later-hook exclusions, thread-scoped status, account-home guards,
and zero surviving owned processes after teardown. It sends no model turn, copies
no credentials, and prints fixture names/counts only. It is intentionally outside
normal CI because it requires an existing Codex binary and account configuration.

The two affected Hub suites passed18tests in the final elevated fixture run.
Earlier sandbox/signing failures were resolved by running the authorized fixtures
with normal host access; signing settings were preserved.

The source and runtime checks establish the supported explicit session override
contract. They do not claim discovery of every managed or Codex-plugin MCP source.
Preview inventory must retain its completeness limitations and refresh before launch.

Runtime metadata clarified the three remaining tool servers in the tested account:

| Name         | Transport       | Source                                                        | Local process behavior                                     |
| ------------ | --------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `concise`    | stdio           | `be-concise/concise/0.16.4/.mcp.json`                         | Plugin starts a Node child per session                     |
| `cua_repl`   | stdio           | `openai-bundled/unified-computer-use/26.1007.30912/.mcp.json` | Plugin starts a Node child per session                     |
| `codex_apps` | Streamable HTTP | Codex0.163 built-in Apps MCP integration                      | HTTP client to hosted service; no local MCP server process |

These entries remain outside the configured-server selection. The Connectors picker
must disclose that app/plugin/managed sources can stay enabled, with additional
processes and tools, before offering creation. The selected configured set is not
complete runtime isolation. Counts observed in the fixture account were374/8/3tools
respectively; account/plugin updates can change them. No endpoint, token, header or
credential data was emitted. Two fixture MCP processes plus two plugin Node children
were observed; transient internal Git children can appear independently of MCPs.
