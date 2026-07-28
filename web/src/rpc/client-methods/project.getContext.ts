import type { ProjectContextResult } from "../protocol";
import type { RpcCall } from "./types";

export function projectGetContext(call: RpcCall): () => Promise<ProjectContextResult> {
  return () => call<ProjectContextResult>("project.getContext");
}

