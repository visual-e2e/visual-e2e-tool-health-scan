import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api/client";
import { useHostContext } from "../hooks/useHostContext";
import { fetchLoginDefaults } from "../lib/host-runtime";
import { navigateToProfile } from "../hooks/useHashRoute";
import type { ScanProfileMeta, LoginDefaults } from "../types";

export function ProfileListPage() {
  const { projectId, startUrl: hostStartUrl, hostReady } = useHostContext();
  const [profiles, setProfiles] = useState<ScanProfileMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createUrl, setCreateUrl] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<ScanProfileMeta | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listProfiles();
      setProfiles(data.profiles);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载任务列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hostReady) return;
    void loadProfiles();
  }, [hostReady, loadProfiles]);

  useEffect(() => {
    if (hostStartUrl) setCreateUrl(hostStartUrl);
  }, [hostStartUrl]);

  const openCreate = () => {
    setCreateName("");
    setCreateDesc("");
    setCreateUrl(hostStartUrl);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      message.warning("请输入任务名称");
      return;
    }
    setCreating(true);
    try {
      let defaults: LoginDefaults = {};
      if (projectId) {
        try {
          defaults = await fetchLoginDefaults(projectId);
        } catch {
          // project may not have .env yet
        }
      }
      const profile = await api.createProfile({
        name,
        description: createDesc.trim() || undefined,
        projectId,
        startUrl: createUrl.trim() || defaults.startUrl || "",
      });

      if (defaults.loginProfile || defaults.loginSelectors || defaults.startUrl) {
        const config = await api.getScanConfig(profile.id);
        await api.saveScanConfig(profile.id, {
          ...config,
          startUrl: createUrl.trim() || defaults.startUrl || config.startUrl,
          projectId,
          autoLoginEnabled: Boolean(defaults.loginProfile?.username && defaults.loginProfile?.password),
          loginProfile: defaults.loginProfile ?? config.loginProfile,
          loginSelectors: { ...config.loginSelectors, ...defaults.loginSelectors },
        });
      }

      message.success("已创建扫描任务");
      setCreateOpen(false);
      await loadProfiles();
      navigateToProfile(profile.id);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProfile(id);
      message.success("已删除");
      await loadProfiles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    try {
      await api.updateProfile(editTarget.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      message.success("已保存");
      setEditTarget(null);
      await loadProfiles();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    }
  };

  const columns: ColumnsType<ScanProfileMeta> = [
    {
      title: "任务名称",
      dataIndex: "name",
      render: (name: string, row) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigateToProfile(row.id)}>
          {name}
        </Button>
      ),
    },
    {
      title: "入口 URL",
      dataIndex: "startUrl",
      ellipsis: true,
      render: (url: string) => url || "—",
    },
    {
      title: "最近扫描",
      dataIndex: "lastScanAt",
      width: 160,
      render: (v?: string) => (v ? new Date(v).toLocaleString("zh-CN") : "—"),
    },
    {
      title: "最近问题",
      width: 140,
      render: (_, row) =>
        row.lastReportSummary ? (
          <Typography.Text type="secondary">
            网{row.lastReportSummary.network} 布{row.lastReportSummary.layout} 点
            {row.lastReportSummary.click}
          </Typography.Text>
        ) : (
          "—"
        ),
    },
    {
      title: "操作",
      width: 120,
      render: (_, row) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditTarget(row);
              setEditName(row.name);
              setEditDesc(row.description ?? "");
            }}
          />
          <Popconfirm title="确定删除此扫描任务？" onConfirm={() => handleDelete(row.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <main className="page page-list">
      <header className="header">
        <div>
          <Typography.Title level={4} className="header-title">
            扫描任务
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            为不同入口页维护独立的扫描配置与点击规则
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建扫描任务
        </Button>
      </header>

      <Card size="small" className="list-table-card">
        <Table
          rowKey="id"
          size="small"
          loading={loading || !hostReady}
          columns={columns}
          dataSource={profiles}
          pagination={{ pageSize: 15, size: "small" }}
          locale={{
            emptyText: "暂无扫描任务。创建第一个任务，配置入口 URL 与规则后开始健康扫描。",
          }}
        />
      </Card>

      <Modal
        title="新建扫描任务"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="任务名称" required>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="例如：Worktile 主站"
            />
          </Form.Item>
          <Form.Item label="入口 URL">
            <Input
              value={createUrl}
              onChange={(e) => setCreateUrl(e.target.value)}
              placeholder="https://example.com/signin"
            />
          </Form.Item>
          <Form.Item label="说明">
            <Input.TextArea
              rows={2}
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑任务"
        open={Boolean(editTarget)}
        onCancel={() => setEditTarget(null)}
        onOk={() => void saveEdit()}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="任务名称">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Form.Item>
          <Form.Item label="说明">
            <Input.TextArea rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
