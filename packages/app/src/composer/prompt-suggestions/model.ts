import type { PromptSuggestion } from "@getpaseo/protocol/messages";

export interface PromptSuggestionViewInput {
  suggestions: readonly PromptSuggestion[] | undefined;
  turnSeq: number | undefined;
  generatedAt: string | undefined;
  lastActivityAt: Date | undefined;
  hasText: boolean;
  isAgentRunning: boolean;
  isReadOnly: boolean;
  dismissedTurnSeq: number | null;
}

export interface PromptSuggestionView {
  ghost: PromptSuggestion | null;
  chips: PromptSuggestion[];
}

const EMPTY_VIEW: PromptSuggestionView = { ghost: null, chips: [] };

// A suggestion is an offer: it occupies only space the user is not using, so a
// draft, a running turn or a dismissal for this turn hides it.
export function resolvePromptSuggestionView(
  input: PromptSuggestionViewInput,
): PromptSuggestionView {
  if (!input.suggestions || input.suggestions.length === 0 || input.turnSeq === undefined) {
    return EMPTY_VIEW;
  }
  if (input.hasText || input.isAgentRunning || input.isReadOnly) {
    return EMPTY_VIEW;
  }
  if (input.dismissedTurnSeq !== null && input.dismissedTurnSeq >= input.turnSeq) {
    return EMPTY_VIEW;
  }
  // The daemon generates after a turn ends, so activity newer than the payload
  // means a turn has run since — including turns this composer never saw.
  if (isStale(input.generatedAt, input.lastActivityAt)) {
    return EMPTY_VIEW;
  }
  const [first, ...rest] = input.suggestions;
  return { ghost: first, chips: rest };
}

function isStale(generatedAt: string | undefined, lastActivityAt: Date | undefined): boolean {
  if (!generatedAt || !lastActivityAt) return false;
  const generated = Date.parse(generatedAt);
  return Number.isFinite(generated) && lastActivityAt.getTime() > generated;
}
