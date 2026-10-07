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
    "Contents/Frameworks/Paseo Helper (GPU).app/Contents/MacOS/Paseo Helper (GPU)",
    "Contents/Frameworks/Paseo Helper (Renderer).app/Contents/MacOS/Paseo Helper (Renderer)",
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
      if (!args.includes("-m") && file.endsWith(" (GPU)"))
        return { status: 1, stdout: "", stderr: "archive(member) filename misinterpretation" };
      if (flavor === "failed-header")
        return { status: 1, stdout: "", stderr: "header command failed" };
      if (flavor === "timeout-header")
        return { status: null, error: Error("header command timed out"), stdout: "", stderr: "" };
      const header = "magic cputype cpusubtype caps filetype ncmds sizeofcmds flags";
      const row = `MH_MAGIC_64 ARM64 ALL 0x00 ${type} 18 2296 NOUNDEFS DYLDLINK`;
      const outputs: Record<string, string> = {
        "empty-header": "",
        "missing-header": `EXECUTE filetype\n${row}`,
        "truncated-header": `${header}\nMH_MAGIC_64 ARM64`,
        "duplicate-header": `${header}\n${row}\n${header}\n${row}`,
        "invalid-magic": `${header}\nNOT_MACHO ARM64 ALL 0x00 EXECUTE 18 2296 FLAGS`,
        "invalid-size": `${header}\nMH_MAGIC_64 ARM64 ALL 0x00 EXECUTE nope 2296 FLAGS`,
        "unknown-type": `${header}\nMH_MAGIC_64 ARM64 ALL 0x00 UNKNOWN 18 2296 FLAGS`,
      };
      return {
        status: 0,
        stdout: outputs[flavor] ?? `${file}:\nMach header\n${header}\n${row}`,
        stderr: "",
      };
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
    checkedBinaries: 6,
    checkedSlices: 12,
  });
  for (const [mode, error] of [
    ["empty-header", /Invalid Mach-O header/],
    ["missing-header", /Invalid Mach-O header/],
    ["truncated-header", /Invalid Mach-O header/],
    ["duplicate-header", /Invalid Mach-O header/],
    ["invalid-magic", /Invalid Mach-O header/],
    ["invalid-size", /Invalid Mach-O header/],
    ["unknown-type", /Invalid Mach-O file type/],
    ["failed-header", /header command failed/],
    ["timeout-header", /header command timed out/],
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
  expect(assertMacSigningTeam(app, run).checkedSlices).toBe(12);
});
