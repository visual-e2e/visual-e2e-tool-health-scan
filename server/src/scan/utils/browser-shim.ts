/**
 * Shim for tsx/esbuild `__name` helper inside `page.evaluate`.
 * Must be the first statement in every browser evaluate callback.
 */
export const BROWSER_EVAL_SHIM = "var __name=function(t){return t};";
