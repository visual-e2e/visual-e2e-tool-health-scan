import type { Locator, Page } from "playwright";
import { ClickRole, type ClickTargetIdentity } from "../../../types.js";

const ROLE_MAP: Record<string, ClickRole> = {
  button: ClickRole.Button,
  link: ClickRole.Link,
  tab: ClickRole.Tab,
  menuitem: ClickRole.MenuItem,
};

async function firstVisible(root: Page | Locator, loc: Locator): Promise<Locator | null> {
  const first = loc.first();
  if (await first.isVisible().catch(() => false)) return first;
  return null;
}

function buildClassSelector(tag: string, classes: string[]): string | null {
  const stable = classes.filter(Boolean);
  if (stable.length === 0) return null;
  return `${tag}.${stable.map((c) => CSS.escape(c)).join(".")}`;
}

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function resolveTarget(
  page: Page,
  identity: ClickTargetIdentity,
): Promise<Locator | null> {
  const hints = identity.locatorHints;
  const root: Page | Locator = page;

  if (identity.elementId) {
    const byId = await firstVisible(root, root.locator(`#${CSS.escape(identity.elementId)}`));
    if (byId) return byId;
  }

  const name = identity.label;
  const role = identity.role;
  if (name && name !== "[无文本]" && role !== "unknown") {
    const pwRole = ROLE_MAP[role];
    if (pwRole) {
      const byRole = await firstVisible(root, root.getByRole(pwRole, { name, exact: false }));
      if (byRole) return byRole;
    }
  }

  const attrCandidates: Array<[string, string | undefined]> = [
    ["thyicon", hints?.thyicon ?? identity.matchContext?.attributes.thyicon],
    ["aria-label", hints?.ariaLabel ?? identity.matchContext?.attributes["aria-label"]],
    ["title", hints?.title ?? identity.matchContext?.attributes.title],
  ];
  for (const [attr, value] of attrCandidates) {
    if (!value) continue;
    const byAttr = await firstVisible(root, root.locator(`[${attr}="${escapeAttrValue(value)}"]`));
    if (byAttr) return byAttr;
  }

  const tag = hints?.tag ?? identity.tag;
  const classSel = hints?.stableClasses?.length
    ? buildClassSelector(tag, hints.stableClasses)
    : null;
  if (classSel) {
    const byClass = await firstVisible(root, root.locator(classSel));
    if (byClass) return byClass;
  }

  if (hints?.nthOfType && tag) {
    const byNth = await firstVisible(root, root.locator(tag).nth(hints.nthOfType - 1));
    if (byNth) return byNth;
  }

  return null;
}

export async function tryClickTarget(
  page: Page,
  identity: ClickTargetIdentity,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const locator = await resolveTarget(page, identity);
    if (locator) {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
      await locator.click({ timeout: 2500 });
      return { ok: true };
    }

    const { top, left, width, height } = identity.position;
    if (width > 4 && height > 4) {
      const cx = left + width / 2;
      const cy = top + height / 2;
      await page.mouse.click(cx, cy);
      return { ok: true };
    }

    return { ok: false, error: "无法定位元素" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
