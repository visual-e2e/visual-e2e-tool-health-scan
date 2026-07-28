import { Button, Space, Tag, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  FilterOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";

interface HeaderBarProps {
  profileName?: string;
  onBack?: () => void;
  onRefreshBrowser: () => void;
  refreshing?: boolean;
  onOpenScanConfig: () => void;
  onOpenRulesConfig: () => void;
  onOpenReports: () => void;
  /** Detail page meta row */
  projectLabel?: string;
  startUrl?: string;
  blacklistCount?: number;
  whitelistCount?: number;
  controls?: ReactNode;
}

export function HeaderBar({
  profileName,
  onBack,
  onRefreshBrowser,
  refreshing,
  onOpenScanConfig,
  onOpenRulesConfig,
  onOpenReports,
  projectLabel,
  startUrl,
  blacklistCount,
  whitelistCount,
  controls,
}: HeaderBarProps) {
  const showMeta =
    projectLabel != null ||
    startUrl != null ||
    blacklistCount != null ||
    whitelistCount != null ||
    controls != null;

  return (
    <header className={`header${showMeta ? " header-with-meta" : ""}`}>
      <div className="header-row">
        <Space size={4} align="center">
          {onBack && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
              返回
            </Button>
          )}
          <Typography.Title level={4} className="header-title">
            {profileName ?? "健康扫描"}
          </Typography.Title>
        </Space>
        <Space size={8} wrap>
          <Button icon={<FileTextOutlined />} onClick={onOpenReports}>
            历史报告
          </Button>
          <Button icon={<SettingOutlined />} onClick={onOpenScanConfig}>
            扫描配置
          </Button>
          <Button icon={<FilterOutlined />} onClick={onOpenRulesConfig}>
            规则配置
          </Button>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefreshBrowser}>
            刷新浏览器
          </Button>
        </Space>
      </div>
      {showMeta && (
        <div className="header-meta">
          <div className="meta-bar-left">
            {projectLabel && <Tag>{projectLabel}</Tag>}
            <Tooltip title={startUrl || undefined}>
              <span className="meta-bar-url">{startUrl || "未设置入口 URL"}</span>
            </Tooltip>
            {blacklistCount != null && <Tag color="red">黑名单 {blacklistCount}</Tag>}
            {whitelistCount != null && <Tag color="blue">白名单 {whitelistCount}</Tag>}
          </div>
          {controls && <div className="meta-bar-right">{controls}</div>}
        </div>
      )}
    </header>
  );
}
