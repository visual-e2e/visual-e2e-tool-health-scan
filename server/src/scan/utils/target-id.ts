import { createHash } from "node:crypto";
import type { ClickTargetIdentity } from "../../types.js";

export function buildTargetId(
  partial: Omit<ClickTargetIdentity, "targetId">,
): string {
  const key = [
    partial.scope.type,
    partial.scope.scopeLabel ?? "",
    partial.scope.layer,
    partial.role,
    partial.component ?? "",
    partial.elementId ?? "",
    partial.label,
    partial.anchors?.dialogTitle ?? "",
    partial.anchors?.activeNavRoute ?? "",
    Math.round(partial.position.top / 10),
    Math.round(partial.position.left / 10),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
