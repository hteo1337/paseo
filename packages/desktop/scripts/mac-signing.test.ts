import { afterEach, expect, test } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
const { assertMacSigningTeam } = createRequire(import.meta.url)("./mac-signing.js");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("signing validation covers every slice and protection while allowing separately signed standalone tools", () => {
  const root = mkdtempSync(join(tmpdir(), "paseo-signing-"));
  roots.push(root);
  const app = join(root, "Paseo.app");
  const binaries = [
    "Contents/MacOS/Paseo",
    "Contents/Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper",
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework",
    "Contents/Resources/addon.node",
    "Contents/Resources/vendor-tool",
  ];
  for (const binary of binaries) {
    const file = join(app, binary);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
  }
  symlinkSync(
    "Versions/A/Electron Framework",
    join(app, "Contents/Frameworks/Electron Framework.framework/Electron Framework"),
  );
  let flavor = "valid";
  const metadataFor = (file: string, arch: string) => {
    const framework = file.includes("Electron Framework");
    const addon = file.endsWith("addon.node");
    const tool = file.endsWith("vendor-tool");
    let team = "VALIDTEAM1";
    if (tool) team = "VENDORTEAM";
    if (flavor === "adhoc" && arch === "arm64") team = "not set";
    else if (flavor === "mismatch" && framework && arch === "arm64") team = "OTHERTEAM1";
    let flags = "0x10000(runtime)";
    if (flavor === "adhoc" && arch === "arm64") flags = "0x10002(adhoc,runtime)";
    else if (flavor === "no-runtime" && arch === "arm64") flags = "0x0(none)";
    let platform = "";
    if (addon && ["apple-platform", "forged-platform"].includes(flavor)) {
      team = "not set";
      flags = "0x0(none)";
      platform = "Platform identifier=26\n";
    }
    return {
      status: 0,
      stdout: "",
      stderr: `TeamIdentifier=${team}\nCodeDirectory flags=${flags}\n${platform}`,
    };
  };
  const run = (command: string, args: string[]) => {
    const file = args.at(-1)!;
    const framework = file.includes("Electron Framework");
    const addon = file.endsWith("addon.node");
    const arch = args[args.indexOf("--arch") + 1];
    if (command === "/usr/bin/lipo")
      return {
        status: 0,
        stdout: flavor === "missing-arch" && framework ? "arm64" : "x86_64 arm64",
        stderr: "",
      };
    if (command === "/usr/bin/otool") {
      let type = "EXECUTE";
      if (framework) type = "DYLIB";
      else if (addon) type = "BUNDLE";
      return { status: 0, stdout: `magic filetype\nMH_MAGIC_64 ${type}`, stderr: "" };
    }
    if (command === "/usr/bin/plutil")
      return {
        status: 0,
        stdout: JSON.stringify({
          "com.apple.security.cs.disable-library-validation": flavor === "disable-validation",
        }),
        stderr: "",
      };
    if (args.includes("=anchor apple"))
      return { status: flavor === "apple-platform" ? 0 : 1, stdout: "", stderr: "" };
    if (args[0] === "--verify") return { status: 0, stdout: "", stderr: "" };
    if (args.includes("--entitlements"))
      return {
        status: 0,
        stdout: flavor === "invalid-entitlements" ? "" : "<plist/>",
        stderr:
          flavor === "invalid-entitlements"
            ? "binary contains an invalid entitlements blob. OS will ignore these entitlements"
            : "",
      };
    return metadataFor(file, arch);
  };
  expect(assertMacSigningTeam(app, run)).toEqual({
    teamIdentifier: "VALIDTEAM1",
    checkedBinaries: 4,
    checkedSlices: 8,
  });
  for (const [mode, error] of [
    ["adhoc", /real macOS signing identity/],
    ["mismatch", /team mismatch/],
    ["no-runtime", /Hardened runtime/],
    ["disable-validation", /Library validation must remain enabled/],
    ["invalid-entitlements", /Invalid signed entitlements/],
    ["missing-arch", /framework lacks a required architecture/],
    ["forged-platform", /real macOS signing identity/],
  ] as const) {
    flavor = mode;
    expect(() => assertMacSigningTeam(app, run)).toThrow(error);
  }
  flavor = "apple-platform";
  expect(assertMacSigningTeam(app, run).checkedSlices).toBe(8);
});
