import { Button, Drawer, Form, Input, Modal, Select, Space, Tabs, Tooltip, Typography, message } from "antd";
import {
  ExportOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  RuleType,
  RuleListType,
  RuleModuleType,
  mergeRuleLists,
  type ClickRuleConfig,
  type IgnoreRequestRule,
  type ProbeRule,
  type ProbeSelectorsConfig,
  type WhitelistRuleFile,
  type BlacklistRuleFile,
  type IgnoreRequestRuleFile,
  IgnoreRequestType,
  ProbeCategory,
  ProbeLayoutRole,
  ProbeAction,
} from "../types";
import { RuleList } from "./rules/RuleList";
import { createRuleWithBase, nextRuleId, RULE_TYPE_LABEL } from "./rules/RuleEditors";
import {
  ProbeSelectorsEditor,
  PROBE_ACTION_OPTIONS,
  PROBE_CATEGORY_OPTIONS,
  PROBE_LAYOUT_ROLE_OPTIONS,
  createProbeRule,
  nextProbeRuleId,
} from "./rules/ProbeSelectorsEditor";
import {
  IgnoreRequestRuleList,
  IGNORE_REQUEST_TYPE_OPTIONS,
  createIgnoreRequestRule,
  nextIgnoreRequestRuleId,
} from "./rules/IgnoreRequestEditor";
import { downloadRuleJson, ImportJsonModal, type ImportMode } from "./rules/ImportJsonModal";
import { useMemo, useState } from "react";

type DrawerTab = RuleListType | "probe" | "urlExclude";

interface RulesConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  blacklistRules: ClickRuleConfig[];
  whitelistRules: ClickRuleConfig[];
  whitelistDefaultWeight: number;
  probeSelectors: ProbeSelectorsConfig;
  ignoreRequestRules: IgnoreRequestRule[];
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
  onProbeSelectorsChange: (next: ProbeSelectorsConfig) => void;
  onSaveProbeSelectors: (next: ProbeSelectorsConfig) => Promise<void>;
  onResetProbeDefault: () => Promise<void>;
  onIgnoreRequestRulesChange: (next: IgnoreRequestRule[]) => void;
  onSaveIgnoreRequestRules: (next: IgnoreRequestRule[]) => Promise<void>;
  onResetIgnoreRequestRules: () => Promise<void>;
}

export function RulesConfigDrawer({
  open,
  onClose,
  blacklistRules,
  whitelistRules,
  whitelistDefaultWeight,
  probeSelectors,
  ignoreRequestRules,
  filesInfo,
  disabled,
  saving,
  onSave,
  onResetDefault,
  onOpenRulesFile,
  onBlacklistChange,
  onWhitelistChange,
  onProbeSelectorsChange,
  onSaveProbeSelectors,
  onResetProbeDefault,
  onIgnoreRequestRulesChange,
  onSaveIgnoreRequestRules,
  onResetIgnoreRequestRules,
}: RulesConfigDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>(RuleListType.Whitelist);
  const listTab = activeTab === "probe" || activeTab === "urlExclude" ? false : true;
  const activeList = listTab ? (activeTab as RuleListType) : RuleListType.Whitelist;
  const probeTab = activeTab === "probe";
  const urlExcludeTab = activeTab === "urlExclude";
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [form] = Form.useForm<{
    title: string;
    type: ClickRuleConfig["type"];
    description?: string;
  }>();
  const [ignoreMetaOpen, setIgnoreMetaOpen] = useState(false);
  const [editingIgnoreId, setEditingIgnoreId] = useState<number | null>(null);
  const [ignoreForm] = Form.useForm<{
    title: string;
    type: IgnoreRequestType;
    description?: string;
  }>();
  const [probeMetaOpen, setProbeMetaOpen] = useState(false);
  const [editingProbeId, setEditingProbeId] = useState<number | null>(null);
  const [probeForm] = Form.useForm<{
    title: string;
    category: ProbeCategory;
    role?: ProbeLayoutRole;
    action?: ProbeAction;
    description?: string;
  }>();
  const probeCategory = Form.useWatch("category", probeForm);
  const [importOpen, setImportOpen] = useState(false);

  const currentModule: RuleModuleType = useMemo(() => {
    if (probeTab) return RuleModuleType.Probe;
    if (urlExcludeTab) return RuleModuleType.IgnoreRequest;
    if (activeList === RuleListType.Blacklist) return RuleModuleType.Blacklist;
    return RuleModuleType.Whitelist;
  }, [probeTab, urlExcludeTab, activeList]);

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

  const persistIgnore = async (next: IgnoreRequestRule[]) => {
    onIgnoreRequestRulesChange(next);
    await onSaveIgnoreRequestRules(next);
  };

  const persistProbe = async (next: ProbeSelectorsConfig) => {
    onProbeSelectorsChange(next);
    await onSaveProbeSelectors(next);
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

  const storagePath = filesInfo?.baseDir;
  const probeRules = probeSelectors.rules ?? [];

  const exportCurrent = () => {
    if (probeTab) {
      downloadRuleJson("probe-selectors.json", {
        version: 2,
        type: RuleModuleType.Probe,
        rules: probeRules,
      } satisfies ProbeSelectorsConfig);
      return;
    }
    if (urlExcludeTab) {
      downloadRuleJson("url-exclude.json", {
        version: 1,
        type: RuleModuleType.IgnoreRequest,
        rules: ignoreRequestRules,
      } satisfies IgnoreRequestRuleFile);
      return;
    }
    if (activeList === RuleListType.Blacklist) {
      downloadRuleJson("blacklist.json", {
        version: 3,
        type: RuleModuleType.Blacklist,
        rules: blacklistRules,
      } satisfies BlacklistRuleFile);
      return;
    }
    downloadRuleJson("whitelist.json", {
      version: 3,
      type: RuleModuleType.Whitelist,
      defaultWeight: whitelistDefaultWeight,
      rules: whitelistRules,
    } satisfies WhitelistRuleFile);
  };

  const handleImport = async (file: unknown, mode: ImportMode) => {
    if (currentModule === RuleModuleType.Probe) {
      const incoming = file as ProbeSelectorsConfig;
      const nextRules =
        mode === "replace"
          ? incoming.rules
          : mergeRuleLists(probeRules, incoming.rules);
      await persistProbe({ version: 2, type: RuleModuleType.Probe, rules: nextRules });
    } else if (currentModule === RuleModuleType.IgnoreRequest) {
      const incoming = file as IgnoreRequestRuleFile;
      const next =
        mode === "replace"
          ? incoming.rules
          : mergeRuleLists(ignoreRequestRules, incoming.rules);
      await persistIgnore(next);
    } else if (currentModule === RuleModuleType.Blacklist) {
      const incoming = file as BlacklistRuleFile;
      const next =
        mode === "replace"
          ? incoming.rules
          : mergeRuleLists(blacklistRules, incoming.rules);
      await persist(next, whitelistRules);
    } else {
      const incoming = file as WhitelistRuleFile;
      const next =
        mode === "replace"
          ? incoming.rules
          : mergeRuleLists(whitelistRules, incoming.rules);
      await persist(blacklistRules, next);
      if (mode === "replace" && typeof incoming.defaultWeight === "number") {
        // defaultWeight only applied on replace; persist via save payload
        await onSave({
          blacklistRules,
          whitelistRules: next,
          whitelistDefaultWeight: incoming.defaultWeight,
        });
      }
    }
    message.success(mode === "replace" ? "已替换导入" : "已合并导入");
    setImportOpen(false);
  };

  return (
    <Drawer
      title={
        <Space size={6}>
          <span>规则配置</span>
          <Tooltip
            title={
              <div style={{ lineHeight: 1.6 }}>
                <div>白名单/黑名单：控制跳过与点击优先级</div>
                <div>探测选择器：click / hover / nav / layout 规则</div>
                <div>忽略请求：命中后不记为网络问题</div>
                <div>修改后立即生效，按任务独立存储</div>
              </div>
            }
          >
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
          <Button
            disabled={disabled || saving}
            onClick={() => {
              if (probeTab) void onResetProbeDefault();
              else if (urlExcludeTab) void onResetIgnoreRequestRules();
              else void onResetDefault();
            }}
          >
            恢复默认值
          </Button>
          <Button
            icon={<ImportOutlined />}
            disabled={disabled || saving}
            onClick={() => setImportOpen(true)}
          >
            导入 JSON
          </Button>
          <Button icon={<ExportOutlined />} disabled={saving} onClick={exportCurrent}>
            导出
          </Button>
          {(listTab || urlExcludeTab || probeTab) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={disabled || saving}
              onClick={() => {
                if (urlExcludeTab) {
                  setEditingIgnoreId(null);
                  ignoreForm.setFieldsValue({
                    title: "",
                    type: IgnoreRequestType.Domain,
                    description: "",
                  });
                  setIgnoreMetaOpen(true);
                  return;
                }
                if (probeTab) {
                  setEditingProbeId(null);
                  probeForm.setFieldsValue({
                    title: "",
                    category: ProbeCategory.Click,
                    role: ProbeLayoutRole.Sample,
                    action: ProbeAction.Click,
                    description: "",
                  });
                  setProbeMetaOpen(true);
                  return;
                }
                openCreateModal();
              }}
            >
              添加规则
            </Button>
          )}
        </Space>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: "0 0 auto", paddingBottom: 12 }}>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 4 }}>
            提示：黑白名单控制跳过与加权；探测规则识别可点/悬停/导航/布局；忽略请求过滤网络噪声。
          </Typography.Paragraph>
          <Space size={4} style={{ marginBottom: 10, maxWidth: "100%" }}>
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, maxWidth: 560 }}
              ellipsis={{ tooltip: storagePath }}
            >
              {storagePath ? `存储位置：${storagePath}` : "存储位置：未加载"}
            </Typography.Text>
            <Tooltip title="打开配置文件夹">
              <Button
                type="text"
                size="small"
                icon={<FolderOpenOutlined />}
                disabled={saving || !storagePath}
                onClick={() => void onOpenRulesFile(activeList)}
                aria-label="打开配置文件夹"
              />
            </Tooltip>
          </Space>
          <Tabs
            size="small"
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as DrawerTab)}
            items={[
              { key: RuleListType.Whitelist, label: `白名单 (${whitelistRules.length})` },
              { key: RuleListType.Blacklist, label: `黑名单 (${blacklistRules.length})` },
              { key: "probe", label: `探测选择器 (${probeRules.length})` },
              { key: "urlExclude", label: `忽略请求 (${ignoreRequestRules.length})` },
            ]}
          />
        </div>
        <div style={{ flex: "1 1 auto", overflow: "auto" }}>
          {probeTab ? (
            <ProbeSelectorsEditor
              value={probeSelectors}
              disabled={disabled || saving}
              onChange={(next) => void persistProbe(next)}
              onEditMeta={(rule) => {
                setEditingProbeId(rule.id);
                probeForm.setFieldsValue({
                  title: rule.title,
                  category: rule.category,
                  role: rule.role ?? ProbeLayoutRole.Sample,
                  action: rule.action,
                  description: rule.description ?? "",
                });
                setProbeMetaOpen(true);
              }}
              onDelete={(rule) =>
                void persistProbe({
                  version: 2,
                  type: RuleModuleType.Probe,
                  rules: probeRules.filter((r) => r.id !== rule.id),
                })
              }
            />
          ) : urlExcludeTab ? (
            <IgnoreRequestRuleList
              rules={ignoreRequestRules}
              disabled={disabled || saving}
              onChange={(next) => void persistIgnore(next)}
              onEditMeta={(rule) => {
                setEditingIgnoreId(rule.id);
                ignoreForm.setFieldsValue({
                  title: rule.title,
                  type: rule.type,
                  description: rule.description ?? "",
                });
                setIgnoreMetaOpen(true);
              }}
              onDelete={(rule) =>
                void persistIgnore(ignoreRequestRules.filter((r) => r.id !== rule.id))
              }
            />
          ) : (
            <RuleList
              rules={activeRules}
              list={activeList}
              disabled={disabled || saving}
              onEditMeta={openEditModal}
              onDelete={handleDelete}
              onChange={onRulesChange}
            />
          )}
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

      <Modal
        title={editingIgnoreId == null ? "添加忽略规则" : "编辑忽略规则"}
        open={ignoreMetaOpen}
        onCancel={() => setIgnoreMetaOpen(false)}
        onOk={async () => {
          const values = await ignoreForm.validateFields();
          if (editingIgnoreId == null) {
            await persistIgnore([
              ...ignoreRequestRules,
              createIgnoreRequestRule({
                id: nextIgnoreRequestRuleId(ignoreRequestRules),
                title: values.title.trim(),
                type: values.type,
                description: values.description?.trim(),
              }),
            ]);
          } else {
            await persistIgnore(
              ignoreRequestRules.map((r) =>
                r.id === editingIgnoreId
                  ? {
                      ...r,
                      title: values.title.trim(),
                      type: values.type,
                      description: values.description?.trim() || undefined,
                    }
                  : r,
              ),
            );
          }
          setIgnoreMetaOpen(false);
          ignoreForm.resetFields();
        }}
        okText={editingIgnoreId == null ? "添加" : "保存"}
      >
        <Form form={ignoreForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如：统计与埋点域名" maxLength={80} />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
            <Select options={IGNORE_REQUEST_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingProbeId == null ? "添加探测规则" : "编辑探测规则"}
        open={probeMetaOpen}
        onCancel={() => setProbeMetaOpen(false)}
        onOk={async () => {
          const values = await probeForm.validateFields();
          const patch: Partial<ProbeRule> = {
            title: values.title.trim(),
            category: values.category,
            role:
              values.category === ProbeCategory.Layout
                ? values.role ?? ProbeLayoutRole.Sample
                : undefined,
            action:
              values.category === ProbeCategory.Layout
                ? undefined
                : values.action ??
                  (values.category === ProbeCategory.Hover
                    ? ProbeAction.Hover
                    : ProbeAction.Click),
            description: values.description?.trim() || undefined,
          };
          if (editingProbeId == null) {
            await persistProbe({
              version: 2,
              type: RuleModuleType.Probe,
              rules: [
                ...probeRules,
                createProbeRule({
                  id: nextProbeRuleId(probeRules),
                  title: patch.title!,
                  category: patch.category!,
                  role: patch.role,
                  action: patch.action,
                  description: patch.description,
                }),
              ],
            });
          } else {
            await persistProbe({
              version: 2,
              type: RuleModuleType.Probe,
              rules: probeRules.map((r) =>
                r.id === editingProbeId
                  ? {
                      ...r,
                      ...patch,
                    }
                  : r,
              ),
            });
          }
          setProbeMetaOpen(false);
          probeForm.resetFields();
        }}
        okText={editingProbeId == null ? "添加" : "保存"}
      >
        <Form form={probeForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如：通用可点击元素" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="category"
            label="类别"
            rules={[{ required: true, message: "请选择类别" }]}
          >
            <Select options={PROBE_CATEGORY_OPTIONS} />
          </Form.Item>
          {probeCategory === ProbeCategory.Layout ? (
            <Form.Item
              name="role"
              label="布局角色"
              rules={[{ required: true, message: "请选择布局角色" }]}
            >
              <Select options={PROBE_LAYOUT_ROLE_OPTIONS} />
            </Form.Item>
          ) : (
            <Form.Item name="action" label="动作">
              <Select allowClear options={PROBE_ACTION_OPTIONS} placeholder="默认按类别" />
            </Form.Item>
          )}
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      <ImportJsonModal
        open={importOpen}
        module={currentModule}
        onCancel={() => setImportOpen(false)}
        onImport={(file, mode) => handleImport(file, mode)}
      />
    </Drawer>
  );
}
