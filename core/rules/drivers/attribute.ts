import type { RuleDriver } from "../driver.js";
import type { AttributeRuleConfig } from "../../types/click-rule-config.js";
import { RuleListType } from "../../enums/identity.js";
import { RuleOp, RuleType } from "../../enums/rule.js";
import { matchOp, normalizeValues } from "../match-op.js";

export const attributeRuleDriver: RuleDriver<AttributeRuleConfig> = {
  type: RuleType.Attribute,
  label: "属性",
  validate(rule, index) {
    if (!Number.isInteger(rule.id) || rule.id <= 0) {
      throw new Error(`规则 #${index + 1} 缺少合法 id`);
    }
    if (!rule.title?.trim()) {
      throw new Error(`规则 #${index + 1} 缺少标题`);
    }
    if (!rule.attr?.trim() || !rule.op || !Array.isArray(rule.values) || rule.values.length === 0) {
      throw new Error(`规则 #${index + 1} 属性类配置无效`);
    }
  },
  createEmpty(id, list) {
    return {
      id,
      title: "属性规则",
      type: RuleType.Attribute,
      attr: "id",
      op: RuleOp.Equals,
      values: [],
      weight: list === RuleListType.Whitelist ? 50 : undefined,
    };
  },
  describe(rule) {
    const values = normalizeValues(rule.values);
    const attr = rule.attr.trim();
    const opLabel = rule.op === RuleOp.Equals ? "属性等于" : "属性包含";
    return `${opLabel} [${attr}]: ${values.join("、") || "—"}`;
  },
  test(rule, ctx) {
    const raw = ctx.attributes[rule.attr.trim()] ?? "";
    return matchOp(raw, normalizeValues(rule.values), rule.op);
  },
};
