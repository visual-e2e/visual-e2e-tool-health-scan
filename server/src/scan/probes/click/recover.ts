import type { Page } from "playwright";
import {
  FailureCode,
  getDefaultProbeSelectors,
  resolveProbeSelectors,
  type ProbeSelectorsConfig,
} from "../../../types.js";
import { closeTopOverlay } from "./close.js";

export async function tryRecoverFromFailure(
  page: Page,
  failureCode: FailureCode,
  probe: ProbeSelectorsConfig = getDefaultProbeSelectors(),
): Promise<boolean> {
  if (failureCode === FailureCode.PointerIntercepted) {
    const resolved = resolveProbeSelectors(probe);
    const closed = await closeTopOverlay(
      page,
      resolved.overlayClose,
      resolved.overlay,
      resolved.overlayTitle,
    );
    if (closed) {
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}
