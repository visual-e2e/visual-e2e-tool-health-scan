import { Button, Input, InputNumber, Modal, Select, Space, Tag } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useState, type MouseEvent } from "react";
import { RuleListType, RuleOp, RuleType } from "../../types";
import type {
  AttributeRuleConfig,
  ClickRuleConfig,
  ParentRuleConfig,
  SelectorRuleConfig,
  TextRuleConfig,
} from "../../types";

const OP_OPTIONS = [
  { value: RuleOp.Contains, label: "包含" },
  { value: RuleOp.Equals, label: "等于" },
];

function WeightInput({
  value,
  disabled,
  onChange,
}: {
  value?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <span style={{ marginRight: 8 }}>权重</span>
      <InputNumber
        size="small"
        style={{ width: 96 }}
        min={-100}
        max={100}
        disabled={disabled}
        value={value ?? 0}
        onChange={(v) => onChange(Number(v ?? 0))}
      />
    </>
  );
}

export function ValuesInput({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);

  const submitDraft = () => {
    const next = draft.trim();
    if (!next) return;
    if (editingTag == null && value.includes(next)) {
      setDraft("");
      setModalOpen(false);
      return;
    }
    if (editingTag == null) {
      onChange([...value, next]);
    } else {
      if (next !== editingTag && value.includes(next)) {
        setDraft("");
        setEditingTag(null);
        setModalOpen(false);
        return;
      }
      onChange(value.map((v) => (v === editingTag ? next : v)));
    }
    setDraft("");
    setEditingTag(null);
    setModalOpen(false);
  };

  const removeAt = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };

  const openCreateModal = () => {
    setEditingTag(null);
    setDraft("");
    setModalOpen(true);
  };

  const openEditModal = (tag: string) => {
    setEditingTag(tag);
    setDraft(tag);
    setModalOpen(true);
  };

  return (
    <div style={{ width: "100%" }}>
      <Space size={[6, 6]} wrap style={{ width: "100%" }}>
        {value.map((tag) => (
          <Tag
            key={tag}
            className={disabled ? "rule-value-tag" : "rule-value-tag rule-value-tag-editable"}
            closable={!disabled}
            closeIcon={
              <CloseOutlined
                className="rule-value-remove"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            }
            onClose={(e: MouseEvent<HTMLElement>) => {
              e.preventDefault();
              removeAt(tag);
            }}
            onClick={() => !disabled && openEditModal(tag)}
          >
            {tag}
          </Tag>
        ))}
        {!disabled ? (
          <Button
            size="small"
            type="text"
            className="rule-value-add"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          />
        ) : null}
      </Space>
      <Modal
        title={editingTag == null ? "添加标签" : "编辑标签"}
        open={modalOpen}
        okText={editingTag == null ? "添加" : "保存"}
        onOk={submitDraft}
        onCancel={() => {
          setModalOpen(false);
          setDraft("");
          setEditingTag(null);
        }}
      >
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        />
      </Modal>
    </div>
  );
}

interface TextRuleEditorProps {
  rule: TextRuleConfig;
  disabled?: boolean;
  showWeight?: boolean;
  onChange: (rule: TextRuleConfig) => void;
}

export function TextRuleEditor({ rule, disabled, showWeight, onChange }: TextRuleEditorProps) {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap>
        <span>元素文本内容</span>
        <Select
          size="small"
          style={{ width: 100 }}
          disabled={disabled}
          value={rule.op}
          options={OP_OPTIONS}
          onChange={(op) => onChange({ ...rule, op })}
        />
        {showWeight && (
          <WeightInput
            value={rule.weight}
            disabled={disabled}
            onChange={(weight) => onChange({ ...rule, weight })}
          />
        )}
      </Space>
      <ValuesInput
        value={rule.values}
        disabled={disabled}
        placeholder="输入文案后回车添加"
        onChange={(values) => onChange({ ...rule, values })}
      />
    </Space>
  );
}

interface AttributeRuleEditorProps {
  rule: AttributeRuleConfig;
  disabled?: boolean;
  showWeight?: boolean;
  onChange: (rule: AttributeRuleConfig) => void;
}

export function AttributeRuleEditor({
  rule,
  disabled,
  showWeight,
  onChange,
}: AttributeRuleEditorProps) {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap>
        <span>元素属性</span>
        <Input
          size="small"
          style={{ width: 220 }}
          disabled={disabled}
          value={rule.attr}
          placeholder="请输入属性名，如 id / data-testid"
          onChange={(e) => onChange({ ...rule, attr: e.target.value })}
        />
        <Select
          size="small"
          style={{ width: 88 }}
          disabled={disabled}
          value={rule.op}
          options={OP_OPTIONS}
          onChange={(op) => onChange({ ...rule, op })}
        />
        {showWeight && (
          <WeightInput
            value={rule.weight}
            disabled={disabled}
            onChange={(weight) => onChange({ ...rule, weight })}
          />
        )}
      </Space>
      <ValuesInput
        value={rule.values}
        disabled={disabled}
        placeholder="属性值，回车添加"
        onChange={(values) => onChange({ ...rule, values })}
      />
    </Space>
  );
}

interface SelectorLikeRuleEditorProps<T extends SelectorRuleConfig | ParentRuleConfig> {
  rule: T;
  disabled?: boolean;
  showWeight?: boolean;
  placeholder: string;
  prefixLabel: string;
  onChange: (rule: T) => void;
}

function SelectorLikeRuleEditor<T extends SelectorRuleConfig | ParentRuleConfig>({
  rule,
  disabled,
  showWeight,
  placeholder,
  prefixLabel,
  onChange,
}: SelectorLikeRuleEditorProps<T>) {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space wrap>
        <span>{prefixLabel}</span>
        <Select
          size="small"
          style={{ width: 100 }}
          disabled={disabled}
          value={rule.op}
          options={OP_OPTIONS}
          onChange={(op) => onChange({ ...rule, op } as T)}
        />
        {showWeight && (
          <WeightInput
            value={rule.weight}
            disabled={disabled}
            onChange={(weight) => onChange({ ...rule, weight } as T)}
          />
        )}
      </Space>
      <ValuesInput
        value={rule.values}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(values) => onChange({ ...rule, values } as T)}
      />
    </Space>
  );
}

export function SelectorRuleEditor(props: {
  rule: SelectorRuleConfig;
  disabled?: boolean;
  showWeight?: boolean;
  onChange: (rule: SelectorRuleConfig) => void;
}) {
  return (
    <SelectorLikeRuleEditor
      {...props}
      prefixLabel="元素选择器"
      placeholder="元素 selector，如 a thy-nav-item"
    />
  );
}

export function ParentRuleEditor(props: {
  rule: ParentRuleConfig;
  disabled?: boolean;
  showWeight?: boolean;
  onChange: (rule: ParentRuleConfig) => void;
}) {
  return (
    <SelectorLikeRuleEditor
      {...props}
      prefixLabel="元素父级链路"
      placeholder="父级链 selector，如 ant-modal"
    />
  );
}

export function RuleEditorBody({
  rule,
  disabled,
  showWeight,
  onChange,
}: {
  rule: ClickRuleConfig;
  disabled?: boolean;
  showWeight?: boolean;
  onChange: (rule: ClickRuleConfig) => void;
}) {
  switch (rule.type) {
    case RuleType.Text:
      return (
        <TextRuleEditor
          rule={rule}
          disabled={disabled}
          showWeight={showWeight}
          onChange={onChange}
        />
      );
    case RuleType.Attribute:
      return (
        <AttributeRuleEditor
          rule={rule}
          disabled={disabled}
          showWeight={showWeight}
          onChange={onChange}
        />
      );
    case RuleType.Selector:
      return (
        <SelectorRuleEditor
          rule={rule}
          disabled={disabled}
          showWeight={showWeight}
          onChange={onChange}
        />
      );
    case RuleType.Parent:
      return (
        <ParentRuleEditor
          rule={rule}
          disabled={disabled}
          showWeight={showWeight}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

export const RULE_TYPE_LABEL: Record<ClickRuleConfig["type"], string> = {
  [RuleType.Text]: "文本",
  [RuleType.Selector]: "元素",
  [RuleType.Attribute]: "属性",
  [RuleType.Parent]: "父级",
};

export function createRuleWithBase(
  base: { id: number; title: string; description?: string; type: ClickRuleConfig["type"] },
  list: RuleListType,
): ClickRuleConfig {
  const { id, title, description, type } = base;
  switch (type) {
    case RuleType.Text:
      return {
        id,
        title,
        description,
        type: RuleType.Text,
        op: RuleOp.Contains,
        values: [],
        weight: list === RuleListType.Whitelist ? 50 : undefined,
      };
    case RuleType.Attribute:
      return {
        id,
        title,
        description,
        type: RuleType.Attribute,
        attr: "id",
        op: RuleOp.Equals,
        values: [],
        weight: list === RuleListType.Whitelist ? 50 : undefined,
      };
    case RuleType.Selector:
      return {
        id,
        title,
        description,
        type: RuleType.Selector,
        op: RuleOp.Contains,
        values: [],
        weight: list === RuleListType.Whitelist ? 50 : undefined,
      };
    case RuleType.Parent:
      return {
        id,
        title,
        description,
        type: RuleType.Parent,
        op: RuleOp.Contains,
        values: [],
        weight: list === RuleListType.Whitelist ? 50 : undefined,
      };
  }
}

export function nextRuleId(rules: ClickRuleConfig[]): number {
  return rules.length === 0 ? 1 : Math.max(...rules.map((rule) => rule.id)) + 1;
}
