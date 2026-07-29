import type { ClickPolicy } from "../enums/click.js";
import type { ClickSuccessMode } from "../enums/issue.js";
import type { ClickRuleConfig } from "./click-rule-config.js";
import type { IgnoreRequestRule } from "./ignore-request.js";
import type { ProbeSelectorsConfig } from "./probe-selectors.js";

export interface LoginSelectors {
  username?: string;
  password?: string;
  submit?: string;
  successUrlPattern?: string;
}

export interface LoginProfile {
  username?: string;
  password?: string;
  source?: "rpc" | "manual";
}

export interface ScanOptions {
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  enableNavigationProbe: boolean;
  enableHoverProbe: boolean;
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
  /** Rules for ignoring network issues (url-exclude.json) */
  ignoreRequestRules: IgnoreRequestRule[];
  /** @deprecated use blacklistRules */
  clickExclude?: string[];
  autoLoginEnabled?: boolean;
  loginProfile?: LoginProfile;
  loginSelectors?: LoginSelectors;
  enableRecording?: boolean;
  enableFailureScreenshot?: boolean;
  enableRouteScreenshot?: boolean;
  clickSuccessMode?: ClickSuccessMode;
  probeSelectors?: ProbeSelectorsConfig;
}
