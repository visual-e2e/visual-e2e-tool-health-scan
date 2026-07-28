import { Button, Space } from "antd";
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  DesktopOutlined,
  CaretRightOutlined,
} from "@ant-design/icons";
import { LIVE_STATUSES } from "../constants";
import { ScanStatus, type ScanSession } from "../types";

interface ScanControlsProps {
  session: ScanSession | null;
  canLaunch: boolean;
  launching?: boolean;
  starting?: boolean;
  pausing?: boolean;
  resuming?: boolean;
  stopping?: boolean;
  onLaunch: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExport: () => void;
}

export function ScanControls({
  session,
  canLaunch,
  launching,
  starting,
  pausing,
  resuming,
  stopping,
  onLaunch,
  onStart,
  onPause,
  onResume,
  onStop,
  onExport,
}: ScanControlsProps) {
  const status = session?.status;
  const live = Boolean(status && LIVE_STATUSES.has(status));
  const finished =
    status === ScanStatus.Done ||
    status === ScanStatus.Cancelled ||
    status === ScanStatus.Error;

  return (
    <Space wrap>
      {!live && (
        <Button
          type="primary"
          icon={<DesktopOutlined />}
          loading={launching}
          disabled={!canLaunch}
          onClick={onLaunch}
        >
          启动浏览器
        </Button>
      )}
      {status === ScanStatus.Ready && (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={starting}
          onClick={onStart}
        >
          开始扫描
        </Button>
      )}
      {status === ScanStatus.Running && (
        <Button icon={<PauseCircleOutlined />} loading={pausing} onClick={onPause}>
          暂停
        </Button>
      )}
      {status === ScanStatus.Paused && (
        <Button
          type="primary"
          icon={<CaretRightOutlined />}
          loading={resuming}
          onClick={onResume}
        >
          继续
        </Button>
      )}
      {live && (
        <Button danger icon={<StopOutlined />} loading={stopping} onClick={onStop}>
          停止
        </Button>
      )}
      <Button icon={<DownloadOutlined />} disabled={!session || live} onClick={onExport}>
        导出报告
      </Button>
      {finished && (
        <Button
          icon={<DesktopOutlined />}
          loading={launching}
          disabled={!canLaunch}
          onClick={onLaunch}
        >
          再次扫描
        </Button>
      )}
    </Space>
  );
}
