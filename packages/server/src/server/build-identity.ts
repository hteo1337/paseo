import { readFileSync, realpathSync } from "node:fs";
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
  try {
    let directory = dirname(realpathSync(fileURLToPath(import.meta.url)));
    while (basename(directory) !== "app.asar" && basename(directory) !== "app.asar.unpacked") {
      const parent = dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
    const moduleResourcesPath = dirname(directory);
    const processResourcesPath = "resourcesPath" in process ? process.resourcesPath : undefined;
    const resourcesPath =
      typeof processResourcesPath === "string" && processResourcesPath
        ? processResourcesPath
        : moduleResourcesPath;
    const canonicalResourcesPath = realpathSync(resourcesPath);
    if (
      canonicalResourcesPath !== moduleResourcesPath ||
      canonicalResourcesPath !== join(realpathSync(dirname(resourcesPath)), "Resources") ||
      basename(dirname(canonicalResourcesPath)) !== "Contents" ||
      !basename(dirname(dirname(canonicalResourcesPath))).endsWith(".app")
    ) {
      return undefined;
    }
    const marker = LocalBuildMarkerSchema.safeParse(
      JSON.parse(readFileSync(join(canonicalResourcesPath, "local-build.json"), "utf8")),
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
