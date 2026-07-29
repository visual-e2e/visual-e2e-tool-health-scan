import { Select, Space } from "antd";
import {
  PROBE_ACTION_LABEL,
  PROBE_CATEGORY_LABEL,
  PROBE_LAYOUT_ROLE_LABEL,
  ProbeAction,
  ProbeCategory,
  ProbeLayoutRole,
  ProbeRuleType,
  RuleModuleType,
  RuleOp,
  type ProbeRule,
  type ProbeSelectorsConfig,
} from "../../types";
import { ValuesInput } from "./RuleEditors";
import { RuleCard, RuleCardList } from "./RuleCard";

const OP_OPTIONS = [
  { value: RuleOp.Equals, label: "等于" },
  { value: RuleOp.Contains, label: "包含" },
];

export const PROBE_CATEGORY_OPTIONS = Object.values(ProbeCategory).map((category) => ({
  value: category,
  label: PROBE_CATEGORY_LABEL[category],
}));

export const PROBE_LAYOUT_ROLE_OPTIONS = Object.values(ProbeLayoutRole).map((role) => ({
  value: role,
  label: PROBE_LAYOUT_ROLE_LABEL[role],
}));

export const PROBE_ACTION_OPTIONS = Object.values(ProbeAction).map((action) => ({
  value: action,
  label: PROBE_ACTION_LABEL[action],
}));

export function nextProbeRuleId(rules: ProbeRule[]): number {
  return rules.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

export function createProbeRule(partial: {
  id: number;
  title: string;
  category: ProbeCategory;
  role?: ProbeLayoutRole;
  action?: ProbeAction;
  description?: string;
}): ProbeRule {
  const category = partial.category;
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description,
    category,
    role: category === ProbeCategory.Layout ? partial.role ?? ProbeLayoutRole.Sample : undefined,
    action:
      partial.action ??
      (category === ProbeCategory.Hover
        ? ProbeAction.Hover
        : category === ProbeCategory.Layout
          ? undefined
          : ProbeAction.Click),
    type: ProbeRuleType.Selector,
    op: RuleOp.Equals,
    values: [],
  };
}

function withProbeEnvelope(rules: ProbeRule[]): ProbeSelectorsConfig {
  return { version: 2, type: RuleModuleType.Probe, rules };
}

interface ProbeSelectorsEditorProps {
  value: ProbeSelectorsConfig;
  disabled?: boolean;
  onChange: (next: ProbeSelectorsConfig) => void;
  onEditMeta: (rule: ProbeRule) => void;
  onDelete: (rule: ProbeRule) => void;
}

export function ProbeSelectorsEditor({
  value,
  disabled,
  onChange,
  onEditMeta,
  onDelete,
}: ProbeSelectorsEditorProps) {
  const rules = value.rules ?? [];

  const update = (index: number, rule: ProbeRule) => {
    onChange(withProbeEnvelope(rules.map((r, i) => (i === index ? rule : r))));
  };

  return (
    <RuleCardList empty={rules.length === 0}>
      {rules.map((rule, index) => {
        const tags = [
          { text: PROBE_CATEGORY_LABEL[rule.category], color: "blue" },
          ...(rule.role ? [{ text: PROBE_LAYOUT_ROLE_LABEL[rule.role] }] : []),
          ...(rule.action ? [{ text: PROBE_ACTION_LABEL[rule.action] }] : []),
        ];
        return (
          <RuleCard
            key={rule.id}
            title={rule.title}
            description={rule.description}
            tags={tags}
            disabled={disabled}
            onEdit={() => onEditMeta(rule)}
            onDelete={() => onDelete(rule)}
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              <Space wrap>
                <span>选择器</span>
                <Select
                  size="small"
                  style={{ width: 100 }}
                  disabled={disabled}
                  value={rule.op}
                  options={OP_OPTIONS}
                  onChange={(op) => update(index, { ...rule, op })}
                />
              </Space>
              <ValuesInput
                value={rule.values}
                disabled={disabled}
                placeholder="输入 CSS selector，如 button:not([disabled])"
                onChange={(values) => update(index, { ...rule, values })}
              />
            </Space>
          </RuleCard>
        );
      })}
    </RuleCardList>
  );
}
