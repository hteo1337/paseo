// Exact-head source/schema inspection only; no UI/browser execution.
// First: git show d6fa23189:packages/protocol/src/messages.ts > packages/protocol/src/review-base-messages.ts
// Run: npx tsx handoffs/TH1-1798/confirmation-inspect.mts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SessionEventsSetSubscriptionRequestSchema as base } from "../../packages/protocol/src/review-base-messages.ts";
const context = readFileSync("packages/app/src/contexts/session-context.tsx", "utf8");
const list = context.match(/const feeds = client.observeEvents\(\s*\[([\s\S]*?)\]/)![1];
const events = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const request = {
  type: "session.events.set_subscription.request",
  requestId: "review",
  events,
  notifications: true,
};
assert(!events.includes("agent_prompt_suggestions"));
const actualSharedAccepted = base.safeParse(request).success;
const unsafeControlAccepted = base.safeParse({
  ...request,
  events: [...events, "agent_prompt_suggestions"],
}).success;
assert(actualSharedAccepted);
assert(!unsafeControlAccepted);
assert(context.includes('useHostFeature(serverId, "promptSuggestions")'));
assert(
  /COMPAT\(promptSuggestions\)[\s\S]*?if \(!supportsPromptSuggestions\) return;\s*const feed = client.observeEvents\(\["agent_prompt_suggestions"\]\)/.test(
    context,
  ),
);
assert(context.includes("[client, serverId, supportsPromptSuggestions]"));
console.log(
  JSON.stringify(
    {
      base: "d6fa23189",
      events,
      actualSharedAccepted,
      unsafeControlAccepted,
      separateCompatGatedFeed: true,
    },
    null,
    2,
  ),
);
const section = readFileSync(
  "packages/app/src/screens/settings/suggestion-model-section.tsx",
  "utf8",
);
assert(/catch \(error\)[\s\S]*?setSaveError\(/.test(section));
assert(
  /\{saveError \? \(\s*<Text\s+style=\{settingsStyles.rowError\}\s+accessibilityRole="alert"/.test(
    section,
  ),
);
assert(!/Alert\.alert\(/.test(section));
console.log(
  "Source confirmed: save failure sets rendered rowError with accessibilityRole=alert; no Alert.alert call. No browser execution claimed.",
);
