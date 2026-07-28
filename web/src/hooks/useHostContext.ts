import { useEffect, useRef, useState } from "react";
import { getRpcClient, isEmbedded } from "../rpc";
import type { ProjectListItem, ProjectContextResult } from "../rpc/protocol";
import { TOOL_MSG, type HostProjectContext } from "../types";

export type { ProjectListItem };

export function useHostContext() {
  const [hostCtx, setHostCtx] = useState<ProjectContextResult | null>(null);
  const [projectId, setProjectId] = useState<string>();
  const [startUrl, setStartUrl] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!isEmbedded()) return;

    const rpc = getRpcClient();

    async function init() {
      try {
        const [ctx, list] = await Promise.all([
          rpc.getProjectContext(),
          rpc.listProjects(),
        ]);
        setHostCtx(ctx);
        setProjects(list);
        setProjectId(ctx.projectId);
        setStartUrl(ctx.baseUrl ?? "");
      } catch {
        // Not embedded or host doesn't support — fallback to legacy postMessage
        requestLegacyContext();
      }
    }

    if (!initialized.current) {
      initialized.current = true;
      void init();
    }

    // Listen for project context changes from Host
    const unsubNotify = rpc.onNotify(async (msg) => {
      if (msg.method !== "project.contextChanged") return;
      try {
        const [ctx, list] = await Promise.all([
          rpc.getProjectContext(),
          rpc.listProjects(),
        ]);
        setHostCtx(ctx);
        setProjects(list);
        setProjectId(ctx.projectId);
        setStartUrl(ctx.baseUrl ?? "");
      } catch {
        // ignore
      }
    });

    return () => {
      unsubNotify();
    };
  }, []);

  // Legacy postMessage fallback (old hosts without RPC project.list)
  useEffect(() => {
    if (!isEmbedded()) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: HostProjectContext };
      if (data?.type === TOOL_MSG.PROJECT_CONTEXT && data.payload) {
        // Only apply if RPC context isn't already loaded
        if (!hostCtx) {
          setProjectId(data.payload.projectId);
          if (data.payload.baseUrl) setStartUrl(data.payload.baseUrl);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [hostCtx]);

  const handleProjectChange = (id: string | undefined) => {
    setProjectId(id);
    if (!id || !isEmbedded()) return;
    void getRpcClient()
      .getProjectContext()
      .then((ctx) => setStartUrl(ctx.baseUrl ?? ""))
      .catch(() => undefined);
  };

  return {
    hostCtx,
    projectId,
    setProjectId: handleProjectChange,
    startUrl,
    setStartUrl,
    projects,
  };
}

function requestLegacyContext() {
  window.parent.postMessage({ type: TOOL_MSG.PROJECT_CONTEXT_REQUEST }, "*");
}
