import { RuleListType, type ClickRuleConfig } from "../../types";
import { RuleEditorBody, RULE_TYPE_LABEL } from "./RuleEditors";
import { RuleCard, RuleCardList } from "./RuleCard";

interface RuleListProps {
  rules: ClickRuleConfig[];
  list: RuleListType;
  disabled?: boolean;
  onEditMeta: (rule: ClickRuleConfig) => void;
  onDelete: (rule: ClickRuleConfig) => void;
  onChange: (rules: ClickRuleConfig[]) => void;
}

export function RuleList({ rules, list, disabled, onEditMeta, onDelete, onChange }: RuleListProps) {
  const update = (index: number, rule: ClickRuleConfig) => {
    onChange(rules.map((r, i) => (i === index ? rule : r)));
  };

  return (
    <RuleCardList empty={rules.length === 0}>
      {rules.map((rule, index) => (
        <RuleCard
          key={rule.id}
          title={rule.title}
          description={rule.description}
          tags={[{ text: RULE_TYPE_LABEL[rule.type], color: "blue" }]}
          disabled={disabled}
          onEdit={() => onEditMeta(rule)}
          onDelete={() => onDelete(rule)}
        >
          <RuleEditorBody
            rule={rule}
            disabled={disabled}
            showWeight={list === RuleListType.Whitelist}
            onChange={(next) => update(index, next)}
          />
        </RuleCard>
      ))}
    </RuleCardList>
  );
}
