import { DeleteOutlined, EditOutlined, EyeOutlined, FolderOpenOutlined } from "@ant-design/icons";
import {
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { api } from "../api/client";
import { STATUS_COLOR, STATUS_LABEL } from "../constants";
import type { ReportMeta } from "../types";

interface ReportListDrawerProps {
  open: boolean;
  onClose: () => void;
  profileId?: string;
}

export function ReportListDrawer({ open, onClose, profileId }: ReportListDrawerProps) {
  const [reports, setReports] = useState<ReportMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<ReportMeta | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listReports(profileId);
      setReports(data.reports);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载报告失败");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (open) void loadReports();
  }, [open, loadReports]);

  const openEdit = (report: ReportMeta) => {
    setEditTarget(report);
    setEditName(report.name);
    setEditDescription(report.description ?? "");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.updateReport(editTarget.id, {
        name: editName,
        description: editDescription,
      });
      message.success("已保存");
      setEditTarget(null);
      await loadReports();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      await api.deleteReport(reportId);
      message.success("已删除");
      await loadReports();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const columns: ColumnsType<ReportMeta> = [
    {
      title: "名称",
      dataIndex: "name",
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 88,
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status as keyof typeof STATUS_COLOR]}>
          {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
        </Tag>
      ),
    },
    {
      title: "问题",
      width: 120,
      render: (_, row) => (
        <Typography.Text type="secondary">
          网{row.summary.network} 布{row.summary.layout} 点{row.summary.click}
        </Typography.Text>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => window.open(`/api/reports/${row.id}/html`, "_blank")}
            title="查看报告"
          />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm title="确定删除此报告？" onConfirm={() => handleDelete(row.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Drawer
        title="历史报告"
        placement="right"
        width={720}
        open={open}
        onClose={onClose}
        extra={
          <Button icon={<FolderOpenOutlined />} onClick={() => api.openReportsDir().catch(() => undefined)}>
            打开目录
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={reports}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "暂无历史报告" }}
        />
      </Drawer>

      <Modal
        title="编辑报告"
        open={Boolean(editTarget)}
        onCancel={() => setEditTarget(null)}
        onOk={() => void saveEdit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="名称">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
