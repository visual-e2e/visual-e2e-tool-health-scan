import { compileRules, assertClickRuleConfig } from "./compile-rules.js";
import { RuleOp, RuleType } from "./enums/rule.js";
import { RuleModuleType } from "./enums/rule-module.js";
import type {
  BlacklistRuleFile,
  ClickRuleConfig,
  CompiledClickRule,
  WhitelistRuleFile,
} from "./types/click-rule-config.js";
import type { ClickTargetIdentity } from "./types/identity.js";
import type { RuleMatchContext } from "./types/click-rule-config.js";
import blacklistJson from "../config/blacklist.json" with { type: "json" };
import whitelistJson from "../config/whitelist.json" with { type: "json" };

function parseBlacklistFile(raw: unknown): BlacklistRuleFile {
  if (Array.isArray(raw)) {
    throw new Error("黑名单配置请使用 v3 格式 { version: 3, rules: [...] }");
  }
  const file = raw as BlacklistRuleFile;
  if (file.version !== 3 || !Array.isArray(file.rules)) {
    throw new Error("blacklist.json 格式无效");
  }
  const normalized = {
    version: 3 as const,
    type: RuleModuleType.Blacklist,
    rules: file.rules.map(normalizeRule),
  } satisfies BlacklistRuleFile;
  for (let i = 0; i < normalized.rules.length; i++) assertClickRuleConfig(normalized.rules[i]!, i);
  return normalized;
}

function parseWhitelistFile(raw: unknown): WhitelistRuleFile {
  if (Array.isArray(raw)) {
    throw new Error("白名单配置请使用 v3 格式 { version: 3, rules: [...] }");
  }
  const file = raw as WhitelistRuleFile;
  if (file.version !== 3 || !Array.isArray(file.rules)) {
    throw new Error("whitelist.json 格式无效");
  }
  const normalized = {
    version: 3 as const,
    type: RuleModuleType.Whitelist,
    defaultWeight: file.defaultWeight,
    rules: file.rules.map(normalizeRule),
  } satisfies WhitelistRuleFile;
  for (let i = 0; i < normalized.rules.length; i++) assertClickRuleConfig(normalized.rules[i]!, i);
  return normalized;
}

const defaultBlacklistFile = parseBlacklistFile(blacklistJson);
const defaultWhitelistFile = parseWhitelistFile(whitelistJson);

export function getDefaultBlacklistConfig(): ClickRuleConfig[] {
  return structuredClone(defaultBlacklistFile.rules);
}

export function getDefaultWhitelistConfig(): {
  defaultWeight: number;
  rules: ClickRuleConfig[];
} {
  return {
    defaultWeight: defaultWhitelistFile.defaultWeight ?? 0,
    rules: structuredClone(defaultWhitelistFile.rules),
  };
}


export function compileFromConfig(
  blacklist: ClickRuleConfig[],
  whitelist: ClickRuleConfig[],
  whitelistDefaultWeight = 0,
): CompiledClickRule[] {
  const normalizedBlacklist = blacklist.map(normalizeRule);
  const normalizedWhitelist = whitelist.map(normalizeRule);
  for (let i = 0; i < normalizedBlacklist.length; i++) assertClickRuleConfig(normalizedBlacklist[i]!, i);
  for (let i = 0; i < normalizedWhitelist.length; i++) assertClickRuleConfig(normalizedWhitelist[i]!, i);
  return compileRules(normalizedBlacklist, normalizedWhitelist, whitelistDefaultWeight);
}

export function loadCompiledClickRules(): CompiledClickRule[] {
  return compileFromConfig(
    defaultBlacklistFile.rules,
    defaultWhitelistFile.rules,
    defaultWhitelistFile.defaultWeight ?? 0,
  );
}

/** Build runtime match context from a click target identity */
export function buildRuleMatchContext(identity: ClickTargetIdentity): RuleMatchContext {
  const mc = identity.matchContext;
  if (mc) return mc;

  const parts = [
    identity.label,
    identity.scope.scopeLabel,
    identity.elementId,
    identity.navigationPath?.map((s) => s.label).join(" "),
    identity.anchors?.dialogTitle,
    identity.anchors?.sectionHeading,
    identity.anchors?.activeNavRoute,
    identity.anchors?.rowLabel,
    identity.component,
  ].filter(Boolean);

  return {
    searchText: parts.join(" "),
    attributes: identity.elementId ? { id: identity.elementId } : {},
    selectorSelf: identity.component ?? identity.tag,
    parentChain: [],
  };
}

function normalizeRule(rule: ClickRuleConfig): ClickRuleConfig {
  const base = {
    ...rule,
    title: rule.title?.trim() || "未命名规则",
    type: toRuleType(rule.type),
  };
  if ("op" in base) {
    return { ...base, op: toRuleOp(base.op) } as ClickRuleConfig;
  }
  return base as ClickRuleConfig;
}

function toRuleType(value: string): RuleType {
  switch (value) {
    case RuleType.Text:
      return RuleType.Text;
    case RuleType.Attribute:
      return RuleType.Attribute;
    case RuleType.Selector:
      return RuleType.Selector;
    case RuleType.Parent:
      return RuleType.Parent;
    default:
      throw new Error(`未知规则类型: ${value}`);
  }
}

function toRuleOp(value: string): RuleOp {
  switch (value) {
    case RuleOp.Contains:
      return RuleOp.Contains;
    case RuleOp.Equals:
      return RuleOp.Equals;
    default:
      throw new Error(`未知规则操作符: ${value}`);
  }
}
