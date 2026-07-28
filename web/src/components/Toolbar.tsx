import { Card, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";

interface ToolbarProps {
  projectLabel?: string;
  startUrl: string;
  blacklistCount: number;
  whitelistCount: number;
  controls: ReactNode;
}

export function Toolbar({
  projectLabel,
  startUrl,
  blacklistCount,
  whitelistCount,
  controls,
}: ToolbarProps) {
  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space wrap size="middle">
          {projectLabel && <Tag>{projectLabel}</Tag>}
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 420 }}>
            {startUrl || "未设置入口 URL"}
          </Typography.Text>
          <Tag color="red">黑名单 {blacklistCount}</Tag>
          <Tag color="blue">白名单 {whitelistCount}</Tag>
        </Space>
        {controls}
      </Space>
    </Card>
  );
}
