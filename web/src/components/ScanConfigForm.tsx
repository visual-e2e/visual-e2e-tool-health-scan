import { Button, Checkbox, Form, Input, InputNumber, Select, Space } from "antd";
import {
  ClickPolicy,
  ClickSuccessMode,
  DEFAULT_SCAN_OPTIONS,
  type LoginProfile,
  type LoginSelectors,
} from "../types";

export interface ScanConfigFormProps {
  startUrl: string;
  enableNetwork: boolean;
  enableLayout: boolean;
  enableClick: boolean;
  enableNavigationProbe: boolean;
  enableHoverProbe: boolean;
  maxClicks: number;
  clickDelayMs: number;
  settleMs: number;
  consecutiveErrorLimit: number;
  refreshOnConsecutiveErrors: boolean;
  clickPolicy: (typeof ClickPolicy)[keyof typeof ClickPolicy];
  autoLoginEnabled: boolean;
  enableRecording: boolean;
  enableFailureScreenshot: boolean;
  enableRouteScreenshot: boolean;
  clickSuccessMode: ClickSuccessMode;
  loginProfile?: LoginProfile;
  loginSelectors?: LoginSelectors;
  disabled?: boolean;
  onStartUrlChange: (url: string) => void;
  onEnableNetworkChange: (v: boolean) => void;
  onEnableLayoutChange: (v: boolean) => void;
  onEnableClickChange: (v: boolean) => void;
  onEnableNavigationProbeChange: (v: boolean) => void;
  onEnableHoverProbeChange: (v: boolean) => void;
  onMaxClicksChange: (v: number) => void;
  onClickDelayMsChange: (v: number) => void;
  onSettleMsChange: (v: number) => void;
  onConsecutiveErrorLimitChange: (v: number) => void;
  onRefreshOnConsecutiveErrorsChange: (v: boolean) => void;
  onClickPolicyChange: (v: (typeof ClickPolicy)[keyof typeof ClickPolicy]) => void;
  onAutoLoginEnabledChange: (v: boolean) => void;
  onEnableRecordingChange: (v: boolean) => void;
  onEnableFailureScreenshotChange: (v: boolean) => void;
  onEnableRouteScreenshotChange: (v: boolean) => void;
  onClickSuccessModeChange: (v: ClickSuccessMode) => void;
  onLoginProfileChange: (profile: LoginProfile) => void;
  onLoginSelectorsChange: (selectors: LoginSelectors) => void;
}

export function ScanConfigForm(props: ScanConfigFormProps) {
  const {
    startUrl,
    enableNetwork,
    enableLayout,
    enableClick,
    enableNavigationProbe,
    enableHoverProbe,
    maxClicks,
    clickDelayMs,
    settleMs,
    consecutiveErrorLimit,
    refreshOnConsecutiveErrors,
    clickPolicy,
    autoLoginEnabled,
    enableRecording,
    enableFailureScreenshot,
    enableRouteScreenshot,
    clickSuccessMode,
    loginProfile,
    loginSelectors,
    disabled,
    onStartUrlChange,
    onEnableNetworkChange,
    onEnableLayoutChange,
    onEnableClickChange,
    onEnableNavigationProbeChange,
    onEnableHoverProbeChange,
    onMaxClicksChange,
    onClickDelayMsChange,
    onSettleMsChange,
    onConsecutiveErrorLimitChange,
    onRefreshOnConsecutiveErrorsChange,
    onClickPolicyChange,
    onAutoLoginEnabledChange,
    onEnableRecordingChange,
    onEnableFailureScreenshotChange,
    onEnableRouteScreenshotChange,
    onClickSuccessModeChange,
    onLoginProfileChange,
    onLoginSelectorsChange,
  } = props;

  const username = loginProfile?.username ?? "";
  const password = loginProfile?.password ?? "";

  return (
    <Form layout="vertical">
      <Form.Item label="入口 URL" required>
        <Input
          value={startUrl}
          onChange={(e) => onStartUrlChange(e.target.value)}
          placeholder="https://example.com/signin"
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
            导航/菜单探测
          </Checkbox>
          <Checkbox
            checked={enableHoverProbe}
            disabled={disabled || !enableClick}
            onChange={(e) => onEnableHoverProbeChange(e.target.checked)}
          >
            悬停探测
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
      <Form.Item label="登录">
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Checkbox
            checked={autoLoginEnabled}
            disabled={disabled}
            onChange={(e) => onAutoLoginEnabledChange(e.target.checked)}
          >
            启用自动登录
          </Checkbox>
          <Space.Compact style={{ width: "100%" }}>
            <Button disabled style={{ width: 120, pointerEvents: "none" }}>
              账号
            </Button>
            <Input
              value={username}
              disabled={disabled}
              placeholder="账号"
              onChange={(e) =>
                onLoginProfileChange({ ...loginProfile, username: e.target.value, source: "manual" })
              }
            />
          </Space.Compact>
          <Space.Compact style={{ width: "100%" }}>
            <Button disabled style={{ width: 120, pointerEvents: "none" }}>
              密码
            </Button>
            <Input
              value={password}
              disabled={disabled}
              placeholder="密码"
              onChange={(e) =>
                onLoginProfileChange({ ...loginProfile, password: e.target.value, source: "manual" })
              }
            />
          </Space.Compact>
          <Space.Compact style={{ width: "100%" }}>
            <Button disabled style={{ width: 120, pointerEvents: "none" }}>
              账号 selector
            </Button>
            <Input
              value={loginSelectors?.username ?? ""}
              disabled={disabled}
              placeholder='input[name="userAccount"]'
              onChange={(e) =>
                onLoginSelectorsChange({ ...loginSelectors, username: e.target.value })
              }
            />
          </Space.Compact>
          <Space.Compact style={{ width: "100%" }}>
            <Button disabled style={{ width: 120, pointerEvents: "none" }}>
              密码 selector
            </Button>
            <Input
              value={loginSelectors?.password ?? ""}
              disabled={disabled}
              placeholder='input[type="password"]'
              onChange={(e) =>
                onLoginSelectorsChange({ ...loginSelectors, password: e.target.value })
              }
            />
          </Space.Compact>
          <Space.Compact style={{ width: "100%" }}>
            <Button disabled style={{ width: 120, pointerEvents: "none" }}>
              登录按钮 selector
            </Button>
            <Input
              value={loginSelectors?.submit ?? ""}
              disabled={disabled}
              placeholder='button:has-text("登录")'
              onChange={(e) => onLoginSelectorsChange({ ...loginSelectors, submit: e.target.value })}
            />
          </Space.Compact>
        </Space>
      </Form.Item>
      <Form.Item label="点击判定">
        <Select
          style={{ width: 280 }}
          value={clickSuccessMode}
          disabled={disabled || !enableClick}
          onChange={(v) => onClickSuccessModeChange(v as ClickSuccessMode)}
          options={[
            { value: ClickSuccessMode.DomChange, label: "页面有变化视为成功（推荐）" },
            { value: ClickSuccessMode.ActionOk, label: "点击动作完成即成功" },
          ]}
        />
      </Form.Item>
      <Form.Item label="录制">
        <Space direction="vertical">
          <Checkbox
            checked={enableRecording}
            disabled={disabled}
            onChange={(e) => onEnableRecordingChange(e.target.checked)}
          >
            录制扫描视频
          </Checkbox>
          <Checkbox
            checked={enableFailureScreenshot}
            disabled={disabled || !enableClick}
            onChange={(e) => onEnableFailureScreenshotChange(e.target.checked)}
          >
            点击失败时截图
          </Checkbox>
          <Checkbox
            checked={enableRouteScreenshot}
            disabled={disabled}
            onChange={(e) => onEnableRouteScreenshotChange(e.target.checked)}
          >
            路由切换时截图
          </Checkbox>
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
