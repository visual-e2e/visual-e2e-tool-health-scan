import { Button, Drawer, Form, Input, Modal, Select, Space, Tabs, Tooltip, Typography } from "antd";
import { InfoCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  RuleType,
  RuleListType,
  type ClickRuleConfig,
} from "../types";
import { RuleList } from "./rules/RuleList";
import { createRuleWithBase, nextRuleId, RULE_TYPE_LABEL } from "./rules/RuleEditors";
import { useMemo, useState } from "react";

interface RulesConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  blacklistRules: ClickRuleConfig[];
  whitelistRules: ClickRuleConfig[];
  whitelistDefaultWeight: number;
  filesInfo?: { baseDir: string; blacklistPath: string; whitelistPath: string };
  disabled?: boolean;
  saving?: boolean;
  onSave: (next: {
    blacklistRules: ClickRuleConfig[];
    whitelistRules: ClickRuleConfig[];
    whitelistDefaultWeight: number;
  }) => Promise<void>;
  onResetDefault: () => Promise<void>;
  onOpenRulesFile: (list: RuleListType) => Promise<void>;
  onBlacklistChange: (rules: ClickRuleConfig[]) => void;
  onWhitelistChange: (rules: ClickRuleConfig[]) => void;
}

export function RulesConfigDrawer({
  open,
  onClose,
  blacklistRules,
  whitelistRules,
  whitelistDefaultWeight,
  filesInfo,
  disabled,
  saving,
  onSave,
  onResetDefault,
  onOpenRulesFile,
  onBlacklistChange,
  onWhitelistChange,
}: RulesConfigDrawerProps) {
  const [activeList, setActiveList] = useState<RuleListType>(RuleListType.Whitelist);
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [form] = Form.useForm<{
    title: string;
    type: ClickRuleConfig["type"];
    description?: string;
  }>();

  const activeRules = useMemo(
    () => (activeList === RuleListType.Blacklist ? blacklistRules : whitelistRules),
    [activeList, blacklistRules, whitelistRules],
  );

  const persist = async (nextBlacklist: ClickRuleConfig[], nextWhitelist: ClickRuleConfig[]) => {
    onBlacklistChange(nextBlacklist);
    onWhitelistChange(nextWhitelist);
    await onSave({
      blacklistRules: nextBlacklist,
      whitelistRules: nextWhitelist,
      whitelistDefaultWeight,
    });
  };

  const handleDelete = async (rule: ClickRuleConfig) => {
    if (activeList === RuleListType.Blacklist) {
      await persist(
        blacklistRules.filter((x) => x.id !== rule.id),
        whitelistRules,
      );
      return;
    }
    await persist(
      blacklistRules,
      whitelistRules.filter((x) => x.id !== rule.id),
    );
  };

  const openCreateModal = () => {
    setEditingRuleId(null);
    form.setFieldsValue({
      title: "",
      type: RuleType.Text,
      description: "",
    });
    setMetaModalOpen(true);
  };

  const openEditModal = (rule: ClickRuleConfig) => {
    setEditingRuleId(rule.id);
    form.setFieldsValue({
      title: rule.title,
      type: rule.type,
      description: rule.description ?? "",
    });
    setMetaModalOpen(true);
  };

  const submitMeta = async () => {
    const values = await form.validateFields();
    const listRules = activeList === RuleListType.Blacklist ? blacklistRules : whitelistRules;
    if (editingRuleId == null) {
      const rule = createRuleWithBase(
        {
          id: nextRuleId(listRules),
          title: values.title.trim(),
          description: values.description?.trim(),
          type: values.type,
        },
        activeList,
      );
      if (activeList === RuleListType.Blacklist) {
        await persist([...blacklistRules, rule], whitelistRules);
      } else {
        await persist(blacklistRules, [...whitelistRules, rule]);
      }
    } else {
      const updateMeta = (rule: ClickRuleConfig): ClickRuleConfig => {
        if (rule.id !== editingRuleId) return rule;
        if (rule.type === values.type) {
          return {
            ...rule,
            title: values.title.trim(),
            description: values.description?.trim(),
          };
        }
        const rebuilt = createRuleWithBase(
          {
            id: rule.id,
            title: values.title.trim(),
            description: values.description?.trim(),
            type: values.type,
          },
          activeList,
        );
        if (activeList === RuleListType.Whitelist) {
          return { ...rebuilt, weight: rule.weight ?? rebuilt.weight };
        }
        return rebuilt;
      };
      if (activeList === RuleListType.Blacklist) {
        await persist(blacklistRules.map(updateMeta), whitelistRules);
      } else {
        await persist(blacklistRules, whitelistRules.map(updateMeta));
      }
    }
    setMetaModalOpen(false);
    form.resetFields();
  };

  const onRulesChange = async (rules: ClickRuleConfig[]) => {
    if (activeList === RuleListType.Blacklist) {
      await persist(rules, whitelistRules);
    } else {
      await persist(blacklistRules, rules);
    }
  };

  const storageTip =
    filesInfo == null
      ? "规则本地存储文件夹：未加载"
      : `规则本地存储文件夹：${filesInfo.baseDir}`;

  return (
    <Drawer
      title={
        <Space size={6}>
          <span>规则配置</span>
          <Tooltip title={<code>{storageTip}</code>}>
            <InfoCircleOutlined style={{ color: "#999" }} />
          </Tooltip>
        </Space>
      }
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      styles={{ body: { paddingTop: 12, height: "calc(100vh - 56px)" } }}
      extra={
        <Space>
          <Button disabled={saving} onClick={() => onOpenRulesFile(activeList)}>
            打开配置文件夹
          </Button>
          <Button disabled={disabled || saving} onClick={onResetDefault}>
            恢复默认值
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={disabled || saving}
            onClick={openCreateModal}
          >
            添加规则
          </Button>
        </Space>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: "0 0 auto", paddingBottom: 12 }}>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 10 }}>
            四类规则：<strong>文本</strong>、<strong>属性</strong>、<strong>元素</strong>、<strong>父级</strong>，
            均支持「包含/等于」；白名单可配置权重。
          </Typography.Paragraph>
          <Tabs
            size="small"
            activeKey={activeList}
            onChange={(key) => setActiveList(key as RuleListType)}
            items={[
              { key: RuleListType.Whitelist, label: `白名单 (${whitelistRules.length})` },
              { key: RuleListType.Blacklist, label: `黑名单 (${blacklistRules.length})` },
            ]}
          />
        </div>
        <div style={{ flex: "1 1 auto", overflow: "auto" }}>
          <RuleList
            rules={activeRules}
            list={activeList}
            disabled={disabled || saving}
            onEditMeta={openEditModal}
            onDelete={handleDelete}
            onChange={onRulesChange}
          />
        </div>
      </div>

      <Modal
        title={editingRuleId == null ? "添加规则" : "编辑规则基础信息"}
        open={metaModalOpen}
        onCancel={() => setMetaModalOpen(false)}
        onOk={submitMeta}
        okText={editingRuleId == null ? "添加" : "保存"}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如：高风险操作按钮" maxLength={80} />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
            <Select
              options={Object.values(RuleType).map((type) => ({
                value: type,
                label: RULE_TYPE_LABEL[type],
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选，记录规则用途" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
