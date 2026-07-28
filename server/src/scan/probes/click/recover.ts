import type { Page } from "playwright";
import { FailureCode } from "../../../types.js";
import { closeTopOverlay } from "./close.js";

export async function tryRecoverFromFailure(
  page: Page,
  failureCode: FailureCode,
): Promise<boolean> {
  if (failureCode === FailureCode.PointerIntercepted) {
    const closed = await closeTopOverlay(page);
    if (closed) {
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}
