import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ServerInfoStatusPayload } from "@getpaseo/protocol/messages";

const LocalBuildMarkerSchema = z.object({
  localBuild: z.literal(true),
  baseTag: z.string(),
  seriesHash: z.string().regex(/^[0-9a-f]{16}$/),
  head: z.string().regex(/^[0-9a-f]{40}$/),
});

export function readLocalBuildIdentity(version: string): ServerInfoStatusPayload["buildIdentity"] {
  const processResourcesPath = "resourcesPath" in process ? process.resourcesPath : undefined;
  let resourcesPath: string;
  if (typeof processResourcesPath === "string" && processResourcesPath) {
    resourcesPath = processResourcesPath;
  } else {
    let directory = dirname(fileURLToPath(import.meta.url));
    while (basename(directory) !== "app.asar" && basename(directory) !== "app.asar.unpacked") {
      const parent = dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
    resourcesPath = dirname(directory);
  }
  try {
    const marker = LocalBuildMarkerSchema.safeParse(
      JSON.parse(readFileSync(join(resourcesPath, "local-build.json"), "utf8")),
    );
    if (!marker.success || marker.data.baseTag !== `v${version}`) return undefined;
    return {
      version: marker.data.baseTag.slice(1),
      seriesHash: marker.data.seriesHash,
      sourceHead: marker.data.head,
    };
  } catch {
    return undefined;
  }
}
