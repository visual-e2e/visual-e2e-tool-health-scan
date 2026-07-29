import { RuleOp } from "../enums/rule.js";
import { RuleModuleType } from "../enums/rule-module.js";

/** Abstract probe families — config focus, not separate engines. */
export enum ProbeCategory {
  Click = "click",
  Hover = "hover",
  Nav = "nav",
  Layout = "layout",
}

/** Interaction to perform (nav defaults to click; hover rules default to hover). */
export enum ProbeAction {
  Click = "click",
  Hover = "hover",
}

/** Sub-roles under layout (overlay / close / title / sample). */
export enum ProbeLayoutRole {
  Overlay = "overlay",
  Close = "close",
  Title = "title",
  Sample = "sample",
}

export enum ProbeRuleType {
  Selector = "selector",
}

export interface ProbeRule {
  id: number;
  title: string;
  description?: string;
  category: ProbeCategory;
  /** Required when category === layout */
  role?: ProbeLayoutRole;
  action?: ProbeAction;
  type: ProbeRuleType;
  op: RuleOp;
  values: string[];
}

export interface ProbeSelectorsConfig {
  version: 2;
  type: RuleModuleType.Probe;
  rules: ProbeRule[];
}

/** Flat lists for probes — derived from rules. */
export interface ResolvedProbeSelectors {
  clickable: string[];
  hoverable: string[];
  nav: string[];
  overlay: string[];
  overlayClose: string[];
  overlayTitle: string[];
  layoutSample: string[];
}

export const PROBE_CATEGORY_LABEL: Record<ProbeCategory, string> = {
  [ProbeCategory.Click]: "可点击",
  [ProbeCategory.Hover]: "悬停",
  [ProbeCategory.Nav]: "导航/菜单",
  [ProbeCategory.Layout]: "布局",
};

export const PROBE_LAYOUT_ROLE_LABEL: Record<ProbeLayoutRole, string> = {
  [ProbeLayoutRole.Overlay]: "浮层容器",
  [ProbeLayoutRole.Close]: "关闭控件",
  [ProbeLayoutRole.Title]: "标题节点",
  [ProbeLayoutRole.Sample]: "布局抽样",
};

export const PROBE_ACTION_LABEL: Record<ProbeAction, string> = {
  [ProbeAction.Click]: "点击",
  [ProbeAction.Hover]: "悬停",
};

/** @deprecated v1 flat shape — migrated on load */
export interface LegacyProbeSelectorsConfig {
  version?: 1;
  clickable?: string[];
  navTop?: string[];
  navSide?: string[];
  navActive?: string[];
  navSideLabel?: string[];
  overlay?: string[];
  overlayClose?: string[];
  overlayTitle?: string[];
  layoutProbe?: string[];
}
