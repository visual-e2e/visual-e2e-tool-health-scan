import type { ClickPolicy } from "../enums/click.js";
import type { ClickRuleConfig } from "./click-rule-config.js";

export interface ScanOptions {
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  enableNavigationProbe: boolean;
  maxClicks: number;
  maxOverlayDepth: number;
  clickDelayMs: number;
  postClickSettleMs: number;
  settleMs: number;
  networkIdleMs: number;
  consecutiveErrorLimit: number;
  refreshOnConsecutiveErrors: boolean;
  clickPolicy: ClickPolicy;
  defaultWeight: number;
  blacklistRules: ClickRuleConfig[];
  whitelistRules: ClickRuleConfig[];
  whitelistDefaultWeight: number;
  clickSortTolerancePx: number;
  apiErrorMinStatus: 400 | 500;
  urlExclude: string[];
  /** @deprecated use blacklistRules */
  clickExclude?: string[];
}
