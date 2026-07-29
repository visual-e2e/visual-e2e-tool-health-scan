import type { ClickPolicy } from "../enums/click.js";
import type { ClickSuccessMode } from "../enums/issue.js";
import type { ClickRuleConfig } from "./click-rule-config.js";
import type { Framework } from "./event-entry.js";
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
  /** 前端框架，影响事件采集策略。默认 'auto' */
  framework?: Framework;
  /**
   * 启用基于事件表的新扫描引擎。
   * false = 降级到旧的选择器采集模式。默认 true。
   */
  useEventTable?: boolean;
  /** list 组最多采样几个元素，默认 2 */
  listSampleSize?: number;
  /** 等待 DOM 变化超时（ms），默认 3000 */
  domChangeTimeoutMs?: number;
  /** 执行模式：strict_registry=注册表全尝试，smart_dedup=语义去重优先 */
  executionMode?: "strict_registry" | "smart_dedup";
  /** 单个注册项最大重试次数（目前保留配置位） */
  maxRetryPerItem?: number;
  /** 无进展轮数上限，避免误退出（默认 3） */
  maxRoundsWithoutProgress?: number;
}
