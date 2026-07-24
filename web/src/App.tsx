import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "./api/client";
import {
  TOOL_MSG,
  type HostProjectContext,
  type IssueCategory,
  type ScanIssue,
  type ScanSession,
} from "./types";
import "./app.css";

const ACTIVE = new Set(["starting", "running", "stopping"]);

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  network: "网络",
  layout: "布局",
  click: "交互",
  runtime: "运行时",
};

const STATUS_LABEL: Record<string, string> = {
  starting: "启动中",
  running: "扫描中",
  stopping: "停止中",
  done: "已完成",
  cancelled: "已取消",
  error: "出错",
};

function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

function requestHostContext() {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: TOOL_MSG.PROJECT_CONTEXT_REQUEST }, "*");
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [hostCtx, setHostCtx] = useState<HostProjectContext | null>(null);
  const [projectId, setProjectId] = useState<string>();
  const [startUrl, setStartUrl] = useState("");
  const [enableNetwork, setEnableNetwork] = useState(true);
  const [enableLayout, setEnableLayout] = useState(true);
  const [enableClick, setEnableClick] = useState(true);
  const [maxClicks, setMaxClicks] = useState(30);
  const [session, setSession] = useState<ScanSession | null>(null);

  const projectsQ = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.projects()).projects,
  });

  const browserQ = useQuery({
    queryKey: ["browser"],
    queryFn: () => api.browserStatus(),
  });

  useEffect(() => {
    requestHostContext();
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: HostProjectContext };
      if (data?.type === TOOL_MSG.PROJECT_CONTEXT && data.payload) {
        setHostCtx(data.payload);
        setProjectId(data.payload.projectId);
        if (data.payload.baseUrl) setStartUrl(data.payload.baseUrl);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!projectId || hostCtx?.projectId === projectId) return;
    let cancelled = false;
    api
      .projectContext(projectId)
      .then((ctx) => {
        if (cancelled) return;
        if (ctx.baseUrl) setStartUrl(ctx.baseUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId, hostCtx?.projectId]);

  useEffect(() => {
    if (!session || !ACTIVE.has(session.status)) return;
    const timer = window.setInterval(() => {
      api
        .getScan(session.sessionId)
        .then(setSession)
        .catch(() => undefined);
    }, 800);
    return () => window.clearInterval(timer);
  }, [session?.sessionId, session?.status]);

  const startMut = useMutation({
    mutationFn: () =>
      api.createScan({
        startUrl: startUrl.trim(),
        enableNetwork,
        enableLayout,
        enableClick,
        maxClicks,
      }),
    onSuccess: (data) => {
      setSession(data);
      message.success("已开始扫描");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const stopMut = useMutation({
    mutationFn: () => api.stopScan(session!.sessionId),
    onSuccess: (data) => {
      setSession(data);
      message.info("已请求停止");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const busy = Boolean(session && ACTIVE.has(session.status));

  const columns: ColumnsType<ScanIssue> = useMemo(
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
          <Tag color={s === "error" ? "error" : "warning"}>{s === "error" ? "错误" : "警告"}</Tag>
        ),
      },
      { title: "问题", dataIndex: "title", width: 140 },
      {
        title: "详情",
        dataIndex: "detail",
        ellipsis: true,
        render: (_: unknown, row) => row.detail || row.url || row.selector || "—",
      },
      {
        title: "次数",
        dataIndex: "count",
        width: 64,
      },
    ],
    [],
  );

  return (
    <main className="page">
      <header className="header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            健康扫描
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
            扫描静态资源 404、接口 5xx、页面错乱与失效点击
          </Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => browserQ.refetch()}>
          刷新浏览器状态
        </Button>
      </header>

      {browserQ.data && !browserQ.data.ok && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="测试浏览器未就绪"
          description={browserQ.data.hints.join("；") || "请先在主应用安装 Chromium"}
        />
      )}

      <Card size="small" title="扫描配置" style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Form.Item label="项目">
            <Select
              allowClear
              placeholder="选择项目以填充 BASE_URL"
              value={projectId}
              options={(projectsQ.data ?? []).map((p) => ({
                value: p.id,
                label: `${p.name} (${p.id})`,
              }))}
              onChange={(v) => setProjectId(v)}
              disabled={busy}
            />
          </Form.Item>
          <Form.Item label="入口 URL" required>
            <Input
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://example.com/"
              disabled={busy}
            />
          </Form.Item>
          <Form.Item label="能力">
            <Space wrap>
              <Checkbox
                checked={enableNetwork}
                disabled={busy}
                onChange={(e) => setEnableNetwork(e.target.checked)}
              >
                网络（404 / 5xx）
              </Checkbox>
              <Checkbox
                checked={enableLayout}
                disabled={busy}
                onChange={(e) => setEnableLayout(e.target.checked)}
              >
                布局错乱
              </Checkbox>
              <Checkbox
                checked={enableClick}
                disabled={busy}
                onChange={(e) => setEnableClick(e.target.checked)}
              >
                交互检查
              </Checkbox>
            </Space>
          </Form.Item>
          <Form.Item label="最大点击次数">
            <InputNumber
              min={1}
              max={100}
              value={maxClicks}
              disabled={busy || !enableClick}
              onChange={(v) => setMaxClicks(Number(v ?? 30))}
            />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={startMut.isPending}
              disabled={busy || !startUrl.trim()}
              onClick={() => startMut.mutate()}
            >
              开始扫描
            </Button>
            <Button
              danger
              icon={<StopOutlined />}
              loading={stopMut.isPending}
              disabled={!busy}
              onClick={() => stopMut.mutate()}
            >
              停止
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!session || ACTIVE.has(session.status)}
              onClick={() =>
                session && downloadJson(`health-scan-${session.sessionId.slice(0, 8)}.json`, session)
              }
            >
              导出报告
            </Button>
          </Space>
        </Form>
      </Card>

      {session && (
        <Card
          size="small"
          title={
            <Space>
              <span>扫描结果</span>
              <Tag color={session.status === "error" ? "error" : "processing"}>
                {STATUS_LABEL[session.status] ?? session.status}
              </Tag>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          {session.progress && (
            <Typography.Paragraph type="secondary">{session.progress}</Typography.Paragraph>
          )}
          {session.error && <Alert type="error" message={session.error} style={{ marginBottom: 12 }} />}
          <Space wrap style={{ marginBottom: 12 }}>
            <Tag color="red">网络 {session.summary.network}</Tag>
            <Tag color="orange">布局 {session.summary.layout}</Tag>
            <Tag color="purple">交互 {session.summary.click}</Tag>
            <Tag>运行时 {session.summary.runtime}</Tag>
            <Tag>已点击 {session.summary.clicksTried}</Tag>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            当前页：{session.currentUrl}
          </Typography.Paragraph>
          <Space wrap style={{ marginBottom: 12 }}>
            {session.phases.map((p) => (
              <Tag key={p.name} color={p.done ? "success" : "default"}>
                {p.label}
                {p.done ? " ✓" : ""}
              </Tag>
            ))}
          </Space>
          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={session.issues}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: ACTIVE.has(session.status) ? "扫描进行中…" : "未发现问题" }}
          />
        </Card>
      )}
    </main>
  );
}
