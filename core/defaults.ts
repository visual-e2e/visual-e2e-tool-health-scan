import { ClickPolicy } from "./constants/click.js";
import { getDefaultBlacklistConfig, getDefaultWhitelistConfig, loadUrlExclude } from "./load-rules.js";
import type { ScanOptions } from "./types/options.js";

const defaultWhitelist = getDefaultWhitelistConfig();

export const DEFAULT_SCAN_OPTIONS: Omit<ScanOptions, "startUrl"> = {
  enableNetwork: true,
  enableLayout: true,
  enableClick: true,
  enableNavigationProbe: true,
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
  urlExclude: loadUrlExclude(),
};
