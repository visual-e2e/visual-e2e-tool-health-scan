import { useCallback, useEffect, useState } from "react";
import { getRpcClient, isEmbedded, type BrowserRuntimeResult } from "@visual-e2e/rpc-sdk";
import { api } from "../api/client";

interface BrowserStatus {
  ok: boolean;
  hints: string[];
  browser_path?: string;
  ffmpeg_path?: string;
}

function fromRpcResult(r: BrowserRuntimeResult): BrowserStatus {
  return {
    ok: r.check.ok,
    hints: r.check.hints,
    browser_path: r.browser_path,
    ffmpeg_path: r.ffmpeg_path,
  };
}

export function useBrowserStatus() {
  const [status, setStatus] = useState<BrowserStatus | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);

  const fetch = useCallback(async () => {
    setIsFetching(true);
    try {
      if (isEmbedded()) {
        const rpc = getRpcClient();
        const res = await rpc.getBrowserRuntime();
        setStatus(fromRpcResult(res));
      } else {
        const res = await api.browserStatus();
        setStatus({ ok: res.ok, hints: res.hints });
      }
    } catch {
      // ignore
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return {
    ok: status?.ok,
    hints: status?.hints,
    browser_path: status?.browser_path,
    ffmpeg_path: status?.ffmpeg_path,
    isFetching,
    refetch: fetch,
  };
}
