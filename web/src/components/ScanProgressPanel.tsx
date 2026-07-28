import { Alert, Card, Space, Table, Tabs, Tag, Typography } from "antd";
import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import { CATEGORY_LABEL, LIVE_STATUSES, STATUS_COLOR, STATUS_LABEL } from "../constants";
import {
  IssueSeverity,
  ScanStatus,
  formatClickTarget,
  type ClickActionLog,
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
        render: (_: unknown, row) =>
          row.detail ||
          formatClickTarget(row.clickTarget) ||
          row.url ||
          row.selector ||
          "—",
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
        width: 80,
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
        <Space>
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
      style={{ marginBottom: 16 }}
    >
      {!session && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="尚未开始扫描"
          description="配置好入口 URL 后：启动浏览器 → 登录 → 开始扫描。扫描配置与规则配置请从右上角打开。"
        />
      )}
      {session?.status === ScanStatus.Ready && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="浏览器已打开"
          description="请在测试浏览器中完成登录或切换到目标页面，然后点击「开始扫描」。此阶段不会记录问题。"
        />
      )}
      {session?.status === ScanStatus.Paused && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="扫描已暂停"
          description="浏览器保持打开。可点击「继续」恢复，或「停止」结束本次会话。"
        />
      )}
      {session?.progress && (
        <Typography.Paragraph type="secondary">{session.progress}</Typography.Paragraph>
      )}
      {session?.error && (
        <Alert type="error" message={session.error} style={{ marginBottom: 12 }} />
      )}
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="red">网络 {summary.network}</Tag>
        <Tag color="orange">布局 {summary.layout}</Tag>
        <Tag color="purple">交互 {summary.click}</Tag>
        <Tag>运行时 {summary.runtime}</Tag>
        <Tag>已点击 {summary.clicksTried}</Tag>
        <Tag>已跳过 {summary.clicksSkipped}</Tag>
      </Space>
      {session && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          当前页：{session.currentUrl}
        </Typography.Paragraph>
      )}
      {phases.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          {phases.map((p) => (
            <Tag key={p.name} color={p.done ? "success" : "default"}>
              {p.label}
              {p.done ? " ✓" : ""}
            </Tag>
          ))}
        </Space>
      )}
      <Tabs
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
                pagination={{ pageSize: 10 }}
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
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: "暂无点击记录" }}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
