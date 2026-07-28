import type { ClickRuleConfig, CompiledClickRule } from "../types/click-rule-config.js";
import { RuleListType } from "../enums/identity.js";
import { getRuleDriver } from "./registry.js";

export function compileRule(
  rule: ClickRuleConfig,
  list: CompiledClickRule["list"],
  defaultWeight: number,
): CompiledClickRule {
  const driver = getRuleDriver(rule.type);
  const weight = list === RuleListType.Blacklist ? 0 : (rule.weight ?? defaultWeight);
  return {
    id: `${list}#${rule.id}`,
    ruleId: rule.id,
    list,
    weight,
    description: rule.description,
    describe: driver.describe(rule as never),
    test(ctx) {
      return driver.test(rule as never, ctx);
    },
  };
}

export function compileRules(
  blacklist: ClickRuleConfig[],
  whitelist: ClickRuleConfig[],
  whitelistDefaultWeight = 0,
): CompiledClickRule[] {
  const black = blacklist.map((rule) => compileRule(rule, RuleListType.Blacklist, 0));
  const white = whitelist.map((rule) =>
    compileRule(rule, RuleListType.Whitelist, whitelistDefaultWeight),
  );
  return [...black, ...white];
}

export function assertClickRuleConfig(rule: ClickRuleConfig, index: number): void {
  getRuleDriver(rule.type).validate(rule as never, index);
}
