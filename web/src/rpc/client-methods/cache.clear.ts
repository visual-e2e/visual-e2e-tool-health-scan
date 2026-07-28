import type { RpcCall } from "./types";

export function cacheClear(call: RpcCall): () => Promise<void> {
  return () => call<void>("cache.clear");
}

