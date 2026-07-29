import ignoreRequestJson from "../config/url-exclude.json" with { type: "json" };
import { RuleOp } from "./enums/rule.js";
import { RuleModuleType } from "./enums/rule-module.js";
import {
  IGNORE_REQUEST_RESOURCE_TYPES,
  IgnoreRequestType,
  type IgnoreRequestRule,
  type IgnoreRequestRuleFile,
} from "./types/ignore-request.js";

const TYPE_SET = new Set(Object.values(IgnoreRequestType));
const OP_SET = new Set(Object.values(RuleOp));

function toOp(raw: unknown): RuleOp {
  return OP_SET.has(raw as RuleOp) ? (raw as RuleOp) : RuleOp.Contains;
}

function toType(raw: unknown): IgnoreRequestType {
  return TYPE_SET.has(raw as IgnoreRequestType)
    ? (raw as IgnoreRequestType)
    : IgnoreRequestType.Domain;
}

export function normalizeIgnoreRequestRule(
  rule: Partial<IgnoreRequestRule>,
  index: number,
): IgnoreRequestRule {
  return {
    id: typeof rule.id === "number" && rule.id > 0 ? rule.id : index + 1,
    title: rule.title?.trim() || `忽略规则 ${index + 1}`,
    description: rule.description?.trim() || undefined,
    type: toType(rule.type),
    op: toOp(rule.op),
    values: Array.isArray(rule.values)
      ? rule.values.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

/** Accept v1 { rules } or legacy string[] of URL patterns. */
export function parseIgnoreRequestFile(raw: unknown): IgnoreRequestRuleFile {
  if (Array.isArray(raw)) {
    const values = raw.map(String).map((s) => s.trim()).filter(Boolean);
    return {
      version: 1,
      type: RuleModuleType.IgnoreRequest,
      rules: values.length
        ? [
            normalizeIgnoreRequestRule(
              {
                id: 1,
                title: "统计与埋点域名",
                type: IgnoreRequestType.Domain,
                op: RuleOp.Contains,
                values,
                description: "从旧版列表迁移",
              },
              0,
            ),
          ]
        : [],
    };
  }

  const file = raw as Partial<IgnoreRequestRuleFile>;
  const rules = Array.isArray(file.rules) ? file.rules : [];
  return {
    version: 1,
    type: RuleModuleType.IgnoreRequest,
    rules: rules.map((r, i) => normalizeIgnoreRequestRule(r, i)),
  };
}

export function getDefaultIgnoreRequestFile(): IgnoreRequestRuleFile {
  return parseIgnoreRequestFile(ignoreRequestJson);
}

export function getDefaultIgnoreRequestRules(): IgnoreRequestRule[] {
  return getDefaultIgnoreRequestFile().rules.map((r) => ({ ...r, values: [...r.values] }));
}

/** @deprecated prefer getDefaultIgnoreRequestRules — flattens values for legacy callers */
export function loadUrlExclude(): string[] {
  return getDefaultIgnoreRequestRules().flatMap((r) => r.values);
}

function matchValue(url: string, op: RuleOp, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (op === RuleOp.Equals) {
    return url.toLowerCase() === v.toLowerCase();
  }
  try {
    return new RegExp(v, "i").test(url);
  } catch {
    return url.toLowerCase().includes(v.toLowerCase());
  }
}

export function isIgnoredRequest(
  url: string,
  resourceType: string,
  rules: IgnoreRequestRule[],
): boolean {
  for (const rule of rules) {
    if (!rule.values.length) continue;
    const types = IGNORE_REQUEST_RESOURCE_TYPES[rule.type];
    if (types && !types.includes(resourceType)) continue;
    if (rule.values.some((v) => matchValue(url, rule.op, v))) return true;
  }
  return false;
}
