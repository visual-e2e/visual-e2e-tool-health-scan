import type { RpcCall } from "./types";

export function fsPickFolder(call: RpcCall): () => Promise<{ path: string | null }> {
  return () => call<{ path: string | null }>("fs.pickFolder");
}

