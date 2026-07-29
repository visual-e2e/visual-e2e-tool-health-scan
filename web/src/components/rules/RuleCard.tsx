import { Button, Card, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

export interface RuleCardTag {
  text: string;
  color?: string;
}

interface RuleCardProps {
  title: string;
  description?: string;
  tags?: RuleCardTag[];
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}

/** Shared rule card shell — module comes from drawer tab, not the rule body. */
export function RuleCard({
  title,
  description,
  tags,
  disabled,
  onEdit,
  onDelete,
  children,
}: RuleCardProps) {
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          {tags?.map((t) => (
            <Tag key={t.text} color={t.color}>
              {t.text}
            </Tag>
          ))}
          <Typography.Text strong>{title}</Typography.Text>
          {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
        </Space>
      }
      extra={
        <Space size={4}>
          {onEdit ? (
            <Button
              type="text"
              size="small"
              className="rule-action-edit"
              icon={<EditOutlined />}
              disabled={disabled}
              onClick={onEdit}
            />
          ) : null}
          {onDelete ? (
            <Button
              type="text"
              size="small"
              className="rule-action-delete"
              icon={<DeleteOutlined />}
              disabled={disabled}
              onClick={onDelete}
            />
          ) : null}
        </Space>
      }
    >
      {children}
    </Card>
  );
}

interface RuleCardListProps {
  empty?: boolean;
  children: ReactNode;
}

export function RuleCardList({ empty, children }: RuleCardListProps) {
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      {empty ? (
        <Typography.Text type="secondary">暂无规则，请点击右上角“添加规则”</Typography.Text>
      ) : null}
      {children}
    </Space>
  );
}
