import type { Page } from "playwright";
import { IssueCategory, IssueSeverity, PhaseName, getDefaultProbeSelectors, resolveProbeSelectors } from "../../types.js";
import { addIssue, markPhase, touch, type ActiveScan } from "../session-context.js";
import { BROWSER_EVAL_SHIM } from "../utils/browser-shim.js";

export async function runLayoutProbe(session: ActiveScan, page: Page): Promise<void> {
  if (!session.options.enableLayout) return;

  session.progress = "检测页面布局…";
  touch(session);
  markPhase(session, PhaseName.Layout, false);

  const pageUrl = page.url();
  const layoutProbe = resolveProbeSelectors(
    session.options.probeSelectors ?? getDefaultProbeSelectors(),
  ).layoutSample;

  const result = await page.evaluate(
    (payload: { shim: string; layoutSels: string[] }) => {
      eval(payload.shim);
      const doc = document.documentElement;
      const body = document.body;
      const findings: Array<{ title: string; detail: string; severity: IssueSeverity }> = [];

      const scrollOverflow = doc.scrollWidth - doc.clientWidth;
      if (scrollOverflow > 24) {
        findings.push({
          title: "横向溢出",
          detail: `scrollWidth 超出 clientWidth ${scrollOverflow}px`,
          severity: IssueSeverity.Warning,
        });
      }

      const children = body ? body.children.length : 0;
      const bodyHeight = body?.getBoundingClientRect().height ?? 0;
      if (children <= 1 && bodyHeight < 80) {
        findings.push({
          title: "疑似白屏/空壳",
          detail: `body 子节点 ${children}，高度 ${Math.round(bodyHeight)}px`,
          severity: IssueSeverity.Error,
        });
      }

      const styledProbe: Element[] = [];
      for (const sel of payload.layoutSels) {
        try {
          styledProbe.push(...Array.from(document.querySelectorAll(sel)));
        } catch {
          // skip
        }
      }
      const sample = styledProbe.slice(0, 30);
      let unstyled = 0;
      for (const el of sample) {
        const style = window.getComputedStyle(el as HTMLElement);
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width < 2) continue;
        const hasBox =
          style.padding !== "0px" ||
          style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          parseFloat(style.borderRadius) > 0;
        if (!hasBox && el.tagName !== "A") unstyled += 1;
      }
      if (sample.length >= 5 && unstyled / sample.length > 0.7) {
        findings.push({
          title: "CSS 疑似未生效",
          detail: `抽样 ${sample.length} 个 UI 元素中 ${unstyled} 个缺少常见样式`,
          severity: IssueSeverity.Error,
        });
      }

      const candidates = Array.from(
        document.querySelectorAll(
          "a, button, [role='button'], input[type='button'], input[type='submit']",
        ),
      ).slice(0, 40);

      let blocked = 0;
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const top = document.elementFromPoint(cx, cy);
        if (!top) continue;
        if (top === el || el.contains(top) || top.contains(el)) continue;
        blocked += 1;
      }
      if (blocked >= 3) {
        findings.push({
          title: "可交互元素被遮挡",
          detail: `抽样发现 ${blocked} 个元素中心点被其它节点覆盖`,
          severity: IssueSeverity.Warning,
        });
      }

      return findings;
    },
    { shim: BROWSER_EVAL_SHIM, layoutSels: layoutProbe },
  );

  for (const f of result) {
    addIssue(session, {
      category: IssueCategory.Layout,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      pageUrl,
    });
  }

  markPhase(session, PhaseName.Layout, true);
  touch(session);
}
