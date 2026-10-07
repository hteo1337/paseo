const path = require("node:path");

const { smokePackagedDesktopApp } = require("../e2e/packaged-app-smoke.js");
const { assertMacSigningTeam } = require("./mac-signing");

const EXECUTABLE_NAME = "Paseo";

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  assertMacSigningTeam(path.join(context.appOutDir, `${EXECUTABLE_NAME}.app`));
  if (process.env.PASEO_DESKTOP_SMOKE !== "1") return;

  await smokePackagedDesktopApp({
    appPath: path.join(context.appOutDir, `${EXECUTABLE_NAME}.app`),
  });
};
