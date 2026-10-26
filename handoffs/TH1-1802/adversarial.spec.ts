import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../../packages/app/e2e/support/fixtures";
import { gotoAppShell } from "../../packages/app/e2e/support/helpers/app";
import {
  navigationGroupHeight,
  expectNavigationGroupShowsItems,
  expectLastNavigationItemReachable,
  touchDragNavigationDivider,
} from "../../packages/app/e2e/support/helpers/sidebar-nav-group";
import { openCompactSidebar } from "../../packages/app/e2e/support/helpers/usage-sidebar-item";

test.use({ viewport: { width: 1200, height: 800 }, isMobile: true, hasTouch: true });

test("adversarial cancellation, restore, caps, folded close and empty navigation", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const evidence: Record<string, unknown> = {};
  const rows = page.getByTestId("sidebar-nav-group-rows");
  const header = page.getByRole("button", { name: "Navigation", exact: true });
  const divider = page.getByRole("separator", { name: "Resize navigation" });
  const persistedHeight = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem("panel-state");
      return raw ? (JSON.parse(raw).state.sidebarNavHeight ?? null) : null;
    });
  const settle = () =>
    page.evaluate(async () => {
      await new Promise<number>(requestAnimationFrame);
      await new Promise<number>(requestAnimationFrame);
    });
  const touchCancel = async (offset: number) => {
    const box = await divider.boundingBox();
    expect(box).not.toBeNull();
    const touchX = box!.x + box!.width / 2;
    const touchY = box!.y + box!.height / 2;
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: touchX, y: touchY }],
      });
      for (let step = 1; step <= 10; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: touchX, y: touchY + (offset * step) / 10 }],
        });
      }
      await settle();
      const preview = await navigationGroupHeight(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await settle();
      return {
        preview,
        afterCancel: await navigationGroupHeight(page),
        stored: await persistedHeight(),
      };
    } finally {
      await cdp.detach();
    }
  };
  try {
    await gotoAppShell(page);
    await expectNavigationGroupShowsItems(page);
    evidence.media = await page.evaluate(() => ({
      fine: matchMedia("(pointer: fine)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
    }));
    const initial = await navigationGroupHeight(page);
    const cancelControl = await touchCancel(0);
    expect(cancelControl.afterCancel).toBeCloseTo(initial, 0);
    const cancelTreatment = await touchCancel(80);
    expect(cancelTreatment.preview).toBeGreaterThan(initial + 50);
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "true");
    const afterFold = await navigationGroupHeight(page);
    await page.reload();
    await expectNavigationGroupShowsItems(page);
    const afterReload = await navigationGroupHeight(page);
    evidence.cancellation = { initial, cancelControl, cancelTreatment, afterFold, afterReload };

    await touchDragNavigationDivider(page, 80);
    await expect.poll(persistedHeight).not.toBeNull();
    const committed = await navigationGroupHeight(page);
    await page.reload();
    await expectNavigationGroupShowsItems(page);
    expect(await navigationGroupHeight(page)).toBeCloseTo(committed, 0);
    evidence.normalTouch = { committed, stored: await persistedHeight() };

    await touchDragNavigationDivider(page, -1000);
    const minimum = await navigationGroupHeight(page);
    await expectLastNavigationItemReachable(page);
    await touchDragNavigationDivider(page, 1000);
    const maximum = await navigationGroupHeight(page);
    expect(maximum).toBeLessThanOrEqual(400);
    await page.setViewportSize({ width: 1200, height: 240 });
    const shortWindow = await navigationGroupHeight(page);
    await expectLastNavigationItemReachable(page);
    evidence.clamps = { minimum, maximum, shortWindow };

    await page.setViewportSize({ width: 390, height: 844 });
    await openCompactSidebar(page);
    const close = page.locator('[data-testid="sidebar-close"]:visible');
    await expect(close).toBeVisible();
    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    const closeBox = await close.boundingBox();
    const toggleBox = await header.boundingBox();
    evidence.compact = { closeBox, toggleBox, closeTabIndex: await close.getAttribute("tabindex") };
    await header.focus();
    await page.keyboard.press("Tab");
    evidence.compactFocusedAfterHeader = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    await close.tap();
    await expect(close).toBeHidden();

    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("@paseo:app-settings") ?? "{}");
      raw.sidebarNavItems = ["new-workspace", "history", "search", "schedules"].map((key) => ({
        key,
        visible: false,
      }));
      localStorage.setItem("@paseo:app-settings", JSON.stringify(raw));
    });
    await page.reload();
    await openCompactSidebar(page);
    await expect(close).toBeVisible();
    await expect(rows).toHaveCount(0);
    evidence.emptyCompact = { closeBox: await close.boundingBox(), rows: await rows.count() };
    await close.tap();
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.getByTestId("sidebar-nav-group")).toHaveCount(0);

    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("@paseo:app-settings") ?? "{}");
      raw.sidebarNavItems = ["new-workspace", "history", "search", "schedules"].map((key) => ({
        key,
        visible: key === "history",
      }));
      localStorage.setItem("@paseo:app-settings", JSON.stringify(raw));
      const panel = JSON.parse(localStorage.getItem("panel-state") ?? "{}");
      delete panel.state.sidebarNavHeight;
      panel.state.sidebarWidth = 280;
      localStorage.setItem("panel-state", JSON.stringify(panel));
    });
    await page.reload();
    await expect(rows).toBeVisible();
    evidence.oneRowLegacy = {
      height: await navigationGroupHeight(page),
      stored: await persistedHeight(),
      sidebarWidth: await page.evaluate(
        () => JSON.parse(localStorage.getItem("panel-state")!).state.sidebarWidth,
      ),
    };
    expect(await navigationGroupHeight(page)).toBeLessThan(50);

    expect
      .soft(
        cancelTreatment.afterCancel,
        "canceled preview must either revert or agree with the value restored after reload",
      )
      .toBeCloseTo(afterReload, 0);
  } finally {
    writeFileSync(
      path.join(__dirname, "adversarial-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
});
