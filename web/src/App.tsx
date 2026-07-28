import { useEffect, useMemo, useState } from "react";
import { BrowserStatusAlert } from "./components/BrowserStatusAlert";
import { HeaderBar } from "./components/HeaderBar";
import { ScanConfigDrawer } from "./components/ScanConfigDrawer";
import { RulesConfigDrawer } from "./components/RulesConfigDrawer";
import { ScanControls } from "./components/ScanControls";
import { ScanProgressPanel } from "./components/ScanProgressPanel";
import { Toolbar } from "./components/Toolbar";
import { CONFIG_LOCKED } from "./constants";
import { useHostContext } from "./hooks/useHostContext";
import { useScanSession } from "./hooks/useScanSession";
import { useBrowserStatus } from "./hooks/useBrowserStatus";
import { downloadJson } from "./utils/download";
import { api } from "./api/client";
import {
  DEFAULT_SCAN_OPTIONS,
  getDefaultBlacklistConfig,
  getDefaultWhitelistConfig,
  RuleListType,
  type ClickRuleConfig,
} from "./types";
import "./app.css";

export function App() {
  const { projectId, setProjectId, startUrl, setStartUrl, projects } = useHostContext();
  const [enableNetwork, setEnableNetwork] = useState(DEFAULT_SCAN_OPTIONS.enableNetwork);
  const [enableLayout, setEnableLayout] = useState(DEFAULT_SCAN_OPTIONS.enableLayout);
  const [enableClick, setEnableClick] = useState(DEFAULT_SCAN_OPTIONS.enableClick);
  const [enableNavigationProbe, setEnableNavigationProbe] = useState(
    DEFAULT_SCAN_OPTIONS.enableNavigationProbe,
  );
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

  const defaultWl = useMemo(() => getDefaultWhitelistConfig(), []);
  const [blacklistRules, setBlacklistRules] = useState<ClickRuleConfig[]>(() =>
    getDefaultBlacklistConfig(),
  );
  const [whitelistRules, setWhitelistRules] = useState<ClickRuleConfig[]>(
    () => defaultWl.rules,
  );
  const [whitelistDefaultWeight, setWhitelistDefaultWeight] = useState(defaultWl.defaultWeight);
  const [rulesFiles, setRulesFiles] = useState<{
    baseDir: string;
    blacklistPath: string;
    whitelistPath: string;
  }>();
  const [rulesSaving, setRulesSaving] = useState(false);

  const [scanDrawerOpen, setScanDrawerOpen] = useState(false);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);

  const { ok: browserOk, hints: browserHints, refetch: refetchBrowser, isFetching: browserFetching } =
    useBrowserStatus();

  const { session, launchMut, startMut, pauseMut, resumeMut, stopMut } = useScanSession();

  const configLocked = Boolean(session && CONFIG_LOCKED.has(session.status));

  const projectLabel = projects?.find((p) => p.id === projectId)?.name;

  useEffect(() => {
    let disposed = false;
    const loadRules = async () => {
      try {
        const bundle = await api.getRules();
        if (disposed) return;
        setBlacklistRules(bundle.blacklist.rules);
        setWhitelistRules(bundle.whitelist.rules);
        setWhitelistDefaultWeight(bundle.whitelist.defaultWeight ?? 0);
        setRulesFiles({
          baseDir: bundle.files.baseDir,
          blacklistPath: bundle.files.blacklistPath,
          whitelistPath: bundle.files.whitelistPath,
        });
      } catch (err) {
        console.error("load rules failed", err);
      }
    };
    void loadRules();
    return () => {
      disposed = true;
    };
  }, []);

  const saveRules = async (next: {
    blacklistRules: ClickRuleConfig[];
    whitelistRules: ClickRuleConfig[];
    whitelistDefaultWeight: number;
  }) => {
    setRulesSaving(true);
    try {
      const bundle = await api.saveRules(next);
      setBlacklistRules(bundle.blacklist.rules);
      setWhitelistRules(bundle.whitelist.rules);
      setWhitelistDefaultWeight(bundle.whitelist.defaultWeight ?? next.whitelistDefaultWeight);
      setRulesFiles({
        baseDir: bundle.files.baseDir,
        blacklistPath: bundle.files.blacklistPath,
        whitelistPath: bundle.files.whitelistPath,
      });
    } finally {
      setRulesSaving(false);
    }
  };

  const resetRules = async () => {
    setRulesSaving(true);
    try {
      const bundle = await api.resetRules();
      setBlacklistRules(bundle.blacklist.rules);
      setWhitelistRules(bundle.whitelist.rules);
      setWhitelistDefaultWeight(bundle.whitelist.defaultWeight ?? 0);
      setRulesFiles({
        baseDir: bundle.files.baseDir,
        blacklistPath: bundle.files.blacklistPath,
        whitelistPath: bundle.files.whitelistPath,
      });
    } finally {
      setRulesSaving(false);
    }
  };

  const openRulesFile = async (list: RuleListType) => {
    await api.openRulesFile(list);
  };

  const scanOptions = {
    startUrl: startUrl.trim(),
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
    blacklistRules,
    whitelistRules,
    whitelistDefaultWeight,
  };

  return (
    <main className="page">
      <HeaderBar
        refreshing={browserFetching}
        onRefreshBrowser={refetchBrowser}
        onOpenScanConfig={() => setScanDrawerOpen(true)}
        onOpenRulesConfig={() => setRulesDrawerOpen(true)}
      />

      <BrowserStatusAlert ok={browserOk} hints={browserHints} />

      <Toolbar
        projectLabel={projectLabel}
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
            onLaunch={() => launchMut.mutate(scanOptions)}
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

      <ScanProgressPanel session={session} />

      <ScanConfigDrawer
        open={scanDrawerOpen}
        onClose={() => setScanDrawerOpen(false)}
        projectId={projectId}
        projects={projects}
        startUrl={startUrl}
        enableNetwork={enableNetwork}
        enableLayout={enableLayout}
        enableClick={enableClick}
        enableNavigationProbe={enableNavigationProbe}
        maxClicks={maxClicks}
        clickDelayMs={clickDelayMs}
        settleMs={settleMs}
        consecutiveErrorLimit={consecutiveErrorLimit}
        refreshOnConsecutiveErrors={refreshOnConsecutiveErrors}
        clickPolicy={clickPolicy}
        disabled={configLocked}
        onProjectChange={setProjectId}
        onStartUrlChange={setStartUrl}
        onEnableNetworkChange={setEnableNetwork}
        onEnableLayoutChange={setEnableLayout}
        onEnableClickChange={setEnableClick}
        onEnableNavigationProbeChange={setEnableNavigationProbe}
        onMaxClicksChange={setMaxClicks}
        onClickDelayMsChange={setClickDelayMs}
        onSettleMsChange={setSettleMs}
        onConsecutiveErrorLimitChange={setConsecutiveErrorLimit}
        onRefreshOnConsecutiveErrorsChange={setRefreshOnConsecutiveErrors}
        onClickPolicyChange={setClickPolicy}
      />

      <RulesConfigDrawer
        open={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        blacklistRules={blacklistRules}
        whitelistRules={whitelistRules}
        whitelistDefaultWeight={whitelistDefaultWeight}
        filesInfo={rulesFiles}
        saving={rulesSaving}
        disabled={configLocked}
        onSave={saveRules}
        onResetDefault={resetRules}
        onOpenRulesFile={openRulesFile}
        onBlacklistChange={setBlacklistRules}
        onWhitelistChange={setWhitelistRules}
      />
    </main>
  );
}
