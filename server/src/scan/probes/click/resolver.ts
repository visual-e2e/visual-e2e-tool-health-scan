import type { Page } from "playwright";
import type { Locator } from "playwright";
import { ClickRole, type ClickTargetIdentity } from "../../../types.js";

export async function resolveTarget(
  page: Page,
  identity: ClickTargetIdentity,
): Promise<Locator | null> {
  if (identity.elementId) {
    const byId = page.locator(`#${CSS.escape(identity.elementId)}`).first();
    if (await byId.isVisible().catch(() => false)) {
      return byId;
    }
  }

  const role = identity.role;
  const name = identity.label;
  if (name && name !== "[无文本]" && role !== "unknown") {
    const roleMap: Record<string, ClickRole> = {
      button: ClickRole.Button,
      link: ClickRole.Link,
      tab: ClickRole.Tab,
      menuitem: ClickRole.MenuItem,
    };
    const pwRole = roleMap[role];
    if (pwRole) {
      const loc = page.getByRole(pwRole, { name, exact: false }).first();
      if (await loc.isVisible().catch(() => false)) {
        return loc;
      }
    }
  }

  if (identity.component === "thy-nav-item") {
    const loc = page.locator("a.thy-nav-item").filter({ hasText: identity.label }).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }

  if (identity.component === "thy-menu-item") {
    if (identity.elementId) {
      const loc = page.locator(`thy-menu-item#${CSS.escape(identity.elementId)}`).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    const loc = page.locator("thy-menu-item").filter({ hasText: identity.label }).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }

  if (name && name !== "[无文本]") {
    const loc = page.getByText(name, { exact: false }).first();
    if (await loc.isVisible().catch(() => false)) return loc;
  }

  return null;
}

export async function tryClickTarget(
  page: Page,
  identity: ClickTargetIdentity,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const locator = await resolveTarget(page, identity);
    if (!locator) {
      return { ok: false, error: "无法定位元素" };
    }
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
    await locator.click({ timeout: 2500 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
