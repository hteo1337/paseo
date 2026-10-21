import type { ProviderCatalog, ProviderLaunch } from "@getpaseo/plugin/server/provider";
import type { z } from "zod";
import { createHash } from "node:crypto";
import { freshKey, type Hosts } from "./hosts.js";
import { catalogSchema, effortSchema } from "./wire.js";

export const modes = [
  { id: "onRequest", label: "Default", icon: "ShieldCheck", colorTier: "safe" },
  { id: "promptUnmatched", label: "Ask", icon: "ShieldAlert", colorTier: "moderate" },
  { id: "denyUnmatched", label: "Strict", icon: "ShieldCheck", colorTier: "safe" },
  {
    id: "allowAll",
    label: "Full access",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  },
];
export const efforts = effortSchema.options.filter((effort) => effort !== "none");

export function launchKey(launch: ProviderLaunch): string {
  // Hash values so credential-dependent cache identity never exposes credentials.
  const routingKeys = Object.keys(launch.env)
    .filter((key) => /^(META_|MUSE_|XDG_|HOME$|PATH$|HTTP_PROXY$|HTTPS_PROXY$|NO_PROXY$)/.test(key))
    .sort();
  const environment = routingKeys.map((key) => [key, launch.env[key]]);
  return createHash("sha256")
    .update(JSON.stringify([launch.command, launch.args, environment]))
    .digest("hex");
}

export class Catalog {
  private readonly cache = new Map<string, { expires: number; catalog: ProviderCatalog }>();
  private readonly reads = new Set<Promise<unknown>>();
  private readonly cancel = new AbortController();
  constructor(private readonly hosts: Hosts) {}
  async read(launch: ProviderLaunch): Promise<ProviderCatalog> {
    if (this.cancel.signal.aborted) throw new Error("Muse catalogue is closed");
    const key = await freshKey(launch);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.catalog;
    const read = this.hosts.use(
      launch,
      (host) => host.request("model/list", {}, catalogSchema, 5000),
      { signal: this.cancel.signal },
    );
    this.reads.add(read);
    try {
      const catalog = presentCatalog(await read);
      if (!this.cancel.signal.aborted) {
        if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: Date.now() + 60000, catalog });
      }
      return catalog;
    } finally {
      this.reads.delete(read);
    }
  }
  async close(): Promise<void> {
    this.cancel.abort();
    this.cache.clear();
    await Promise.allSettled(this.reads);
  }
}

export function presentCatalog(response: z.infer<typeof catalogSchema>): ProviderCatalog {
  const models = response.models.map((model) => {
    const supported = model.variants.length > 0 ? model.variants : efforts;
    return {
      id: model.modelId,
      label: model.displayLabel,
      isDefault: model.isDefault,
      contextWindowMaxTokens: model.contextLimit ?? undefined,
      thinkingOptions: supported.map((id) => ({
        id,
        label: id,
        isDefault: id === model.defaultReasoningEffort,
      })),
      defaultThinkingOptionId: model.defaultReasoningEffort ?? undefined,
      metadata: { providerId: model.providerId },
    };
  });
  const defaultModel = models.find((model) => model.isDefault);
  return {
    models,
    modes,
    defaultMode: "onRequest",
    defaultModel: defaultModel?.id,
  };
}
