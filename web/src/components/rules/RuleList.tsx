import { Button, Card, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { RuleListType, type ClickRuleConfig } from "../../types";
import {
  RuleEditorBody,
  RULE_TYPE_LABEL,
} from "./RuleEditors";

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
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      {rules.length === 0 && (
        <Typography.Text type="secondary">暂无规则，请点击右上角“添加规则”</Typography.Text>
      )}
      {rules.map((rule, index) => (
        <Card
          key={rule.id}
          size="small"
          title={
            <Space>
              <Tag color="blue">{RULE_TYPE_LABEL[rule.type]}</Tag>
              <Typography.Text strong>{rule.title}</Typography.Text>
              {rule.description ? (
                <Typography.Text type="secondary">{rule.description}</Typography.Text>
              ) : null}
            </Space>
          }
          extra={
            <Space size={4}>
              <Button
                type="text"
                size="small"
                className="rule-action-edit"
                icon={<EditOutlined />}
                disabled={disabled}
                onClick={() => onEditMeta(rule)}
              />
              <Button
                type="text"
                size="small"
                className="rule-action-delete"
                icon={<DeleteOutlined />}
                disabled={disabled}
                onClick={() => onDelete(rule)}
              />
            </Space>
          }
        >
          <RuleEditorBody
            rule={rule}
            disabled={disabled}
            showWeight={list === RuleListType.Whitelist}
            onChange={(next) => update(index, next)}
          />
        </Card>
      ))}
    </Space>
  );
}
