import { RULE_MODULE_LABEL, RULE_MODULE_SET, RuleModuleType } from "./enums/rule-module.js";
import { RuleOp, RuleType } from "./enums/rule.js";
import { assertClickRuleConfig } from "./rules/compile.js";
import {
  IgnoreRequestType,
  type IgnoreRequestRule,
  type IgnoreRequestRuleFile,
} from "./types/ignore-request.js";
import {
  ProbeAction,
  ProbeCategory,
  ProbeLayoutRole,
  ProbeRuleType,
  type ProbeRule,
  type ProbeSelectorsConfig,
} from "./types/probe-selectors.js";
import type { ClickRuleConfig } from "./types/click-rule-config.js";
import type { ValidationIssue, ValidateRuleFileResult } from "./types/rule-file.js";
import { normalizeIgnoreRequestRule } from "./load-ignore-request.js";
import { normalizeProbeRule } from "./load-probe-selectors.js";

const OP_SET = new Set(Object.values(RuleOp));
const CLICK_MATCH_SET = new Set(Object.values(RuleType));
const IGNORE_MATCH_SET = new Set(Object.values(IgnoreRequestType));
const PROBE_CATEGORY_SET = new Set(Object.values(ProbeCategory));
const MAX_RULES = 500;

function err(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function inferModule(obj: Record<string, unknown>): RuleModuleType | null {
  if (typeof obj.type === "string" && RULE_MODULE_SET.has(obj.type)) {
    return obj.type as RuleModuleType;
  }
  if ("defaultWeight" in obj) return RuleModuleType.Whitelist;
  const rules = Array.isArray(obj.rules) ? obj.rules : [];
  if (rules.some((r) => r && typeof r === "object" && "category" in (r as object))) {
    return RuleModuleType.Probe;
  }
  if (
    rules.some((r) => {
      const t = (r as { type?: string })?.type;
      return typeof t === "string" && IGNORE_MATCH_SET.has(t as IgnoreRequestType);
    })
  ) {
    return RuleModuleType.IgnoreRequest;
  }
  return null;
}

function reassignIds<T extends { id: number }>(rules: T[]): T[] {
  return rules.map((r, i) => ({ ...r, id: i + 1 }));
}

function validateClickRules(
  rulesRaw: unknown[],
  warnings: ValidationIssue[],
): { ok: true; rules: ClickRuleConfig[] } | { ok: false; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (rulesRaw.length > MAX_RULES) {
    errors.push(err("rules", "TOO_MANY", `规则数量不能超过 ${MAX_RULES}`));
    return { ok: false, errors };
  }
  const rules: ClickRuleConfig[] = [];
  for (let i = 0; i < rulesRaw.length; i++) {
    const path = `rules[${i}]`;
    const r = rulesRaw[i];
    if (!r || typeof r !== "object") {
      errors.push(err(path, "INVALID_RULE", "规则必须是对象"));
      continue;
    }
    const rule = r as Partial<ClickRuleConfig>;
    if (!rule.title?.toString().trim()) {
      errors.push(err(`${path}.title`, "REQUIRED", "标题不能为空"));
    }
    if (!CLICK_MATCH_SET.has(rule.type as RuleType)) {
      errors.push(err(`${path}.type`, "INVALID_MATCH", "匹配类型无效"));
    }
    if (rule.op != null && !OP_SET.has(rule.op as RuleOp)) {
      errors.push(err(`${path}.op`, "INVALID_OP", "操作符无效"));
    }
    if (!Array.isArray(rule.values)) {
      errors.push(err(`${path}.values`, "INVALID_VALUES", "values 必须是字符串数组"));
    } else if (rule.values.map(String).map((s) => s.trim()).filter(Boolean).length === 0) {
      warnings.push(err(`${path}.values`, "EMPTY_VALUES", "匹配值为空，规则不会生效"));
    }
    if (rule.type === RuleType.Attribute && !(rule as { attr?: string }).attr?.trim()) {
      errors.push(err(`${path}.attr`, "REQUIRED", "属性匹配必须填写 attr"));
    }
    try {
      const normalized = {
        ...rule,
        id: typeof rule.id === "number" && rule.id > 0 ? rule.id : i + 1,
        title: rule.title?.toString().trim() || `规则 ${i + 1}`,
      } as ClickRuleConfig;
      assertClickRuleConfig(normalized, i);
      rules.push(normalized);
    } catch (e) {
      errors.push(err(path, "ASSERT", e instanceof Error ? e.message : "规则校验失败"));
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rules: reassignIds(rules) };
}

function validateProbeRules(
  rulesRaw: unknown[],
  warnings: ValidationIssue[],
): { ok: true; rules: ProbeRule[] } | { ok: false; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (rulesRaw.length > MAX_RULES) {
    errors.push(err("rules", "TOO_MANY", `规则数量不能超过 ${MAX_RULES}`));
    return { ok: false, errors };
  }
  const rules: ProbeRule[] = [];
  for (let i = 0; i < rulesRaw.length; i++) {
    const path = `rules[${i}]`;
    const r = rulesRaw[i];
    if (!r || typeof r !== "object") {
      errors.push(err(path, "INVALID_RULE", "规则必须是对象"));
      continue;
    }
    const partial = r as Partial<ProbeRule>;
    if (!partial.title?.toString().trim()) {
      errors.push(err(`${path}.title`, "REQUIRED", "标题不能为空"));
    }
    if (!PROBE_CATEGORY_SET.has(partial.category as ProbeCategory)) {
      errors.push(err(`${path}.category`, "INVALID_CATEGORY", "探测类别无效"));
    }
    if (!Array.isArray(partial.values)) {
      errors.push(err(`${path}.values`, "INVALID_VALUES", "values 必须是字符串数组"));
    } else if (partial.values.map(String).map((s) => s.trim()).filter(Boolean).length === 0) {
      warnings.push(err(`${path}.values`, "EMPTY_VALUES", "选择器为空，规则不会生效"));
    }
    if (
      partial.category === ProbeCategory.Layout &&
      !Object.values(ProbeLayoutRole).includes(partial.role as ProbeLayoutRole)
    ) {
      errors.push(err(`${path}.role`, "REQUIRED", "布局类规则必须指定 role"));
    }
    const normalized = normalizeProbeRule(
      {
        ...partial,
        type: ProbeRuleType.Selector,
        op: (partial.op as RuleOp) ?? RuleOp.Equals,
        action: partial.action as ProbeAction | undefined,
      },
      i,
    );
    rules.push(normalized);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rules: reassignIds(rules) };
}

function validateIgnoreRules(
  rulesRaw: unknown[],
  warnings: ValidationIssue[],
): { ok: true; rules: IgnoreRequestRule[] } | { ok: false; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (rulesRaw.length > MAX_RULES) {
    errors.push(err("rules", "TOO_MANY", `规则数量不能超过 ${MAX_RULES}`));
    return { ok: false, errors };
  }
  const rules: IgnoreRequestRule[] = [];
  for (let i = 0; i < rulesRaw.length; i++) {
    const path = `rules[${i}]`;
    const r = rulesRaw[i];
    if (!r || typeof r !== "object") {
      errors.push(err(path, "INVALID_RULE", "规则必须是对象"));
      continue;
    }
    const partial = r as Partial<IgnoreRequestRule>;
    if (!partial.title?.toString().trim()) {
      errors.push(err(`${path}.title`, "REQUIRED", "标题不能为空"));
    }
    if (!IGNORE_MATCH_SET.has(partial.type as IgnoreRequestType)) {
      errors.push(err(`${path}.type`, "INVALID_MATCH", "忽略请求类型无效"));
    }
    if (!Array.isArray(partial.values)) {
      errors.push(err(`${path}.values`, "INVALID_VALUES", "values 必须是字符串数组"));
    } else if (partial.values.map(String).map((s) => s.trim()).filter(Boolean).length === 0) {
      warnings.push(err(`${path}.values`, "EMPTY_VALUES", "匹配值为空，规则不会生效"));
    } else {
      for (let j = 0; j < partial.values.length; j++) {
        const v = String(partial.values[j] ?? "").trim();
        if (!v) continue;
        try {
          void new RegExp(v, "i");
        } catch {
          warnings.push(
            err(`${path}.values[${j}]`, "BAD_REGEX", `模式无法编译为正则，将按包含匹配：${v}`),
          );
        }
      }
    }
    rules.push(normalizeIgnoreRequestRule(partial, i));
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, rules: reassignIds(rules) };
}

/**
 * Validate a rule JSON file against the expected module (current drawer tab).
 * Module is never read from individual rules — only file.type (or inference).
 */
export function validateRuleFile(
  raw: unknown,
  expected: RuleModuleType,
): ValidateRuleFileResult {
  const warnings: ValidationIssue[] = [];
  const obj = asObject(raw);
  if (!obj) {
    return {
      ok: false,
      errors: [err("", "NOT_OBJECT", "配置必须是 JSON 对象")],
      warnings,
    };
  }

  if (!Array.isArray(obj.rules)) {
    return {
      ok: false,
      errors: [err("rules", "REQUIRED", "缺少 rules 数组")],
      warnings,
    };
  }

  const inferred = inferModule(obj);
  const declared =
    typeof obj.type === "string" && RULE_MODULE_SET.has(obj.type)
      ? (obj.type as RuleModuleType)
      : null;

  if (declared && declared !== expected) {
    return {
      ok: false,
      errors: [
        err(
          "type",
          "TYPE_MISMATCH",
          `文件类型为「${RULE_MODULE_LABEL[declared]}」，当前模块是「${RULE_MODULE_LABEL[expected]}」`,
        ),
      ],
      warnings,
    };
  }

  if (!declared && inferred && inferred !== expected) {
    return {
      ok: false,
      errors: [
        err(
          "type",
          "TYPE_MISMATCH",
          `根据内容推断为「${RULE_MODULE_LABEL[inferred]}」，与当前「${RULE_MODULE_LABEL[expected]}」不符`,
        ),
      ],
      warnings,
    };
  }

  if (!declared && !inferred) {
    warnings.push(
      err("type", "TYPE_INFERRED", `未声明 type，将按当前模块「${RULE_MODULE_LABEL[expected]}」导入`),
    );
  }

  if (expected === RuleModuleType.Whitelist || expected === RuleModuleType.Blacklist) {
    const result = validateClickRules(obj.rules as unknown[], warnings);
    if (!result.ok) return { ok: false, errors: result.errors, warnings };
    if (expected === RuleModuleType.Whitelist) {
      return {
        ok: true,
        module: expected,
        warnings,
        file: {
          version: 3,
          type: RuleModuleType.Whitelist,
          defaultWeight: Number(obj.defaultWeight ?? 0),
          rules: result.rules,
        },
      };
    }
    return {
      ok: true,
      module: expected,
      warnings,
      file: {
        version: 3,
        type: RuleModuleType.Blacklist,
        rules: result.rules,
      },
    };
  }

  if (expected === RuleModuleType.Probe) {
    const result = validateProbeRules(obj.rules as unknown[], warnings);
    if (!result.ok) return { ok: false, errors: result.errors, warnings };
    const file: ProbeSelectorsConfig = {
      version: 2,
      type: RuleModuleType.Probe,
      rules: result.rules,
    };
    return { ok: true, module: expected, warnings, file };
  }

  const result = validateIgnoreRules(obj.rules as unknown[], warnings);
  if (!result.ok) return { ok: false, errors: result.errors, warnings };
  const file: IgnoreRequestRuleFile = {
    version: 1,
    type: RuleModuleType.IgnoreRequest,
    rules: result.rules,
  };
  return { ok: true, module: expected, warnings, file };
}

export function parseRuleJsonText(
  text: string,
  expected: RuleModuleType,
): ValidateRuleFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (e) {
    return {
      ok: false,
      errors: [
        err(
          "",
          "BAD_JSON",
          `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
        ),
      ],
      warnings: [],
    };
  }
  return validateRuleFile(raw, expected);
}

/** Merge imported rules into existing (append + reassign ids). */
export function mergeRuleLists<T extends { id: number; title: string; values: string[]; type: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const key = (r: T) => `${r.type}|${r.title}|${JSON.stringify(r.values)}`;
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const r of incoming) {
    if (seen.has(key(r))) continue;
    seen.add(key(r));
    merged.push(r);
  }
  return reassignIds(merged);
}
