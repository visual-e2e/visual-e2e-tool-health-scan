import type { RuleDriver } from "../driver.js";
import type { SelectorRuleConfig } from "../../types/click-rule-config.js";
import { RuleListType } from "../../enums/identity.js";
import { RuleOp, RuleType } from "../../enums/rule.js";
import { matchOp, normalizeValues } from "../match-op.js";

export const selectorRuleDriver: RuleDriver<SelectorRuleConfig> = {
  type: RuleType.Selector,
  label: "选择器",
  validate(rule, index) {
    if (!Number.isInteger(rule.id) || rule.id <= 0) {
      throw new Error(`规则 #${index + 1} 缺少合法 id`);
    }
    if (!rule.title?.trim()) {
      throw new Error(`规则 #${index + 1} 缺少标题`);
    }
    if (!rule.op || !Array.isArray(rule.values) || rule.values.length === 0) {
      throw new Error(`规则 #${index + 1} 选择器类配置无效`);
    }
  },
  createEmpty(id, list) {
    return {
      id,
      title: "元素规则",
      type: RuleType.Selector,
      op: RuleOp.Contains,
      values: [],
      weight: list === RuleListType.Whitelist ? 50 : undefined,
    };
  },
  describe(rule) {
    const values = normalizeValues(rule.values);
    const opLabel = rule.op === RuleOp.Equals ? "元素等于" : "元素包含";
    return `${opLabel}: ${values.join("、") || "—"}`;
  },
  test(rule, ctx) {
    return matchOp(ctx.selectorSelf, normalizeValues(rule.values), rule.op);
  },
};
