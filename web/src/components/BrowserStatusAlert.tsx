import { Alert } from "antd";

interface BrowserStatusAlertProps {
  ok?: boolean;
  hints?: string[];
}

export function BrowserStatusAlert({ ok, hints }: BrowserStatusAlertProps) {
  if (ok !== false) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 8, flexShrink: 0 }}
      message="测试浏览器未就绪"
      description={(hints ?? []).join("；") || "请先在主应用安装 Chromium"}
    />
  );
}
