// Run with a checkout root: node handoffs/TH1-2314/baseline-imports.mjs /path/to/baseline
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = process.argv[2];
const require = createRequire(path.join(root, "packages/server/package.json"));
const ts = require("typescript");
const pending = [
  path.join(
    root,
    "packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts",
  ),
];
const seen = new Set();
const imports = new Map();
const workspaceTypeImports = new Set();
function localFile(base, name) {
  const filename = path.resolve(path.dirname(base), name);
  const candidates = [
    filename,
    filename.replace(/\.js$/, ".ts"),
    filename.replace(/\.js$/, ".tsx"),
    filename + ".ts",
    filename + ".tsx",
    path.join(filename, "index.ts"),
    path.join(filename, "index.js"),
  ];
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
}
function resolveWorkspaceFile(file, spec) {
  try {
    return createRequire(file).resolve(spec);
  } catch {
    return null;
  }
}
while (pending.length) {
  const file = pending.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  let source = fs.readFileSync(file, "utf8");
  if (/\.[cm]?tsx?$/.test(file)) {
    const original = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of original.statements) {
      if (
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.startsWith("@getpaseo/")
      )
        workspaceTypeImports.add(statement.moduleSpecifier.text);
    }
  }
  if (/\.[cm]?tsx?$/.test(file))
    source = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
  const ast = ts.createSourceFile(
    file + ".js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const specs = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specs.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.arguments.length &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      specs.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const spec of specs) {
    if (spec.startsWith(".")) {
      const next = localFile(file, spec);
      if (next && /\.[cm]?[jt]sx?$/.test(next)) pending.push(next);
      continue;
    }
    if (!imports.has(spec)) imports.set(spec, new Set());
    imports.get(spec).add(path.relative(root, file));
    if (spec.startsWith("@getpaseo/")) {
      const workspaceFile = resolveWorkspaceFile(file, spec);
      if (workspaceFile) pending.push(workspaceFile);
    }
  }
}
console.log(`checkout=${root}; runtime source/build modules traversed=${seen.size}`);
console.log("Non-relative runtime specifiers (including conditional/dynamic literal imports):");
console.log([...imports.keys()].sort().join("\n"));
console.log(
  "\nWorkspace resolution table (runtime imports plus source type imports; from baseline server package):",
);
let failures = 0;
for (const spec of [
  ...new Set(
    [...imports.keys()]
      .filter((name) => name.startsWith("@getpaseo/"))
      .concat([...workspaceTypeImports]),
  ),
].sort()) {
  try {
    const resolved = fs.realpathSync(require.resolve(spec));
    const local = resolved.startsWith(root + path.sep);
    console.log(`${spec}\t${resolved}\t${local ? "LOCAL" : "CONTAMINATED"}`);
    if (!local) failures++;
  } catch (error) {
    console.log(`${spec}\tUNRESOLVED ${error.code}`);
    failures++;
  }
}
console.log(`workspace resolution failures=${failures}`);
if (failures) process.exitCode = 1;
