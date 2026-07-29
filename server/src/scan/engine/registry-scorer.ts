import {
  ClickPolicy,
  ScopeType,
  compileFromConfig,
  type EventEntry,
  type MatchedRuleInfo,
  type ScanOptions,
} from "../../types.js";
import { RegistryStatus } from "../../../../core/enums/registry.js";
import { scoreCandidate } from "../probes/click/rules.js";
import type { ClickTargetIdentity } from "../../../../core/types/identity.js";
import { LabelSource } from "../../types.js";

export interface RegistryScoreResult {
  score: number;
  clickable: boolean;
  matchedRules: MatchedRuleInfo[];
}

function entryToRuleTarget(entry: EventEntry): ClickTargetIdentity {
  return {
    targetId: entry.targetId,
    label: entry.text || entry.tagName,
    labelSource: LabelSource.Text,
    tag: entry.tagName,
    role: "unknown",
    position: entry.rect,
    scope: {
      type: entry.scopeType === "overlay" ? ScopeType.Overlay : ScopeType.Page,
      layer: entry.layer,
    },
    matchContext: entry.matchContext ?? {
      searchText: entry.text,
      attributes: {},
      selectorSelf: entry.tagName,
      parentChain: [],
    },
  };
}

export function scoreEventEntry(
  entry: EventEntry,
  options: Pick<
    ScanOptions,
    "blacklistRules" | "whitelistRules" | "whitelistDefaultWeight" | "defaultWeight"
  >,
): RegistryScoreResult {
  const compiled = compileFromConfig(
    options.blacklistRules,
    options.whitelistRules,
    options.whitelistDefaultWeight,
  );
  const scored = scoreCandidate(entryToRuleTarget(entry), compiled, options.defaultWeight);
  return {
    score: scored.score,
    clickable: scored.clickable,
    matchedRules: scored.matchedRules,
  };
}

export function applyRegistryScoring(
  entries: EventEntry[],
  options: Pick<
    ScanOptions,
    "blacklistRules" | "whitelistRules" | "whitelistDefaultWeight" | "defaultWeight"
  >,
): EventEntry[] {
  const changed: EventEntry[] = [];
  for (const entry of entries) {
    const result = scoreEventEntry(entry, options);
    entry.score = result.score;
    entry.matchedRules = result.matchedRules;
    if (!result.clickable && entry.status !== RegistryStatus.Executed) {
      entry.status = RegistryStatus.Skipped;
      changed.push(entry);
    }
  }
  return changed;
}

export function isSchedulableEntry(
  entry: EventEntry,
  schedule: Pick<ScanOptions, "clickPolicy" | "defaultWeight">,
): boolean {
  if (entry.status !== RegistryStatus.Pending) return false;
  if (schedule.clickPolicy === ClickPolicy.WhitelistOnly) {
    return (entry.score ?? schedule.defaultWeight) > schedule.defaultWeight;
  }
  return true;
}
