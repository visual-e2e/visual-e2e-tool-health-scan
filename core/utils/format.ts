import type { ClickTargetIdentity } from "../types/identity.js";

/** Human-readable label for reports and replay. */
export function formatClickTarget(target?: ClickTargetIdentity): string {
  if (!target) return "—";
  const scope =
    target.scope.scopeLabel || (target.scope.type === "overlay" ? "浮层" : "");
  const path = target.navigationPath?.map((s) => s.label).join(" › ");
  const parts = [scope, path, target.label].filter(Boolean);
  const base = parts.join(" › ");
  const id = target.elementId ? ` (${target.elementId})` : "";
  return `${base}${id}`;
}
