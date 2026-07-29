import { useCallback, useEffect, useState } from "react";
import { message, Spin } from "antd";
import { BrowserStatusAlert } from "../components/BrowserStatusAlert";
import { HeaderBar } from "../components/HeaderBar";
import { ReportListDrawer } from "../components/ReportListDrawer";
import { ScanConfigDrawer } from "../components/ScanConfigDrawer";
import { RulesConfigDrawer } from "../components/RulesConfigDrawer";
import { ScanControls } from "../components/ScanControls";
import { ScanProgressPanel } from "../components/ScanProgressPanel";
import { CONFIG_LOCKED } from "../constants";
import { useBrowserStatus } from "../hooks/useBrowserStatus";
import { navigateToList } from "../hooks/useHashRoute";
import { useScanSession } from "../hooks/useScanSession";
import { api } from "../api/client";
import { downloadJson } from "../utils/download";
import {
  ClickSuccessMode,
  DEFAULT_SCAN_OPTIONS,
  getDefaultProbeSelectors,
  getDefaultIgnoreRequestRules,
  type ClickRuleConfig,
  type IgnoreRequestRule,
  type LoginProfile,
  type LoginSelectors,
  type PersistedScanConfig,
  type ProbeSelectorsConfig,
  type ScanProfileMeta,
} from "../types";

interface ProfileDetailPageProps {
  profileId: string;
}

export function ProfileDetailPage({ profileId }: ProfileDetailPageProps) {
  const [profile, setProfile] = useState<ScanProfileMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  const [startUrl, setStartUrl] = useState("");
  const [enableNetwork, setEnableNetwork] = useState(DEFAULT_SCAN_OPTIONS.enableNetwork);
  const [enableLayout, setEnableLayout] = useState(DEFAULT_SCAN_OPTIONS.enableLayout);
  const [enableClick, setEnableClick] = useState(DEFAULT_SCAN_OPTIONS.enableClick);
  const [enableNavigationProbe, setEnableNavigationProbe] = useState(
    DEFAULT_SCAN_OPTIONS.enableNavigationProbe,
  );
  const [enableHoverProbe, setEnableHoverProbe] = useState(DEFAULT_SCAN_OPTIONS.enableHoverProbe);
  const [maxClicks, setMaxClicks] = useState(DEFAULT_SCAN_OPTIONS.maxClicks);
  const [clickDelayMs, setClickDelayMs] = useState(DEFAULT_SCAN_OPTIONS.clickDelayMs);
  const [settleMs, setSettleMs] = useState(DEFAULT_SCAN_OPTIONS.settleMs);
  const [consecutiveErrorLimit, setConsecutiveErrorLimit] = useState(
    DEFAULT_SCAN_OPTIONS.consecutiveErrorLimit,
  );
  const [refreshOnConsecutiveErrors, setRefreshOnConsecutiveErrors] = useState(
    DEFAULT_SCAN_OPTIONS.refreshOnConsecutiveErrors,
  );
  const [clickPolicy, setClickPolicy] = useState(DEFAULT_SCAN_OPTIONS.clickPolicy);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(false);
  const [enableRecording, setEnableRecording] = useState(true);
  const [enableFailureScreenshot, setEnableFailureScreenshot] = useState(true);
  const [enableRouteScreenshot, setEnableRouteScreenshot] = useState(false);
  const [clickSuccessMode, setClickSuccessMode] = useState(
    DEFAULT_SCAN_OPTIONS.clickSuccessMode ?? ClickSuccessMode.DomChange,
  );
  const [loginProfile, setLoginProfile] = useState<LoginProfile | undefined>();
  const [loginSelectors, setLoginSelectors] = useState<LoginSelectors>(
    DEFAULT_SCAN_OPTIONS.loginSelectors ?? {},
  );

  const [blacklistRules, setBlacklistRules] = useState<ClickRuleConfig[]>([]);
  const [whitelistRules, setWhitelistRules] = useState<ClickRuleConfig[]>([]);
  const [whitelistDefaultWeight, setWhitelistDefaultWeight] = useState(0);
  const [rulesFiles, setRulesFiles] = useState<{
    baseDir: string;
    blacklistPath: string;
    whitelistPath: string;
  }>();
  const [rulesSaving, setRulesSaving] = useState(false);
  const [probeSelectors, setProbeSelectors] = useState<ProbeSelectorsConfig>(getDefaultProbeSelectors());
  const [ignoreRequestRules, setIgnoreRequestRules] = useState<IgnoreRequestRule[]>(
    () => getDefaultIgnoreRequestRules(),
  );

  const [scanDrawerOpen, setScanDrawerOpen] = useState(false);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [reportsDrawerOpen, setReportsDrawerOpen] = useState(false);

  const { ok: browserOk, hints: browserHints, refetch: refetchBrowser, isFetching: browserFetching } =
    useBrowserStatus();
  const { session, launchMut, startMut, pauseMut, resumeMut, stopMut } = useScanSession();

  const configLocked = Boolean(session && CONFIG_LOCKED.has(session.status));

  const applyScanConfig = useCallback((config: PersistedScanConfig) => {
    setStartUrl(config.startUrl);
    setEnableNetwork(config.enableNetwork);
    setEnableLayout(config.enableLayout);
    setEnableClick(config.enableClick);
    setEnableNavigationProbe(config.enableNavigationProbe);
    setEnableHoverProbe(config.enableHoverProbe ?? DEFAULT_SCAN_OPTIONS.enableHoverProbe);
    setMaxClicks(config.maxClicks);
    setClickDelayMs(config.clickDelayMs);
    setSettleMs(config.settleMs);
    setConsecutiveErrorLimit(config.consecutiveErrorLimit);
    setRefreshOnConsecutiveErrors(config.refreshOnConsecutiveErrors);
    setClickPolicy(config.clickPolicy);
    setAutoLoginEnabled(config.autoLoginEnabled ?? false);
    setEnableRecording(config.enableRecording ?? true);
    setEnableFailureScreenshot(config.enableFailureScreenshot ?? true);
    setEnableRouteScreenshot(config.enableRouteScreenshot ?? false);
    setClickSuccessMode(config.clickSuccessMode ?? ClickSuccessMode.DomChange);
    setLoginProfile(config.loginProfile);
    setLoginSelectors(config.loginSelectors ?? DEFAULT_SCAN_OPTIONS.loginSelectors ?? {});
  }, []);

  const buildScanConfig = useCallback((): PersistedScanConfig => {
    return {
      startUrl: startUrl.trim(),
      projectId: profile?.projectId,
      enableNetwork,
      enableLayout,
      enableClick,
      enableNavigationProbe,
      enableHoverProbe,
      maxClicks,
      maxOverlayDepth: DEFAULT_SCAN_OPTIONS.maxOverlayDepth,
      clickDelayMs,
      postClickSettleMs: DEFAULT_SCAN_OPTIONS.postClickSettleMs,
      settleMs,
      networkIdleMs: DEFAULT_SCAN_OPTIONS.networkIdleMs,
      consecutiveErrorLimit,
      refreshOnConsecutiveErrors,
      clickPolicy,
      defaultWeight: DEFAULT_SCAN_OPTIONS.defaultWeight,
      clickSortTolerancePx: DEFAULT_SCAN_OPTIONS.clickSortTolerancePx,
      apiErrorMinStatus: DEFAULT_SCAN_OPTIONS.apiErrorMinStatus,
      autoLoginEnabled,
      loginProfile: loginProfile?.username || loginProfile?.password ? loginProfile : undefined,
      loginSelectors,
      enableRecording,
      enableFailureScreenshot,
      enableRouteScreenshot,
      clickSuccessMode,
    };
  }, [
    startUrl,
    profile?.projectId,
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
    loginProfile,
    loginSelectors,
    enableRecording,
    enableFailureScreenshot,
    enableRouteScreenshot,
    clickSuccessMode,
  ]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [meta, config, rules, probe, exclude] = await Promise.all([
        api.getProfile(profileId),
        api.getScanConfig(profileId),
        api.getRules(profileId),
        api.getProbeSelectors(profileId),
        api.getUrlExclude(profileId),
      ]);

      let mergedConfig = config;
      const pid = meta.projectId;
      if (pid) {
        try {
          const defaults = await api.loginDefaults(pid);
          const needLogin =
            !config.loginProfile?.username?.trim() || !config.loginProfile?.password?.trim();
          mergedConfig = {
            ...config,
            startUrl: config.startUrl || defaults.startUrl || "",
            loginProfile: needLogin
              ? defaults.loginProfile ?? config.loginProfile
              : config.loginProfile,
            loginSelectors: {
              ...defaults.loginSelectors,
              ...config.loginSelectors,
            },
            autoLoginEnabled:
              config.autoLoginEnabled ||
              Boolean(
                (needLogin ? defaults.loginProfile : config.loginProfile)?.username &&
                  (needLogin ? defaults.loginProfile : config.loginProfile)?.password,
              ),
          };

          // Persist filled credentials so next open doesn't depend on live .env fetch
          if (
            needLogin &&
            defaults.loginProfile?.username &&
            defaults.loginProfile?.password
          ) {
            void api.saveScanConfig(profileId, mergedConfig).catch(() => undefined);
          }
        } catch (err) {
          console.warn("[health-scan] login-defaults failed", err);
        }
      }

      setProfile(meta);
      applyScanConfig(mergedConfig);
      setBlacklistRules(rules.blacklist.rules);
      setWhitelistRules(rules.whitelist.rules);
      setWhitelistDefaultWeight(rules.whitelist.defaultWeight ?? 0);
      setRulesFiles(rules.files);
      setProbeSelectors(probe.config);
      setIgnoreRequestRules(exclude.rules);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加载任务失败");
    } finally {
      setLoading(false);
    }
  }, [profileId, applyScanConfig]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openScanConfig = async () => {
    setScanDrawerOpen(true);
    const pid = profile?.projectId;
    if (!pid) return;
    if (loginProfile?.username?.trim() && loginProfile?.password?.trim()) return;
    try {
      const defaults = await api.loginDefaults(pid);
      if (!defaults.loginProfile?.username && !defaults.loginProfile?.password) return;
      setLoginProfile((prev) => ({
        ...defaults.loginProfile,
        ...prev,
        username: prev?.username?.trim() || defaults.loginProfile?.username,
        password: prev?.password?.trim() || defaults.loginProfile?.password,
        source: prev?.source ?? defaults.loginProfile?.source ?? "rpc",
      }));
      setLoginSelectors((prev) => ({ ...defaults.loginSelectors, ...prev }));
      if (!autoLoginEnabled && defaults.loginProfile?.username && defaults.loginProfile?.password) {
        setAutoLoginEnabled(true);
      }
    } catch (err) {
      console.warn("[health-scan] refill login defaults failed", err);
    }
  };

  const saveScanConfig = async () => {
    setConfigSaving(true);
    try {
      const saved = await api.saveScanConfig(profileId, buildScanConfig());
      applyScanConfig(saved);
      const meta = await api.getProfile(profileId);
      setProfile(meta);
      message.success("扫描配置已保存");
      setScanDrawerOpen(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setConfigSaving(false);
    }
  };

  const saveRules = async (next: {
    blacklistRules: ClickRuleConfig[];
    whitelistRules: ClickRuleConfig[];
    whitelistDefaultWeight: number;
  }) => {
    setRulesSaving(true);
    try {
      const bundle = await api.saveRules(profileId, next);
      setBlacklistRules(bundle.blacklist.rules);
      setWhitelistRules(bundle.whitelist.rules);
      setWhitelistDefaultWeight(bundle.whitelist.defaultWeight ?? next.whitelistDefaultWeight);
      setRulesFiles(bundle.files);
    } finally {
      setRulesSaving(false);
    }
  };

  const resetRules = async () => {
    setRulesSaving(true);
    try {
      const bundle = await api.resetRules(profileId);
      setBlacklistRules(bundle.blacklist.rules);
      setWhitelistRules(bundle.whitelist.rules);
      setWhitelistDefaultWeight(bundle.whitelist.defaultWeight ?? 0);
      setRulesFiles(bundle.files);
    } finally {
      setRulesSaving(false);
    }
  };

  const saveProbeSelectors = async (next: ProbeSelectorsConfig) => {
    setRulesSaving(true);
    try {
      const bundle = await api.saveProbeSelectors(profileId, next);
      setProbeSelectors(bundle.config);
    } finally {
      setRulesSaving(false);
    }
  };

  const resetProbeDefault = async () => {
    setRulesSaving(true);
    try {
      const bundle = await api.resetProbeSelectors(profileId, "default");
      setProbeSelectors(bundle.config);
      message.success("已恢复产品探测模板");
    } finally {
      setRulesSaving(false);
    }
  };

  const saveIgnoreRequestRules = async (next: IgnoreRequestRule[]) => {
    setRulesSaving(true);
    try {
      const bundle = await api.saveUrlExclude(profileId, next);
      setIgnoreRequestRules(bundle.rules);
    } finally {
      setRulesSaving(false);
    }
  };

  const resetIgnoreRequestRules = async () => {
    setRulesSaving(true);
    try {
      const bundle = await api.resetUrlExclude(profileId);
      setIgnoreRequestRules(bundle.rules);
      message.success("已恢复默认忽略请求");
    } finally {
      setRulesSaving(false);
    }
  };

  const handleLaunch = async () => {
    try {
      await api.saveScanConfig(profileId, buildScanConfig());
      await api.saveRules(profileId, {
        blacklistRules,
        whitelistRules,
        whitelistDefaultWeight,
      });
      launchMut.mutate({ profileId });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "启动失败");
    }
  };

  if (loading) {
    return (
      <main className="page page-detail" style={{ alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page page-detail">
        <p>任务不存在</p>
        <button type="button" onClick={navigateToList}>
          返回列表
        </button>
      </main>
    );
  }

  return (
    <main className="page page-detail">
      <HeaderBar
        profileName={profile.name}
        onBack={navigateToList}
        refreshing={browserFetching}
        onRefreshBrowser={refetchBrowser}
        onOpenScanConfig={() => void openScanConfig()}
        onOpenRulesConfig={() => setRulesDrawerOpen(true)}
        onOpenReports={() => setReportsDrawerOpen(true)}
        projectLabel={profile.projectId}
        startUrl={startUrl}
        blacklistCount={blacklistRules.length}
        whitelistCount={whitelistRules.length}
        controls={
          <ScanControls
            session={session}
            canLaunch={Boolean(startUrl.trim())}
            launching={launchMut.isPending}
            starting={startMut.isPending}
            pausing={pauseMut.isPending}
            resuming={resumeMut.isPending}
            stopping={stopMut.isPending}
            onLaunch={() => void handleLaunch()}
            onStart={() => startMut.mutate()}
            onPause={() => pauseMut.mutate()}
            onResume={() => resumeMut.mutate()}
            onStop={() => stopMut.mutate()}
            onExport={() =>
              session &&
              downloadJson(`health-scan-${session.sessionId.slice(0, 8)}.json`, session)
            }
          />
        }
      />

      <BrowserStatusAlert ok={browserOk} hints={browserHints} />

      <div className="page-main">
        <ScanProgressPanel session={session} />
      </div>

      <ScanConfigDrawer
        open={scanDrawerOpen}
        onClose={() => setScanDrawerOpen(false)}
        saving={configSaving}
        onSave={() => void saveScanConfig()}
        startUrl={startUrl}
        enableNetwork={enableNetwork}
        enableLayout={enableLayout}
        enableClick={enableClick}
        enableNavigationProbe={enableNavigationProbe}
        enableHoverProbe={enableHoverProbe}
        maxClicks={maxClicks}
        clickDelayMs={clickDelayMs}
        settleMs={settleMs}
        consecutiveErrorLimit={consecutiveErrorLimit}
        refreshOnConsecutiveErrors={refreshOnConsecutiveErrors}
        clickPolicy={clickPolicy}
        autoLoginEnabled={autoLoginEnabled}
        enableRecording={enableRecording}
        enableFailureScreenshot={enableFailureScreenshot}
        loginProfile={loginProfile}
        loginSelectors={loginSelectors}
        disabled={configLocked}
        onStartUrlChange={setStartUrl}
        onEnableNetworkChange={setEnableNetwork}
        onEnableLayoutChange={setEnableLayout}
        onEnableClickChange={setEnableClick}
        onEnableNavigationProbeChange={setEnableNavigationProbe}
        onEnableHoverProbeChange={setEnableHoverProbe}
        onMaxClicksChange={setMaxClicks}
        onClickDelayMsChange={setClickDelayMs}
        onSettleMsChange={setSettleMs}
        onConsecutiveErrorLimitChange={setConsecutiveErrorLimit}
        onRefreshOnConsecutiveErrorsChange={setRefreshOnConsecutiveErrors}
        onClickPolicyChange={setClickPolicy}
        onAutoLoginEnabledChange={setAutoLoginEnabled}
        onEnableRecordingChange={setEnableRecording}
        onEnableFailureScreenshotChange={setEnableFailureScreenshot}
        enableRouteScreenshot={enableRouteScreenshot}
        onEnableRouteScreenshotChange={setEnableRouteScreenshot}
        clickSuccessMode={clickSuccessMode}
        onClickSuccessModeChange={setClickSuccessMode}
        onLoginProfileChange={setLoginProfile}
        onLoginSelectorsChange={setLoginSelectors}
      />

      <ReportListDrawer
        open={reportsDrawerOpen}
        onClose={() => setReportsDrawerOpen(false)}
        profileId={profileId}
      />

      <RulesConfigDrawer
        open={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        blacklistRules={blacklistRules}
        whitelistRules={whitelistRules}
        whitelistDefaultWeight={whitelistDefaultWeight}
        probeSelectors={probeSelectors}
        ignoreRequestRules={ignoreRequestRules}
        filesInfo={rulesFiles}
        saving={rulesSaving}
        disabled={configLocked}
        onSave={saveRules}
        onResetDefault={resetRules}
        onOpenRulesFile={async (list) => {
          await api.openRulesFile(profileId, list);
        }}
        onBlacklistChange={setBlacklistRules}
        onWhitelistChange={setWhitelistRules}
        onProbeSelectorsChange={setProbeSelectors}
        onSaveProbeSelectors={saveProbeSelectors}
        onResetProbeDefault={resetProbeDefault}
        onIgnoreRequestRulesChange={setIgnoreRequestRules}
        onSaveIgnoreRequestRules={saveIgnoreRequestRules}
        onResetIgnoreRequestRules={resetIgnoreRequestRules}
      />
    </main>
  );
}
