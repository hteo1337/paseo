import path from "node:path";
import original from "../../packages/app/playwright.config";

export default {
  ...original,
  testDir: __dirname,
  testMatch: "adversarial.spec.ts",
  globalSetup: path.resolve(__dirname, "../../packages/app/e2e/support/global-setup.ts"),
  outputDir: path.resolve(__dirname, "adversarial-results"),
  workers: 1,
  retries: 0,
  use: { ...original.use, headless: true, video: "off", trace: "off" },
};
