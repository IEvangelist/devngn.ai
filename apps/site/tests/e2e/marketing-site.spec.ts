import { expect, test } from "@playwright/test";

const mobile = { width: 390, height: 844 };
const themes = ["light", "dark"] as const;

async function forceTheme(page: import("@playwright/test").Page, theme: string) {
  await page.addInitScript((value) => {
    localStorage.setItem("starlight-theme", value);
    document.documentElement.dataset.theme = value;
  }, theme);
}

test.describe("mobile sidebar", () => {
  test.use({ viewport: mobile });

  test("does not expose the closed drawer to keyboard or assistive tech", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebar = page.locator(".site-sidebar");
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(sidebar).toHaveJSProperty("inert", true);

    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expect(page.locator("body")).toHaveClass(/sidebar-open/);
    await expect(sidebar).toHaveAttribute("aria-hidden", "false");
    await expect(sidebar).toHaveJSProperty("inert", false);

    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/sidebar-open/);
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await expect(sidebar).toHaveJSProperty("inert", true);
  });

  test("marks only one sidebar link current for duplicate primary/sidebar destinations", async ({
    page,
  }) => {
    for (const path of ["/getting-started/", "/wellness/"]) {
      await page.goto(path);

      const currentLinks = page.locator('.site-sidebar a[aria-current="page"]');
      await expect(currentLinks).toHaveCount(1);
    }
  });

  test("updates drawer selection and closes after mobile navigation", async ({
    page,
  }) => {
    await page.goto("/getting-started/");

    const menuButton = page.getByRole("button", {
      name: "Toggle navigation menu",
    });
    await menuButton.click();
    await page
      .locator(".site-sidebar")
      .getByRole("link", { name: /^Overview$/ })
      .click();

    await expect(page).toHaveURL(/\/wellness\/$/);
    await expect(page.locator("body")).not.toHaveClass(/sidebar-open/);
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".site-sidebar")).toHaveJSProperty("inert", true);
    await expect(page.locator('.site-sidebar a[aria-current="page"]')).toHaveText(
      "Overview",
    );
  });
});

test.describe("responsive layout", () => {
  test.use({ viewport: mobile });

  for (const theme of themes) {
    test(`does not horizontally overflow the API reference in ${theme} theme`, async ({
      page,
    }) => {
      await forceTheme(page, theme);
      await page.goto("/wellness/reference/");

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("download page", () => {
  for (const theme of themes) {
    test(`does not request a missing GitHub release endpoint in ${theme} theme`, async ({
      page,
    }) => {
      await forceTheme(page, theme);
      const githubFailures: string[] = [];
      page.on("response", (response) => {
        if (
          response.url().startsWith("https://api.github.com/") &&
          response.status() >= 400
        ) {
          githubFailures.push(`${response.status()} ${response.url()}`);
        }
      });

      await page.goto("/download/", { waitUntil: "networkidle" });

      expect(githubFailures).toEqual([]);
    });
  }
});
