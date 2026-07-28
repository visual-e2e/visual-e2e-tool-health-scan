import { ClickPolicy, SkipReason, type ScanOptions } from "../../../types.js";
import type { ScoredTarget } from "./rules.js";

export function shouldSkipTarget(
  scored: ScoredTarget,
  options: Pick<ScanOptions, "clickPolicy" | "defaultWeight">,
): SkipReason | undefined {
  if (scored.skipReason === SkipReason.Blacklist) return SkipReason.Blacklist;
  if (
    options.clickPolicy === ClickPolicy.WhitelistOnly &&
    scored.score <= options.defaultWeight
  ) {
    return SkipReason.NotInWhitelist;
  }
  return undefined;
}

export function pickNextTarget(
  scored: ScoredTarget[],
  tried: Set<string>,
): ScoredTarget | undefined {
  return scored.find((s) => !tried.has(s.target.targetId));
}
