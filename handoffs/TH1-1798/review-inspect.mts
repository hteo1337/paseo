// In a separate checkout at 95cee63a8: git show d6fa23189:packages/protocol/src/messages.ts > packages/protocol/src/review-base-messages.ts
// Run from repository root: npx tsx handoffs/TH1-1798/review-inspect.mts
import { SessionInboundMessageSchema as baseSchema } from "../../packages/protocol/src/review-base-messages.ts";
import { SessionInboundMessageSchema as headSchema } from "../../packages/protocol/src/messages.ts";
import { readFileSync } from "node:fs";
const context = readFileSync("packages/app/src/contexts/session-context.tsx", "utf8");
const list = context.match(/const feeds = client.observeEvents\(\s*\[([\s\S]*?)\]/)![1];
const events = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const request = {
  type: "session.events.set_subscription.request",
  requestId: "review",
  events,
  notifications: true,
};
const before = baseSchema.safeParse({
  ...request,
  events: events.filter((e) => e !== "agent_prompt_suggestions"),
});
const after = baseSchema.safeParse(request);
console.log(
  JSON.stringify(
    {
      base: "d6fa23189",
      actualAppEvents: events,
      controlWithoutNewEvent: before.success,
      withNewEvent: after.success,
      headAccepts: headSchema.safeParse(request).success,
      issues: after.success ? [] : after.error.issues.map((i) => ({ path: i.path, code: i.code })),
    },
    null,
    2,
  ),
);
const locales = ["en", "ar", "es", "fr", "ja", "ko", "pt-BR", "ru", "zh-CN"];
function flatten(obj: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "string" ? [[prefix + k, v]] : Object.entries(flatten(v, prefix + k + ".")),
    ),
  );
}
const resources = [];
for (const locale of locales) {
  const module = await import("../../packages/app/src/i18n/resources/" + locale + ".ts");
  resources.push({ locale, strings: flatten(Object.values(module)[0] as object) });
}
// New key paths are discovered from the resource itself to avoid guessing nested ownership.
const actualKeys = Object.keys(resources[0].strings).filter(
  (k) =>
    k.includes("promptSuggestions") ||
    k.includes("suggestionSection") ||
    k.includes("suggestionSharedHint") ||
    k.includes("suggestionCustomHint") ||
    k.includes("suggestionModelHint"),
);
for (const { locale, strings } of resources) {
  console.log(
    JSON.stringify({
      locale,
      newKeys: actualKeys.length,
      missing: actualKeys.filter((k) => !strings[k]),
      badPlaceholders: actualKeys.filter(
        (k) =>
          JSON.stringify((strings[k]?.match(/{{[^}]+}}/g) || []).sort()) !==
          JSON.stringify((resources[0].strings[k].match(/{{[^}]+}}/g) || []).sort()),
      ),
    }),
  );
}
