import { Alert, Card, Space, Table, Tabs, Tag, Typography } from "antd";
import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import { CATEGORY_LABEL, LIVE_STATUSES, STATUS_COLOR, STATUS_LABEL } from "../constants";
import {
  FAILURE_CODE_LABEL,
  IssueSeverity,
  ScanStatus,
  formatClickTarget,
  type ClickActionLog,
  type FailureCode,
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
        render: (o: string, row) => {
          const color =
            o === "success" ? "success" : o === "skipped" ? "default" : "error";
          const label =
            o === "success"
              ? "成功"
              : o === "skipped"
                ? row.skipReason === "blacklist"
                  ? "跳过(黑)"
                  : "跳过"
                : row.failureCode
                  ? FAILURE_CODE_LABEL[row.failureCode as FailureCode]
                  : "失败";
          return <Tag color={color}>{label}</Tag>;
        },
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

  const summary = session?.summary ?? EMPTY_SUMMARY;
  const issues = session?.issues ?? [];
  const clickActions = session?.clickActions ?? [];
  const phases = session?.phases ?? [];

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
        ]}
      />
    </Card>
  );
}
