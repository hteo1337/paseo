import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createMuseProvider } from "./server/provider.js";

import { Hosts } from "./server/hosts.js";
import { Usage } from "./server/usage.js";

export default function contribute(
  server: Pick<PluginServerContext, "registerProvider" | "registerUsageSource">,
) {
  const hosts = new Hosts();
  const usage = new Usage(hosts);
  server.registerUsageSource(usage.registration());
  server.registerProvider(createMuseProvider(usage, hosts));
  return () => hosts.close();
}
