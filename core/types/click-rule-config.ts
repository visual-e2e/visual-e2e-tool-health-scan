/** v3 click rule config — text / attribute / selector / parent */

import { RuleListType } from "../enums/identity.js";
import { RuleOp, RuleType } from "../enums/rule.js";

export interface BaseClickRuleConfig {
  id: number;
  title: string;
  description?: string;
  /** Whitelist only */
  weight?: number;
}

export interface TextRuleConfig extends BaseClickRuleConfig {
  type: RuleType.Text;
  op: RuleOp;
  values: string[];
}

export interface AttributeRuleConfig extends BaseClickRuleConfig {
  type: RuleType.Attribute;
  attr: string;
  op: RuleOp;
  values: string[];
}

export interface SelectorRuleConfig extends BaseClickRuleConfig {
  type: RuleType.Selector;
  op: RuleOp;
  values: string[];
}

export interface ParentRuleConfig extends BaseClickRuleConfig {
  type: RuleType.Parent;
  op: RuleOp;
  values: string[];
}

export type ClickRuleConfig =
  | TextRuleConfig
  | AttributeRuleConfig
  | SelectorRuleConfig
  | ParentRuleConfig;

export interface BlacklistRuleFile {
  version: 3;
  rules: ClickRuleConfig[];
}

export interface WhitelistRuleFile {
  version: 3;
  defaultWeight?: number;
  rules: ClickRuleConfig[];
}

/** Runtime match data collected with each click target */
export interface RuleMatchContext {
  searchText: string;
  attributes: Record<string, string>;
  selectorSelf: string;
  parentChain: string[];
}

export interface CompiledClickRule {
  id: string;
  ruleId: number;
  list: RuleListType;
  weight: number;
  description?: string;
  describe: string;
  test(ctx: RuleMatchContext): boolean;
}
