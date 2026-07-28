import { Button, Space, Typography } from "antd";
import { ReloadOutlined, SettingOutlined, FilterOutlined } from "@ant-design/icons";

interface HeaderBarProps {
  onRefreshBrowser: () => void;
  refreshing?: boolean;
  onOpenScanConfig: () => void;
  onOpenRulesConfig: () => void;
}

export function HeaderBar({
  onRefreshBrowser,
  refreshing,
  onOpenScanConfig,
  onOpenRulesConfig,
}: HeaderBarProps) {
  return (
    <header className="header">
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          健康扫描
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
          启动浏览器后可先登录，再控制开始 / 暂停扫描
        </Typography.Paragraph>
      </div>
      <Space wrap>
        <Button icon={<SettingOutlined />} onClick={onOpenScanConfig}>
          扫描配置
        </Button>
        <Button icon={<FilterOutlined />} onClick={onOpenRulesConfig}>
          规则配置
        </Button>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefreshBrowser}>
          刷新浏览器状态
        </Button>
      </Space>
    </header>
  );
}
