
### Linked issue

Discussion: https://github.com/getpaseo/paseo/discussions/5045

Supersedes #5047: same feature, split into six commits, gated on a host feature flag, and opt-in.

### Type of change

- [ ] Bug fix
- [x] New feature
- [ ] Enhancement
- [ ] Refactor
- [ ] Docs

### Reasoning

A turn ends with the agent holding all the context and the composer holding none, so the user retypes a follow-up the conversation already implies. Paseo proposes the next prompt on the metadata-generation model the user already configures, so no plugin has to shell out to a CLI or read the composer DOM.

### Goals

Six commits, each reviewable alone:

1. `feat(composer)`: next-prompt ghost text and chips after a turn ends. Tab accepts, Enter sends, Escape dismisses; a chip only fills the input. Opening an idle chat requests suggestions (`agent.prompt_suggestions.request`), resuming a closed chat first. Host toggle `agents.promptSuggestions.enabled`.
2. `feat(metadata)`: `agents.metadataGeneration.<kind>.providers` overrides the shared list for one kind.
3. `feat(agent)`: drafted answers as chips inside a free-text question card; never for tool or plan approvals.
4. `feat(composer)`: first-prompt suggestions for an empty chat, from branch, commit subjects and uncommitted paths (names only).
5. `feat(settings)`: a Prompt suggestions model section (Automatic/Manual) under Metadata.
6. `fix(metadata)`: suggestions run only on configured models, never on built-in defaults or the agent's own model.

The feature is opt-in. With both metadata settings on Automatic, no suggestions are generated; the settings hint, the host toggle hint and `public-docs/metadata-generation.md` say so.

### Non-goals

- No tool output, command output, sub-agent logs or attachments in the generation context.
- No suggestions mid-turn or with a non-empty composer.
- No persistence: suggestions live in daemon memory.

### Protocol compatibility

- New wire fields are optional: `server_info.features.promptSuggestions`, the `agent_prompt_suggestions` event, `agent.prompt_suggestions.request/response`, question-form answer tags.
- The daemon sends suggestion events only to clients advertising the `prompt_suggestions` capability, so old clients see nothing new.
- New clients send the request and show the host toggle and model section only when the host advertises `promptSuggestions`; an old daemon gets no request it would reject. The gate is tagged `COMPAT(promptSuggestions)`.

### QA

Live run: dev daemon and Expo web on this branch, a throwaway git repo as the project, Haiku 5.5 picked under Settings → Host → Metadata → Prompt suggestions → Manual.

| Surface | 1280px | 375px |
| --- | --- | --- |
| Settings, nothing picked | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/settings-off-until-model.png" width="420"> | |
| Settings, Manual model | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/settings-manual-model.png" width="420"> | |
| First prompt for an empty chat | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/first-prompt-1280.png" width="420"> | |
| Next prompt after a turn | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/next-prompt-1280.png" width="420"> | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/next-prompt-375.png" width="200"> |
| Drafted answers in a question card | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/drafted-answers-1280.png" width="420"> | <img src="https://raw.githubusercontent.com/hteo1337/paseo/bf968a138b28760d8357d49a5a14f3a6311e9494/drafted-answers-375.png" width="200"> |

The new-chat suggestion appears once the composer has an agent model selected. The two React DOM-prop console warnings seen during the run (`uniProps`, `accessibilityElementsHidden`) come from existing components; this branch adds neither prop.

Static checks on the branch tip: `npm run build:server`, `npm run typecheck`, `npm run lint`, `npm run format:check` all exit 0.

Targeted tests, all passing (run before the last copy-only change, which touched i18n strings and one settings hint key that no test references):

```
server   prompt, service, workspace-context, structured-generation-providers,
         daemon-config-store, persisted-config, persisted-config-json-schema,
         session.prompt-suggestions, git-metadata-generator, session (filtered)
protocol question-form
client   daemon-client, index
app      desktop-keys, ghost-fit, model, push-router, browser-tools-config,
         providers-section, suggestion-model-section, session-store,
         question-form-card, chips, use-prompt-suggestions (browser)
```

Negative control: with the host-feature gate removed, "never asks a host that predates the feature" fails.

NOT YET DONE: iOS and Android native runs; Electron desktop.
