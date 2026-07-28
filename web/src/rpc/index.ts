import { createToolRpcClient, type ToolRpcClient } from "./client";

let _client: ToolRpcClient | null = null;

/** Singleton RPC client — call inside browser context only. */
export function getRpcClient(): ToolRpcClient {
  if (!_client) {
    _client = createToolRpcClient();
  }
  return _client;
}

export function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

export * from "./protocol";
export type { ToolRpcClient };
