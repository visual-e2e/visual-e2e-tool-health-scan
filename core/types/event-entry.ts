import type { RegistryStatus } from "../enums/registry.js";
import type { RuleMatchContext } from "./click-rule-config.js";
import type { MatchedRuleInfo } from "./identity.js";

export type EventSource =
  | "inline"
  | "angular"
  | "react"
  | "vue"
  | "hover"
  | "probe";

export type EventEntryStatus = Exclude<
  RegistryStatus,
  RegistryStatus.Skipped
>;

export type Framework = "auto" | "native" | "angular" | "react" | "vue";

export interface EventEntry {
  targetId: string;
  semanticId: string;
  selector: string;
  tagName: string;
  text: string;
  eventTypes: string[];
  sources: EventSource[];
  rect: { top: number; left: number; width: number; height: number };
  /** 1=inline > 2=framework > 3=hover > 4=probe */
  priority: number;
  listGroupKey?: string;
  isVisible: boolean;
  layer: number;
  status: RegistryStatus;
  scopeType?: "overlay" | "page";
  scopeId?: string;
  overlaySelector?: string;
  /** 白名单/黑名单规则打分，越高越优先 */
  score?: number;
  matchedRules?: MatchedRuleInfo[];
  matchContext?: RuleMatchContext;
}

export type EventEntryDraft = Omit<EventEntry, "layer" | "status">;
