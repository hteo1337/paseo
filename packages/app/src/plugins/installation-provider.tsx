import { QueryClientProvider } from "@tanstack/react-query";
import {
  PaseoApiProvider,
  PluginRpcProvider,
  PluginTranslationProvider,
} from "@getpaseo/plugin/client/host";
import React, { type ReactNode } from "react";
import type { PluginRpcInvocationScope } from "@getpaseo/protocol/messages";
import type { InstalledPlugin } from "./types";

/** Every plugin surface renders under its installation: one query cache, one Paseo client, RPCs. */
export function PluginInstallationProvider({
  plugin,
  children,
  scope,
}: {
  plugin: InstalledPlugin;
  children: ReactNode;
  scope?: PluginRpcInvocationScope;
}) {
  const invoke = React.useCallback(
    (method: string, input: unknown) => plugin.invoke(method, input, scope),
    [plugin, scope],
  );
  return (
    <QueryClientProvider client={plugin.queryClient}>
      <PaseoApiProvider paseo={plugin.paseo}>
        <PluginRpcProvider invoke={invoke}>
          <PluginTranslationProvider runtime={plugin.i18n}>{children}</PluginTranslationProvider>
        </PluginRpcProvider>
      </PaseoApiProvider>
    </QueryClientProvider>
  );
}
