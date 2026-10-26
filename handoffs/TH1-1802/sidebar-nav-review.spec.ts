import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import {
  openMobileAgentSidebar,
  expectMobileAgentSidebarVisible,
} from "../support/helpers/sidebar";

test("review probe: resize stylesheet growth and compact header", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1200, height: 800 });
  await gotoAppShell(page);
  const group = page.locator('[data-testid="sidebar-nav-group"]:visible').first();
  const header = group.getByRole("button", { name: "Navigation", exact: true });
  const rows = group.getByTestId("sidebar-nav-group-rows");
  const divider = group.getByRole("separator", { name: "Resize navigation" });
  await expect(header).toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
  await header.focus();
  await page.keyboard.press("Space");
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(rows).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(rows).toBeVisible();
  const height = async () => (await rows.boundingBox())!.height;
  const registry = () =>
    page.evaluate(() => {
      const style = document.getElementById("unistyles-web") as HTMLStyleElement | null;
      const text = style?.textContent ?? "";
      return { bytes: text.length, rules: style?.sheet?.cssRules.length ?? 0 };
    });
  const box = (await divider.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  const beforeHeight = await height();
  const beforeControl = await registry();
  await page.mouse.move(x, y + 120, { steps: 80 });
  await page.mouse.move(x, y);
  const afterControl = await registry();
  const controlHeight = await height();
  await page.mouse.down();
  for (let offset = 1; offset <= 120; offset += 1) {
    await page.mouse.move(x, y + offset);
  }
  await page.mouse.up();
  await expect.poll(height).toBeGreaterThan(beforeHeight);
  const afterDrag = await registry();
  const draggedHeight = await height();
  const dividerAccessibility = await divider.evaluate((element) => ({
    role: element.getAttribute("role"),
    tabindex: element.getAttribute("tabindex"),
    value: element.getAttribute("aria-valuenow"),
    orientation: element.getAttribute("aria-orientation"),
  }));
  await page.reload();
  await expect.poll(height).toBeCloseTo(draggedHeight, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await openMobileAgentSidebar(page);
  await expectMobileAgentSidebarVisible(page);
  const compactHeader = page.getByTestId("sidebar-nav-group-header").last();
  const compactRows = page.getByTestId("sidebar-nav-group-rows").last();
  const close = page.getByTestId("sidebar-close");
  await expect(close).toBeInViewport({ ratio: 1 });
  const compact = {
    header: await compactHeader.boundingBox(),
    close: await close.boundingBox(),
    firstRow: await page.getByTestId("sidebar-global-new-workspace").last().boundingBox(),
  };
  await compactHeader.click();
  await expect(compactRows).toHaveCount(0);
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.click();
  const evidence = {
    beforeHeight,
    controlHeight,
    draggedHeight,
    beforeControl,
    afterControl,
    afterDrag,
    dividerAccessibility,
    compact,
  };
  console.log("REVIEW_EVIDENCE", JSON.stringify(evidence));
  await testInfo.attach("review-evidence", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  expect(controlHeight).toBe(beforeHeight);
  expect(
    afterDrag.rules - afterControl.rules,
    "dragging should not retain per-pixel CSS rules",
  ).toBeLessThan(10);
});
