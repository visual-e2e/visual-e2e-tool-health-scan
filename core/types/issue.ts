import type {
  ClickOutcome,
  IssueCategory,
  IssueSeverity,
  SkipReason,
} from "../enums/issue.js";
import type { ClickTargetIdentity, MatchedRuleInfo } from "./identity.js";

export interface ClickActionLog {
  id: string;
  timestamp: string;
  pageUrl: string;
  target: ClickTargetIdentity;
  outcome: ClickOutcome;
  skipReason?: SkipReason;
  score: number;
  matchedRules: MatchedRuleInfo[];
  error?: string;
}

export interface ScanIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  detail?: string;
  pageUrl: string;
  url?: string;
  status?: number;
  resourceType?: string;
  /** @deprecated debug only; use clickTarget for reports */
  selector?: string;
  clickTarget?: ClickTargetIdentity;
  count: number;
  timestamp: string;
}
