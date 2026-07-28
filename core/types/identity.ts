import type {
  LabelSource,
  NavigationKind,
  RuleListType,
  ScopeType,
} from "../enums/identity.js";

export interface NavigationStep {
  kind: NavigationKind;
  label: string;
  component?: string;
  elementId?: string;
}

/** Default locator replay hints collected in browser */
export interface LocatorHints {
  tag: string;
  stableClasses: string[];
  ariaLabel?: string;
  title?: string;
  thyicon?: string;
  nthOfType?: number;
}

export interface ClickTargetIdentity {
  targetId: string;
  label: string;
  labelSource: LabelSource;
  role: string;
  tag: string;
  component?: string;
  elementId?: string;
  scope: {
    type: ScopeType;
    scopeLabel?: string;
    layer: number;
  };
  anchors?: {
    dialogTitle?: string;
    sectionHeading?: string;
    activeNavRoute?: string;
    breadcrumb?: string;
    rowLabel?: string;
  };
  navigationPath?: NavigationStep[];
  position: { top: number; left: number; width: number; height: number };
  /** Collected in browser for rule matching */
  matchContext?: {
    searchText: string;
    attributes: Record<string, string>;
    selectorSelf: string;
    parentChain: string[];
  };
  locatorHints?: LocatorHints;
}

export interface MatchedRuleInfo {
  id: string;
  type: RuleListType;
  weight: number;
  matchedText: string;
}
