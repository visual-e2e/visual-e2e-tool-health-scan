import type { ClickRuleConfig } from "../types/click-rule-config.js";
import { RuleType } from "../enums/rule.js";
import type { RuleDriver } from "./driver.js";
import { textRuleDriver } from "./drivers/text.js";
import { attributeRuleDriver } from "./drivers/attribute.js";
import { selectorRuleDriver } from "./drivers/selector.js";
import { parentRuleDriver } from "./drivers/parent.js";

const registry: Record<ClickRuleConfig["type"], RuleDriver> = {
  [RuleType.Text]: textRuleDriver,
  [RuleType.Attribute]: attributeRuleDriver,
  [RuleType.Selector]: selectorRuleDriver,
  [RuleType.Parent]: parentRuleDriver,
};

export function getRuleDriver(type: ClickRuleConfig["type"]): RuleDriver {
  return registry[type];
}

export function listRuleDrivers(): RuleDriver[] {
  return Object.values(registry);
}
