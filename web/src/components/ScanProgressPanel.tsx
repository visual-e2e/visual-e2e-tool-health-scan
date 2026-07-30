import { Alert, Card, Collapse, Space, Table, Tabs, Tag, Typography } from "antd";
import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import {
  CATEGORY_LABEL,
  CLICK_OUTCOME_COLOR,
  compareRegistryItems,
  formatClickOutcomeLabel,
  formatRegistryLastResult,
  LIVE_STATUSES,
  REGISTRY_ACTIVE_STATUSES,
  REGISTRY_ARCHIVE_STATUSES,
  REGISTRY_STATUS_COLOR,
  REGISTRY_STATUS_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
} from "../constants";
import {
  FAILURE_CODE_LABEL,
  IssueSeverity,
  RegistryStatus,
  ScanStatus,
  formatClickTarget,
  type ClickActionLog,
  type FailureCode,
  type InteractionRegistryItem,
  type IssueCategory,
  type ScanIssue,
  type ScanSession,
} from "../types";

interface ScanProgressPanelProps {
  session: ScanSession | null;
}

const EMPTY_SUMMARY = {
  network: 0,
  layout: 0,
  click: 0,
  runtime: 0,
  clicksTried: 0,
  clicksSkipped: 0,
};

function countByStatus(items: InteractionRegistryItem[]): Record<RegistryStatus, number> {
  const counts = {
    [RegistryStatus.Pending]: 0,
    [RegistryStatus.Deferred]: 0,
    [RegistryStatus.Executed]: 0,
    [RegistryStatus.Skipped]: 0,
    [RegistryStatus.Stale]: 0,
  };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

export function ScanProgressPanel({ session }: ScanProgressPanelProps) {
  const issueColumns: ColumnsType<ScanIssue> = useMemo(
    () => [
      {
        title: "类别",
        dataIndex: "category",
        width: 88,
        render: (c: IssueCategory) => <Tag>{CATEGORY_LABEL[c]}</Tag>,
      },
      {
        title: "级别",
        dataIndex: "severity",
        width: 80,
        render: (s: string) => (
          <Tag color={s === IssueSeverity.Error ? "error" : "warning"}>
            {s === IssueSeverity.Error ? "错误" : "警告"}
          </Tag>
        ),
      },
      { title: "问题", dataIndex: "title", width: 140 },
      {
        title: "详情",
        dataIndex: "detail",
        ellipsis: true,
        render: (_: unknown, row) => {
          const parts = [
            row.failureCode ? FAILURE_CODE_LABEL[row.failureCode as FailureCode] : undefined,
            row.detail,
            formatClickTarget(row.clickTarget),
            row.url,
            row.selector,
          ].filter(Boolean);
          return parts.join(" · ") || "—";
        },
      },
      {
        title: "次数",
        dataIndex: "count",
        width: 64,
      },
    ],
    [],
  );

  const actionColumns: ColumnsType<ClickActionLog> = useMemo(
    () => [
      {
        title: "权重",
        dataIndex: "score",
        width: 64,
        render: (s: number) => (s > 0 ? s : "—"),
      },
      {
        title: "操作",
        render: (_, row) => formatClickTarget(row.target),
        ellipsis: true,
      },
      {
        title: "结果",
        dataIndex: "outcome",
        width: 100,
        render: (_: unknown, row) => (
          <Tag color={CLICK_OUTCOME_COLOR[row.outcome]}>
            {formatClickOutcomeLabel(row)}
          </Tag>
        ),
      },
      {
        title: "规则",
        render: (_, row) =>
          row.matchedRules.length > 0
            ? row.matchedRules.map((r) => r.matchedText).join("；")
            : "—",
        ellipsis: true,
      },
    ],
    [],
  );

  const registryColumns: ColumnsType<InteractionRegistryItem> = useMemo(
    () => [
      {
        title: "层",
        dataIndex: "layer",
        width: 64,
      },
      {
        title: "操作",
        dataIndex: "label",
        ellipsis: true,
      },
      {
        title: "事件",
        dataIndex: "eventType",
        width: 100,
        render: (v: string) => <Tag>{v}</Tag>,
      },
      {
        title: "来源",
        dataIndex: "source",
        width: 100,
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 110,
        render: (status: InteractionRegistryItem["status"]) => (
          <Tag color={REGISTRY_STATUS_COLOR[status]}>
            {REGISTRY_STATUS_LABEL[status]}
          </Tag>
        ),
      },
      {
        title: "结果",
        dataIndex: "lastResult",
        width: 120,
        render: (v?: string) => formatRegistryLastResult(v),
      },
    ],
    [],
  );

  const summary = session?.summary ?? EMPTY_SUMMARY;
  const interactionRegistry = session?.interactionRegistry ?? [];
  const issues = session?.issues ?? [];
  const clickActions = session?.clickActions ?? [];
  const phases = session?.phases ?? [];

  const registrySplit = useMemo(() => {
    const active = interactionRegistry
      .filter((item) => REGISTRY_ACTIVE_STATUSES.has(item.status))
      .sort(compareRegistryItems);
    const archive = interactionRegistry
      .filter((item) => REGISTRY_ARCHIVE_STATUSES.has(item.status))
      .sort(compareRegistryItems);
    return {
      active,
      archive,
      counts: countByStatus(interactionRegistry),
      total: interactionRegistry.length,
    };
  }, [interactionRegistry]);

  const registryPanel = (
    <div className="registry-panel">
      <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
        <Tag color="processing">待执行 {registrySplit.counts[RegistryStatus.Pending]}</Tag>
        <Tag color="gold">延后 {registrySplit.counts[RegistryStatus.Deferred]}</Tag>
        <Tag color="success">已执行 {registrySplit.counts[RegistryStatus.Executed]}</Tag>
        <Tag color="warning">跳过 {registrySplit.counts[RegistryStatus.Skipped]}</Tag>
        <Tag>失效 {registrySplit.counts[RegistryStatus.Stale]}</Tag>
      </Space>

      <Collapse
        size="small"
        bordered={false}
        className="registry-collapse"
        defaultActiveKey={["active"]}
        items={[
          {
            key: "active",
            label: `活跃队列 (${registrySplit.active.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={registryColumns}
                dataSource={registrySplit.active}
                pagination={
                  registrySplit.active.length > 15
                    ? { pageSize: 15, size: "small" }
                    : false
                }
                scroll={{ x: true }}
                locale={{ emptyText: "暂无活跃项" }}
              />
            ),
          },
          {
            key: "archive",
            label: `已归档 · 跳过 ${registrySplit.counts[RegistryStatus.Skipped]} · 失效 ${registrySplit.counts[RegistryStatus.Stale]}`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={registryColumns}
                dataSource={registrySplit.archive}
                pagination={
                  registrySplit.archive.length > 15
                    ? { pageSize: 15, size: "small" }
                    : false
                }
                scroll={{ x: true }}
                locale={{ emptyText: "暂无归档项" }}
              />
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <Card
      size="small"
      title={
        <Space size={8}>
          <span>扫描结果</span>
          {session ? (
            <Tag color={STATUS_COLOR[session.status]}>
              {STATUS_LABEL[session.status] ?? session.status}
            </Tag>
          ) : (
            <Tag>未开始</Tag>
          )}
        </Space>
      }
    >
      <div className="scan-panel-meta">
        {!session && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="启动浏览器后开始扫描"
          />
        )}
        {session?.status === ScanStatus.Ready && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="登录目标页后点击「开始扫描」"
          />
        )}
        {session?.status === ScanStatus.Paused && (
          <Alert type="warning" showIcon style={{ marginBottom: 8 }} message="扫描已暂停，可继续或停止" />
        )}
        {session?.progress && (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            {session.progress}
          </Typography.Text>
        )}
        {session?.error && (
          <Alert type="error" message={session.error} style={{ marginBottom: 8 }} />
        )}
        <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
          <Tag color="red">网络 {summary.network}</Tag>
          <Tag color="orange">布局 {summary.layout}</Tag>
          <Tag color="purple">交互 {summary.click}</Tag>
          <Tag>运行时 {summary.runtime}</Tag>
          <Tag>已点击 {summary.clicksTried}</Tag>
          <Tag>已跳过 {summary.clicksSkipped}</Tag>
          {session && (
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 360 }}>
              当前页：{session.currentUrl}
            </Typography.Text>
          )}
        </Space>
        {phases.length > 0 && (
          <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
            {phases.map((p) => (
              <Tag key={p.name} color={p.done ? "success" : "default"}>
                {p.label}
                {p.done ? " ✓" : ""}
              </Tag>
            ))}
          </Space>
        )}
      </div>
      <Tabs
        className="scan-panel-tabs"
        size="small"
        items={[
          {
            key: "registry",
            label: `操作注册表 (${registrySplit.active.length}/${registrySplit.total || 0})`,
            children: registryPanel,
          },
          {
            key: "actions",
            label: `点击日志 (${clickActions.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={actionColumns}
                dataSource={clickActions}
                pagination={{ pageSize: 15, size: "small" }}
                scroll={{ x: true }}
                locale={{ emptyText: "暂无点击记录" }}
              />
            ),
          },
          {
            key: "issues",
            label: `问题 (${issues.length})`,
            children: (
              <Table
                size="small"
                rowKey="id"
                columns={issueColumns}
                dataSource={issues}
                pagination={{ pageSize: 15, size: "small" }}
                scroll={{ x: true }}
                locale={{
                  emptyText: !session
                    ? "暂无扫描结果"
                    : session.status === ScanStatus.Ready ||
                        session.status === ScanStatus.Starting
                      ? "点击「开始扫描」后才会记录问题"
                      : LIVE_STATUSES.has(session.status)
                        ? "扫描进行中…"
                        : "未发现问题",
                }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
