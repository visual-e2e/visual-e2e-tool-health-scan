import { ClickPolicy } from "./constants/click.js";
import { ClickSuccessMode } from "./enums/issue.js";
import { getDefaultBlacklistConfig, getDefaultWhitelistConfig } from "./load-rules.js";
import { getDefaultIgnoreRequestRules } from "./load-ignore-request.js";
import { getDefaultProbeSelectors } from "./load-probe-selectors.js";
import type { ScanOptions } from "./types/options.js";

const defaultWhitelist = getDefaultWhitelistConfig();

export const DEFAULT_SCAN_OPTIONS: Omit<ScanOptions, "startUrl"> = {
  enableNetwork: true,
  enableLayout: true,
  enableClick: true,
  enableNavigationProbe: true,
  enableHoverProbe: true,
  maxClicks: 500,
  maxOverlayDepth: 5,
  clickDelayMs: 450,
  postClickSettleMs: 300,
  settleMs: 1200,
  networkIdleMs: 800,
  consecutiveErrorLimit: 5,
  refreshOnConsecutiveErrors: true,
  clickPolicy: ClickPolicy.WhitelistBoost,
  defaultWeight: 0,
  blacklistRules: getDefaultBlacklistConfig(),
  whitelistRules: defaultWhitelist.rules,
  whitelistDefaultWeight: defaultWhitelist.defaultWeight,
  clickSortTolerancePx: 8,
  apiErrorMinStatus: 500,
  ignoreRequestRules: getDefaultIgnoreRequestRules(),
  autoLoginEnabled: false,
  loginProfile: undefined,
  loginSelectors: {
    username: "input[type='text'], input[name='username'], input[name='email']",
    password: "input[type='password']",
    submit: "button[type='submit']",
  },
  enableRecording: true,
  enableFailureScreenshot: true,
  enableRouteScreenshot: false,
  clickSuccessMode: ClickSuccessMode.DomChange,
  probeSelectors: getDefaultProbeSelectors(),
};
