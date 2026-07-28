import { useCallback, useEffect, useState } from "react";
import { getRpcClient, isEmbedded } from "../rpc";
import { api } from "../api/client";
import type { BrowserCheckResult } from "../rpc/protocol";

interface BrowserStatus {
  ok: boolean;
  hints: string[];
}

function fromRpcResult(r: BrowserCheckResult): BrowserStatus {
  return { ok: r.ok, hints: r.hints };
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
        setStatus(fromRpcResult(res.check));
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
    isFetching,
    refetch: fetch,
  };
}
