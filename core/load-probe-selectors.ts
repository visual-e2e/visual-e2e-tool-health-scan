import probeSelectorsJson from "../config/probe-selectors.json" with { type: "json" };
import { RuleOp } from "./enums/rule.js";
import { RuleModuleType } from "./enums/rule-module.js";
import {
  ProbeAction,
  ProbeCategory,
  ProbeLayoutRole,
  ProbeRuleType,
  type LegacyProbeSelectorsConfig,
  type ProbeRule,
  type ProbeSelectorsConfig,
  type ResolvedProbeSelectors,
} from "./types/probe-selectors.js";

const CATEGORY_SET = new Set(Object.values(ProbeCategory));
const ROLE_SET = new Set(Object.values(ProbeLayoutRole));
const ACTION_SET = new Set(Object.values(ProbeAction));
const OP_SET = new Set(Object.values(RuleOp));

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function toCategory(raw: unknown): ProbeCategory {
  return CATEGORY_SET.has(raw as ProbeCategory) ? (raw as ProbeCategory) : ProbeCategory.Click;
}

function toRole(raw: unknown): ProbeLayoutRole | undefined {
  return ROLE_SET.has(raw as ProbeLayoutRole) ? (raw as ProbeLayoutRole) : undefined;
}

function toAction(raw: unknown, category: ProbeCategory): ProbeAction | undefined {
  if (ACTION_SET.has(raw as ProbeAction)) return raw as ProbeAction;
  if (category === ProbeCategory.Hover) return ProbeAction.Hover;
  if (category === ProbeCategory.Click || category === ProbeCategory.Nav) return ProbeAction.Click;
  return undefined;
}

function toOp(raw: unknown): RuleOp {
  return OP_SET.has(raw as RuleOp) ? (raw as RuleOp) : RuleOp.Equals;
}

export function normalizeProbeRule(rule: Partial<ProbeRule>, index: number): ProbeRule {
  const category = toCategory(rule.category);
  const role =
    category === ProbeCategory.Layout
      ? toRole(rule.role) ?? ProbeLayoutRole.Sample
      : undefined;
  return {
    id: typeof rule.id === "number" && rule.id > 0 ? rule.id : index + 1,
    title: rule.title?.trim() || `探测规则 ${index + 1}`,
    description: rule.description?.trim() || undefined,
    category,
    role,
    action: toAction(rule.action, category),
    type: ProbeRuleType.Selector,
    op: toOp(rule.op),
    values: asStringList(rule.values),
  };
}

function ruleFromLegacy(
  id: number,
  title: string,
  category: ProbeCategory,
  values: string[],
  extra?: Partial<ProbeRule>,
): ProbeRule {
  return normalizeProbeRule(
    {
      id,
      title,
      category,
      values,
      type: ProbeRuleType.Selector,
      op: RuleOp.Equals,
      ...extra,
    },
    id - 1,
  );
}

/** Migrate v1 flat string[] groups → v2 rules. */
export function migrateLegacyProbeSelectors(
  legacy: LegacyProbeSelectorsConfig,
): ProbeSelectorsConfig {
  const rules: ProbeRule[] = [];
  let id = 1;
  const clickable = asStringList(legacy.clickable);
  if (clickable.length) {
    rules.push(ruleFromLegacy(id++, "可点击元素", ProbeCategory.Click, clickable, {
      action: ProbeAction.Click,
      description: "从旧版 clickable 迁移",
    }));
  }
  const nav = unique([
    ...asStringList(legacy.navTop),
    ...asStringList(legacy.navSide),
    ...asStringList(legacy.navActive),
  ]);
  if (nav.length) {
    rules.push(ruleFromLegacy(id++, "导航与菜单", ProbeCategory.Nav, nav, {
      action: ProbeAction.Click,
      description: "从旧版 navTop/navSide/navActive 合并迁移",
    }));
  }
  const overlay = asStringList(legacy.overlay);
  if (overlay.length) {
    rules.push(
      ruleFromLegacy(id++, "浮层与弹框", ProbeCategory.Layout, overlay, {
        role: ProbeLayoutRole.Overlay,
      }),
    );
  }
  const close = asStringList(legacy.overlayClose);
  if (close.length) {
    rules.push(
      ruleFromLegacy(id++, "浮层关闭控件", ProbeCategory.Layout, close, {
        role: ProbeLayoutRole.Close,
      }),
    );
  }
  const title = asStringList(legacy.overlayTitle);
  if (title.length) {
    rules.push(
      ruleFromLegacy(id++, "浮层标题", ProbeCategory.Layout, title, {
        role: ProbeLayoutRole.Title,
      }),
    );
  }
  const sample = asStringList(legacy.layoutProbe);
  if (sample.length) {
    rules.push(
      ruleFromLegacy(id++, "布局抽样节点", ProbeCategory.Layout, sample, {
        role: ProbeLayoutRole.Sample,
      }),
    );
  }
  return { version: 2, type: RuleModuleType.Probe, rules };
}

export function parseProbeSelectorsFile(raw: unknown): ProbeSelectorsConfig {
  if (!raw || typeof raw !== "object") {
    return getDefaultProbeSelectors();
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.rules)) {
    return {
      version: 2,
      type: RuleModuleType.Probe,
      rules: (obj.rules as Partial<ProbeRule>[]).map((r, i) => normalizeProbeRule(r, i)),
    };
  }
  // v1 flat keys
  if (
    "clickable" in obj ||
    "navTop" in obj ||
    "overlay" in obj ||
    "layoutProbe" in obj
  ) {
    const migrated = migrateLegacyProbeSelectors(obj as LegacyProbeSelectorsConfig);
    return { ...migrated, type: RuleModuleType.Probe };
  }
  return getDefaultProbeSelectors();
}

export function normalizeProbeSelectors(
  partial?: Partial<ProbeSelectorsConfig> | LegacyProbeSelectorsConfig | null,
): ProbeSelectorsConfig {
  if (!partial) return getDefaultProbeSelectors();
  return parseProbeSelectorsFile(partial);
}

function valuesForCategory(rules: ProbeRule[], category: ProbeCategory): string[] {
  return unique(
    rules.filter((r) => r.category === category).flatMap((r) => r.values),
  );
}

function valuesForLayoutRole(rules: ProbeRule[], role: ProbeLayoutRole): string[] {
  return unique(
    rules
      .filter((r) => r.category === ProbeCategory.Layout && r.role === role)
      .flatMap((r) => r.values),
  );
}

/** Flatten rules into selector lists for probes. */
export function resolveProbeSelectors(
  config: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): ResolvedProbeSelectors {
  const rules = config.rules ?? [];
  const click = valuesForCategory(rules, ProbeCategory.Click);
  const nav = valuesForCategory(rules, ProbeCategory.Nav);
  const hover = valuesForCategory(rules, ProbeCategory.Hover);
  return {
    // Click probe collects click ∪ nav
    clickable: unique([...click, ...nav]),
    hoverable: hover,
    nav,
    overlay: valuesForLayoutRole(rules, ProbeLayoutRole.Overlay),
    overlayClose: valuesForLayoutRole(rules, ProbeLayoutRole.Close),
    overlayTitle: valuesForLayoutRole(rules, ProbeLayoutRole.Title),
    layoutSample: valuesForLayoutRole(rules, ProbeLayoutRole.Sample),
  };
}

export function getDefaultProbeSelectors(): ProbeSelectorsConfig {
  return parseProbeSelectorsFile(probeSelectorsJson);
}

/** Alias: platform defaults are already generic HTML/ARIA. */
export function getGenericProbeSelectors(): ProbeSelectorsConfig {
  return getDefaultProbeSelectors();
}

export function getDefaultProbeRules(): ProbeRule[] {
  return getDefaultProbeSelectors().rules.map((r) => ({ ...r, values: [...r.values] }));
}
