import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
if (process.platform !== "darwin") throw Error("Owner Unix credentials build requires macOS");
const include =
  process.env.NODE_INCLUDE_DIR || resolve(dirname(process.execPath), "../include/node");
if (!existsSync(resolve(include, "node_api.h")))
  throw Error("Set NODE_INCLUDE_DIR to the matching Node N-API headers");
const output = resolve("src/server/native/peer-credentials.node");
execFileSync(
  "/usr/bin/clang",
  [
    "-Wall",
    "-Wextra",
    "-Werror",
    "-shared",
    "-fPIC",
    "-undefined",
    "dynamic_lookup",
    "-I",
    include,
    "src/server/native/peer-credentials.c",
    "-o",
    output,
  ],
  { stdio: "inherit" },
);
mkdirSync("dist/server/server/native", { recursive: true });
copyFileSync(output, "dist/server/server/native/peer-credentials.node");
