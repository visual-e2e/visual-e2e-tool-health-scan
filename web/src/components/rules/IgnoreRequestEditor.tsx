import { Select, Space } from "antd";
import {
  IGNORE_REQUEST_TYPE_LABEL,
  IgnoreRequestType,
  RuleOp,
  type IgnoreRequestRule,
} from "../../types";
import { ValuesInput } from "./RuleEditors";
import { RuleCard, RuleCardList } from "./RuleCard";

const OP_OPTIONS = [
  { value: RuleOp.Contains, label: "包含" },
  { value: RuleOp.Equals, label: "等于" },
];

export const IGNORE_REQUEST_TYPE_OPTIONS = Object.values(IgnoreRequestType).map((type) => ({
  value: type,
  label: IGNORE_REQUEST_TYPE_LABEL[type],
}));

export function nextIgnoreRequestRuleId(rules: IgnoreRequestRule[]): number {
  return rules.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

export function createIgnoreRequestRule(partial: {
  id: number;
  title: string;
  type: IgnoreRequestType;
  description?: string;
}): IgnoreRequestRule {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description,
    type: partial.type,
    op: RuleOp.Contains,
    values: [],
  };
}

interface IgnoreRequestRuleListProps {
  rules: IgnoreRequestRule[];
  disabled?: boolean;
  onChange: (rules: IgnoreRequestRule[]) => void;
  onEditMeta: (rule: IgnoreRequestRule) => void;
  onDelete: (rule: IgnoreRequestRule) => void;
}

export function IgnoreRequestRuleList({
  rules,
  disabled,
  onChange,
  onEditMeta,
  onDelete,
}: IgnoreRequestRuleListProps) {
  const update = (index: number, rule: IgnoreRequestRule) => {
    onChange(rules.map((r, i) => (i === index ? rule : r)));
  };

  return (
    <RuleCardList empty={rules.length === 0}>
      {rules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          title={rule.title}
          description={rule.description}
          tags={[{ text: IGNORE_REQUEST_TYPE_LABEL[rule.type], color: "blue" }]}
          disabled={disabled}
          onEdit={() => onEditMeta(rule)}
          onDelete={() => onDelete(rule)}
        >
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space wrap>
              <span>请求 URL</span>
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
              placeholder="输入匹配模式，如 google-analytics"
              onChange={(values) => update(index, { ...rule, values })}
            />
          </Space>
        </RuleCard>
      ))}
    </RuleCardList>
  );
}
