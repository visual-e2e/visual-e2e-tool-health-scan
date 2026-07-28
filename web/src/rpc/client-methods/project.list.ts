import type { ProjectListItem } from "../protocol";
import type { RpcCall } from "./types";

export function projectList(call: RpcCall): () => Promise<ProjectListItem[]> {
  return () => call<ProjectListItem[]>("project.list");
}

