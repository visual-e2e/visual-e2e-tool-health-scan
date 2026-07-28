/**
 * tsx/esbuild injects __name() for keepNames; it is undefined in page.evaluate.
 * Prepend this as the first statement inside every evaluate callback.
 */
export const EVAL_NAME_POLYFILL = "var __name=function(t){return t};";
