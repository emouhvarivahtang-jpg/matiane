import { test, expect } from "./fixtures";

const today = {
  day: "2026-10-13",
  unit: "neurons",
  sampledAt: "2026-10-13T08:00:00.000Z",
  dailyLimit: 8000,
  cloudflareFreeDaily: 10000,
  used: 120.5,
  reserved: 650,
  remaining: 7229.5,
  resetsAt: "2026-10-14T00:00:00.000Z",
  providerConfigured: true,
  cloudflareDashboardUrl:
    "https://dash.cloudflare.com/?to=/:account/ai/workers-ai",
  recent: [
    {
      id: "completed",
      startedAt: "2026-10-13T07:30:00.000Z",
      photoCount: 6,
      pageCount: 40,
      cachedPhotos: 0,
      status: "completed",
      neurons: 60.5,
      reportedNeurons: 60.5,
      estimated: false,
    },
    {
      id: "cached",
      startedAt: "2026-10-13T07:35:00.000Z",
      photoCount: 6,
      pageCount: 40,
      cachedPhotos: 6,
      status: "completed",
      neurons: 8,
      reportedNeurons: 8,
      estimated: false,
    },
    {
      id: "cancelled",
      startedAt: "2026-10-13T07:40:00.000Z",
      photoCount: 6,
      pageCount: 40,
      cachedPhotos: 0,
      status: "cancelled",
      neurons: 650,
      reportedNeurons: 5,
      estimated: true,
    },
  ],
};
async function cabinet(page, { admin = true } = {}) {
  let usageRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session")
      return route.fulfill({
        json: {
          user: {
            id: "usage-admin",
            email: "usage@example.invalid",
            isAdmin: admin,
          },
          csrfToken: "synthetic-token",
        },
      });
    if (path === "/api/books")
      return route.fulfill({ json: { books: [], storageUsed: 0 } });
    if (path === "/api/admin/books")
      return route.fulfill({ json: { books: [], total: 0 } });
    if (path === "/api/admin/ai-usage") {
      usageRequests++;
      return route.fulfill({
        json:
          usageRequests === 1
            ? today
            : { ...today, used: 8000, reserved: 0, remaining: 0 },
      });
    }
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "My books", exact: true }),
  ).toBeVisible();
  return () => usageRequests;
}
test("administrator sees usage, reservations, cached costs, reset time and can refresh exhausted allowance", async ({
  page,
}) => {
  const requests = await cabinet(page);
  const panel = page.locator(".admin-ai-usage");
  await expect(
    panel.getByRole("heading", { name: "AI usage", exact: true }),
  ).toBeVisible();
  const amounts = panel.locator(".ai-usage-metrics strong");
  await expect(amounts).toHaveText(["120.5", "7,229.5", "650"]);
  await expect(panel).toContainText("14/10, 04:00");
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "value",
    "770.5",
  );
  await expect(panel.locator("tbody tr")).toHaveCount(3);
  await expect(panel.locator("tbody tr").nth(1)).toContainText("8");
  await expect(panel.locator("tbody tr").nth(2)).toContainText("≈ 650");
  await expect(panel.getByRole("link")).toHaveAttribute(
    "href",
    today.cloudflareDashboardUrl,
  );
  await panel
    .getByRole("button", { name: "Refresh usage", exact: true })
    .click();
  await expect(amounts).toHaveText(["8,000", "0", "0"]);
  await expect(panel.getByRole("status")).toContainText(
    "books and manual editing remain available",
  );
  expect(requests()).toBe(2);
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Расход AI", exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("Тбилиси");
});
test("ordinary account cannot see or request administrator AI statistics", async ({
  page,
}) => {
  const requests = await cabinet(page, { admin: false });
  await expect(page.locator(".admin-ai-usage")).toHaveCount(0);
  expect(requests()).toBe(0);
});
test("mobile usage cards and scrolling cost history fit the cabinet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await cabinet(page);
  const panel = page.locator(".admin-ai-usage");
  await expect(panel.locator(".ai-usage-metrics strong").first()).toHaveText(
    "120.5",
  );
  expect(
    await page.evaluate(
      () => document.scrollingElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const table = panel.locator(".ai-usage-table-wrap");
  expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: test.info().outputPath("mobile-ai-usage.png"),
    fullPage: true,
  });
});
