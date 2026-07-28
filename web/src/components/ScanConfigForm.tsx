import { Checkbox, Form, Input, InputNumber, Select, Space } from "antd";
import type { ProjectListItem } from "../rpc/protocol";
import { ClickPolicy, DEFAULT_SCAN_OPTIONS } from "../types";

export interface ScanConfigFormProps {
  projectId?: string;
  projects?: ProjectListItem[];
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  enableNavigationProbe: boolean;
  maxClicks: number;
  clickDelayMs: number;
  settleMs: number;
  consecutiveErrorLimit: number;
  refreshOnConsecutiveErrors: boolean;
  clickPolicy: (typeof ClickPolicy)[keyof typeof ClickPolicy];
  disabled?: boolean;
  onProjectChange: (projectId?: string) => void;
  onStartUrlChange: (url: string) => void;
  onEnableNetworkChange: (v: boolean) => void;
  onEnableLayoutChange: (v: boolean) => void;
  onEnableClickChange: (v: boolean) => void;
  onEnableNavigationProbeChange: (v: boolean) => void;
  onMaxClicksChange: (v: number) => void;
  onClickDelayMsChange: (v: number) => void;
  onSettleMsChange: (v: number) => void;
  onConsecutiveErrorLimitChange: (v: number) => void;
  onRefreshOnConsecutiveErrorsChange: (v: boolean) => void;
  onClickPolicyChange: (v: (typeof ClickPolicy)[keyof typeof ClickPolicy]) => void;
}

export function ScanConfigForm(props: ScanConfigFormProps) {
  const {
    projectId,
    projects,
    startUrl,
    enableNetwork,
    enableLayout,
    enableClick,
    enableNavigationProbe,
    maxClicks,
    clickDelayMs,
    settleMs,
    consecutiveErrorLimit,
    refreshOnConsecutiveErrors,
    clickPolicy,
    disabled,
    onProjectChange,
    onStartUrlChange,
    onEnableNetworkChange,
    onEnableLayoutChange,
    onEnableClickChange,
    onEnableNavigationProbeChange,
    onMaxClicksChange,
    onClickDelayMsChange,
    onSettleMsChange,
    onConsecutiveErrorLimitChange,
    onRefreshOnConsecutiveErrorsChange,
    onClickPolicyChange,
  } = props;

  return (
    <Form layout="vertical">
      <Form.Item label="项目">
        <Select
          allowClear
          placeholder="选择项目以填充 BASE_URL"
          value={projectId}
          options={(projects ?? []).map((p) => ({
            value: p.id,
            label: `${p.name} (${p.id})`,
          }))}
          onChange={(v) => onProjectChange(v)}
          disabled={disabled}
        />
      </Form.Item>
      <Form.Item label="入口 URL" required>
        <Input
          value={startUrl}
          onChange={(e) => onStartUrlChange(e.target.value)}
          placeholder="https://example.com/"
          disabled={disabled}
        />
      </Form.Item>
      <Form.Item label="能力">
        <Space wrap>
          <Checkbox
            checked={enableNetwork}
            disabled={disabled}
            onChange={(e) => onEnableNetworkChange(e.target.checked)}
          >
            网络（404 / 5xx）
          </Checkbox>
          <Checkbox
            checked={enableLayout}
            disabled={disabled}
            onChange={(e) => onEnableLayoutChange(e.target.checked)}
          >
            布局 / CSS
          </Checkbox>
          <Checkbox
            checked={enableClick}
            disabled={disabled}
            onChange={(e) => onEnableClickChange(e.target.checked)}
          >
            暴力点击
          </Checkbox>
          <Checkbox
            checked={enableNavigationProbe}
            disabled={disabled || !enableClick}
            onChange={(e) => onEnableNavigationProbeChange(e.target.checked)}
          >
            thy 导航（路由→菜单）
          </Checkbox>
        </Space>
      </Form.Item>
      <Form.Item label="点击策略">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            style={{ width: "100%" }}
            disabled={disabled || !enableClick}
            value={clickPolicy}
            options={[
              { value: ClickPolicy.Open, label: "开放（仅黑名单）" },
              { value: ClickPolicy.WhitelistBoost, label: "白名单优先（推荐）" },
              { value: ClickPolicy.WhitelistOnly, label: "仅白名单" },
            ]}
            onChange={onClickPolicyChange}
          />
          <Space wrap>
            <span>
              最大点击
              <InputNumber
                min={1}
                style={{ width: 72, marginLeft: 8 }}
                value={maxClicks}
                disabled={disabled || !enableClick}
                onChange={(v) => onMaxClicksChange(Number(v ?? DEFAULT_SCAN_OPTIONS.maxClicks))}
              />
            </span>
            <span>
              间隔 ms
              <InputNumber
                min={100}
                max={5000}
                style={{ width: 80, marginLeft: 8 }}
                value={clickDelayMs}
                disabled={disabled || !enableClick}
                onChange={(v) => onClickDelayMsChange(Number(v ?? DEFAULT_SCAN_OPTIONS.clickDelayMs))}
              />
            </span>
            <span>
              稳定 ms
              <InputNumber
                min={0}
                max={10000}
                style={{ width: 80, marginLeft: 8 }}
                value={settleMs}
                disabled={disabled}
                onChange={(v) => onSettleMsChange(Number(v ?? DEFAULT_SCAN_OPTIONS.settleMs))}
              />
            </span>
          </Space>
        </Space>
      </Form.Item>
      <Form.Item label="容错">
        <Space wrap>
          <span>
            连续失败刷新阈值
            <InputNumber
              min={1}
              max={20}
              style={{ width: 72, marginLeft: 8 }}
              value={consecutiveErrorLimit}
              disabled={disabled || !enableClick}
              onChange={(v) =>
                onConsecutiveErrorLimitChange(Number(v ?? DEFAULT_SCAN_OPTIONS.consecutiveErrorLimit))
              }
            />
          </span>
          <Checkbox
            checked={refreshOnConsecutiveErrors}
            disabled={disabled || !enableClick}
            onChange={(e) => onRefreshOnConsecutiveErrorsChange(e.target.checked)}
          >
            达到阈值后刷新页面
          </Checkbox>
        </Space>
      </Form.Item>
    </Form>
  );
}
