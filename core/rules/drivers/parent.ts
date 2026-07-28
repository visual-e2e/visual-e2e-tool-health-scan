import type { RuleDriver } from "../driver.js";
import type { ParentRuleConfig } from "../../types/click-rule-config.js";
import { RuleListType } from "../../enums/identity.js";
import { RuleOp, RuleType } from "../../enums/rule.js";
import { matchOp, normalizeValues } from "../match-op.js";

export const parentRuleDriver: RuleDriver<ParentRuleConfig> = {
  type: RuleType.Parent,
  label: "父级",
  validate(rule, index) {
    if (!Number.isInteger(rule.id) || rule.id <= 0) {
      throw new Error(`规则 #${index + 1} 缺少合法 id`);
    }
    if (!rule.title?.trim()) {
      throw new Error(`规则 #${index + 1} 缺少标题`);
    }
    if (!rule.op || !Array.isArray(rule.values) || rule.values.length === 0) {
      throw new Error(`规则 #${index + 1} 父级类配置无效`);
    }
  },
  createEmpty(id, list) {
    return {
      id,
      title: "父级规则",
      type: RuleType.Parent,
      op: RuleOp.Contains,
      values: [],
      weight: list === RuleListType.Whitelist ? 50 : undefined,
    };
  },
  describe(rule) {
    const values = normalizeValues(rule.values);
    const opLabel = rule.op === RuleOp.Equals ? "父级等于" : "父级包含";
    return `${opLabel}: ${values.join("、") || "—"}`;
  },
  test(rule, ctx) {
    const values = normalizeValues(rule.values);
    return ctx.parentChain.some((segment) => matchOp(segment, values, rule.op));
  },
};
