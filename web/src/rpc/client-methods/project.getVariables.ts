import type { GetProjectVariablesParams } from "../protocol";
import type { RpcCall } from "./types";

export function projectGetVariables(call: RpcCall): (projectId?: string) => Promise<Record<string, Record<string, string>>> {
  return (projectId?: string) =>
    call("project.getVariables", { projectId } satisfies GetProjectVariablesParams);
}

