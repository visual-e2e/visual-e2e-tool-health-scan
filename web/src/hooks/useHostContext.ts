import { useEffect, useRef, useState } from "react";
import {
  getRpcClient,
  isEmbedded,
  type ProjectContextChangedParams,
  type ProjectContextResult,
  type ProjectListItem,
} from "@visual-e2e/rpc-sdk";
import { TOOL_MSG, type HostProjectContext } from "../types";
import { bootstrapHostOnServer } from "../lib/host-runtime";

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

    async function apply(
      ctx: ProjectContextResult,
      list: ProjectListItem[],
      nextProjectId?: string,
    ) {
      setHostCtx(ctx);
      setProjects(list);
      if (nextProjectId) setProjectId(nextProjectId);
      setStartUrl(ctx.base_url ?? "");
    }

    async function init() {
      try {
        const [ctx, list, settings] = await Promise.all([
          rpc.getProjectContext(),
          rpc.listProjects(),
          rpc.getSettings().catch(() => null),
        ]);
        const defaultId =
          (settings as { defaultProject?: string } | null)?.defaultProject?.trim() ||
          list[0]?.id;
        await apply(ctx, list, defaultId);
        await bootstrapHostOnServer().catch(() => undefined);
      } catch {
        requestLegacyContext();
      }
    }

    if (!initialized.current) {
      initialized.current = true;
      void init();
    }

    const unsubNotify = rpc.onNotify(async (msg) => {
      if (msg.method !== "project.contextChanged") return;
      const params = msg.params as ProjectContextChangedParams | undefined;
      try {
        const [ctx, list] = await Promise.all([rpc.getProjectContext(), rpc.listProjects()]);
        await apply(ctx, list, params?.project_id);
      } catch {
        // ignore
      }
    });

    return () => {
      unsubNotify();
    };
  }, []);

  useEffect(() => {
    if (!isEmbedded()) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: HostProjectContext };
      if (data?.type === TOOL_MSG.PROJECT_CONTEXT && data.payload) {
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
      .then((ctx) => setStartUrl(ctx.base_url ?? ""))
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
