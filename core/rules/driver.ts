import type {
  ClickRuleConfig,
  CompiledClickRule,
  RuleMatchContext,
} from "../types/click-rule-config.js";

export interface CompileRuleContext {
  list: CompiledClickRule["list"];
  weight: number;
}

export interface RuleDriver<T extends ClickRuleConfig = ClickRuleConfig> {
  type: T["type"];
  label: string;
  validate(rule: T, index: number): void;
  createEmpty(id: number, list: CompiledClickRule["list"]): T;
  describe(rule: T): string;
  test(rule: T, ctx: RuleMatchContext): boolean;
}
