const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MACH_O_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
]);

function bundleBinaries(root) {
  const binaries = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    // Framework aliases are symlinks. Inspect real versions once; never follow paths outside the bundle.
    if (entry.isDirectory()) binaries.push(...bundleBinaries(file));
    else if (entry.isFile()) {
      const fd = fs.openSync(file, "r");
      try {
        const magic = Buffer.alloc(4);
        if (fs.readSync(fd, magic, 0, 4, 0) === 4 && MACH_O_MAGICS.has(magic.readUInt32BE()))
          binaries.push(file);
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  return binaries;
}

function createInspector(run) {
  return (command, args, options = {}) => {
    const result = run(command, args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      ...options,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `macOS signing validation failed: ${result.error?.message || result.stderr || result.stdout}`,
      );
    return result;
  };
}

function architectures(binary, inspect) {
  const output = inspect("/usr/bin/lipo", ["-archs", binary]).stdout.trim();
  const arches = output ? output.split(/\s+/) : [];
  if (
    !arches.length ||
    arches.length > 16 ||
    new Set(arches).size !== arches.length ||
    arches.some((arch) => !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(arch))
  )
    throw new Error(`Invalid Mach-O architecture metadata for ${binary}`);
  return arches;
}

function fileType(binary, arch, inspect) {
  const lines = inspect("/usr/bin/otool", ["-hv", "-arch", arch, binary]).stdout.split(/\r?\n/);
  const header = lines.findIndex((line) => line.trim().split(/\s+/).includes("filetype"));
  const column = lines[header]?.trim().split(/\s+/).indexOf("filetype");
  const type = lines[header + 1]?.trim().split(/\s+/)[column];
  if (
    ![
      "EXECUTE",
      "DYLIB",
      "BUNDLE",
      "OBJECT",
      "DSYM",
      "DYLIB_STUB",
      "PRELOAD",
      "CORE",
      "DYLINKER",
    ].includes(type)
  )
    throw new Error(`Invalid Mach-O file type metadata for ${binary} (${arch})`);
  return type;
}

function assertPrincipalProtection(binary, arch, metadata, inspect) {
  const flags = metadata.match(/flags=0x([0-9a-f]+)/i)?.[1];
  if (!flags || !(parseInt(flags, 16) & 0x10000))
    throw new Error(`Hardened runtime is required for ${binary} (${arch})`);
  const extracted = inspect("/usr/bin/codesign", [
    "--display",
    "--entitlements",
    "-",
    "--xml",
    "--arch",
    arch,
    binary,
  ]);
  if (
    /invalid.*entitlements|entitlements.*invalid|unrecognized.*blob/i.test(extracted.stderr || "")
  )
    throw new Error(`Invalid signed entitlements for ${binary} (${arch})`);
  if (!extracted.stdout.trim()) return;
  const parsed = inspect("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], {
    input: extracted.stdout,
  }).stdout;
  const entitlements = JSON.parse(parsed);
  if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements))
    throw new Error(`Invalid signed entitlements for ${binary} (${arch})`);
  const exception = "com.apple.security.cs.disable-library-validation";
  if (Object.hasOwn(entitlements, exception) && entitlements[exception] !== false)
    throw new Error(`Library validation must remain enabled for ${binary} (${arch})`);
}

function isVerifiedApplePlatformLibrary(binary, arch, metadata, run) {
  if (!/^Platform identifier=[1-9]\d*$/m.test(metadata)) return false;
  // The label is signer-controlled. Exempt only if the OS also authenticates Apple's signing anchor for this slice.
  const result = run(
    "/usr/bin/codesign",
    ["--verify", "--strict", "--arch", arch, "--test-requirement", "=anchor apple", binary],
    { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  return !result.error && result.status === 0;
}

function assertSigningTeam(binary, arch, metadata, expectedTeam, platformLibrary) {
  const team = metadata.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim();
  if (platformLibrary) return expectedTeam;
  if (!team || team === "not set" || /flags=0x[0-9a-f]+\([^)]*adhoc/i.test(metadata))
    throw new Error(
      `A real macOS signing identity is required; ad-hoc or missing team for ${binary} (${arch})`,
    );
  if (expectedTeam && team !== expectedTeam)
    throw new Error(`macOS signing team mismatch for ${binary} (${arch})`);
  return team;
}

function validateSlice({ binary, arch, principal, requiredType, expectedTeam }, inspect, run) {
  const type = fileType(binary, arch, inspect);
  if ((requiredType && requiredType !== type) || (principal && type !== "EXECUTE"))
    throw new Error(`Unexpected Mach-O file type for ${binary} (${arch})`);
  // Standalone tools execute in their own process and can retain their own signing team.
  if (!principal && type !== "DYLIB" && type !== "BUNDLE") return null;
  const signed = inspect("/usr/bin/codesign", ["--display", "--verbose=4", "--arch", arch, binary]);
  const metadata = `${signed.stdout || ""}\n${signed.stderr || ""}`;
  const platformLibrary =
    !principal && !requiredType && isVerifiedApplePlatformLibrary(binary, arch, metadata, run);
  const team = assertSigningTeam(binary, arch, metadata, expectedTeam, platformLibrary);
  if (principal) assertPrincipalProtection(binary, arch, metadata, inspect);
  return expectedTeam || team;
}

/** Verify final artifact metadata without launching it or accessing signing keys. */
function assertMacSigningTeam(appPath, run = spawnSync) {
  const inspect = createInspector(run);
  inspect("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
  const root = fs.realpathSync(appPath);
  const main = path.join(root, "Contents", "MacOS", "Paseo");
  const required = new Map(
    [
      ["Contents/MacOS/Paseo", "EXECUTE"],
      ["Contents/Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper", "EXECUTE"],
      ["Contents/Frameworks/Electron Framework.framework/Electron Framework", "DYLIB"],
    ].map(([relative, type]) => [fs.realpathSync(path.join(root, relative)), type]),
  );
  const binaries = bundleBinaries(root);
  for (const file of required.keys()) {
    if (!file.startsWith(`${root}${path.sep}`) || !binaries.includes(file))
      throw new Error(`Required bundled Mach-O executable is missing or external: ${file}`);
  }
  let expectedTeam;
  let checkedBinaries = 0;
  let checkedSlices = 0;
  const principalArchitectures = new Map();
  let frameworkArchitectures;
  for (const binary of [main, ...binaries.filter((file) => file !== main)]) {
    const relative = path.relative(root, binary);
    const principal =
      binary === main ||
      /^Contents\/Frameworks\/Paseo Helper(?: \([^)]+\))?\.app\/Contents\/MacOS\/[^/]+$/.test(
        relative,
      );
    const arches = architectures(binary, inspect);
    if (principal) principalArchitectures.set(binary, arches);
    if (required.get(binary) === "DYLIB") frameworkArchitectures = new Set(arches);
    let checked = false;
    for (const arch of arches) {
      const team = validateSlice(
        { binary, arch, principal, requiredType: required.get(binary), expectedTeam },
        inspect,
        run,
      );
      if (team === null) continue;
      expectedTeam = team;
      checked = true;
      checkedSlices++;
    }
    if (checked) checkedBinaries++;
  }
  for (const [binary, arches] of principalArchitectures) {
    if (arches.some((arch) => !frameworkArchitectures?.has(arch)))
      throw new Error(`Electron framework lacks a required architecture for ${binary}`);
  }
  return { teamIdentifier: expectedTeam, checkedBinaries, checkedSlices };
}

module.exports = { assertMacSigningTeam };

if (require.main === module) {
  if (process.platform !== "darwin" || process.argv.length !== 3)
    throw new Error("Usage on macOS: node mac-signing.js <Paseo.app>");
  console.log(JSON.stringify(assertMacSigningTeam(process.argv[2])));
}
