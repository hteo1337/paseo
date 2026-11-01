import { mergeConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import upstream from "../../packages/server/vitest.config.js";

export default mergeConfig(upstream, {
  resolve: {
    alias: [
      {
        find: /^@getpaseo\/relay$/,
        replacement: fileURLToPath(new URL("../../packages/relay/src/index.ts", import.meta.url)),
      },
      {
        find: /^@getpaseo\/client\/internal\/(.*)$/,
        replacement: fileURLToPath(new URL("../../packages/client/src/", import.meta.url)) + "$1",
      },
      {
        find: "@getpaseo/client/node",
        replacement: fileURLToPath(
          new URL("../../packages/client/src/node/index.ts", import.meta.url),
        ),
      },
      {
        find: "@getpaseo/client",
        replacement: fileURLToPath(new URL("../../packages/client/src/index.ts", import.meta.url)),
      },
      {
        find: /^@getpaseo\/plugin\/(.*)$/,
        replacement: fileURLToPath(new URL("../../packages/plugin/src/", import.meta.url)) + "$1",
      },
      {
        find: "@getpaseo/highlight",
        replacement: fileURLToPath(
          new URL("../../packages/highlight/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@getpaseo\/protocol\/(.*)$/,
        replacement: fileURLToPath(new URL("../../packages/protocol/src/", import.meta.url)) + "$1",
      },
      {
        find: /^@getpaseo\/relay\/(.*)$/,
        replacement: fileURLToPath(new URL("../../packages/relay/src/", import.meta.url)) + "$1",
      },
    ],
  },
});
