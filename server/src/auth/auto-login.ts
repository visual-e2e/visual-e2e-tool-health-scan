import type { Page } from "playwright";
import type { LoginProfile, LoginSelectors } from "../types.js";

export interface AutoLoginResult {
  ok: boolean;
  message: string;
}

const DEFAULT_SELECTORS: Required<LoginSelectors> = {
  username: "input[type='text'], input[name='username'], input[name='email'], input#username",
  password: "input[type='password']",
  submit: "button[type='submit'], button:has-text('登录'), button:has-text('Sign in')",
  successUrlPattern: "",
};

export async function attemptAutoLogin(
  page: Page,
  profile: LoginProfile | undefined,
  selectors?: LoginSelectors,
): Promise<AutoLoginResult> {
  const username = profile?.username?.trim();
  const password = profile?.password ?? "";
  if (!username || !password) {
    return { ok: false, message: "未配置登录账号或密码" };
  }

  const sel = { ...DEFAULT_SELECTORS, ...selectors };
  try {
    const userLoc = page.locator(sel.username).first();
    const passLoc = page.locator(sel.password).first();
    const submitLoc = page.locator(sel.submit).first();

    const userVisible = await userLoc.isVisible({ timeout: 3000 }).catch(() => false);
    if (!userVisible) {
      return { ok: false, message: "未检测到登录表单，跳过自动登录" };
    }

    await userLoc.fill(username);
    await passLoc.fill(password);
    await submitLoc.click({ timeout: 5000 });
    await page.waitForTimeout(1500);

    if (sel.successUrlPattern) {
      const url = page.url();
      if (!url.includes(sel.successUrlPattern)) {
        return { ok: false, message: "登录后 URL 未匹配成功模式" };
      }
    }

    return { ok: true, message: "自动登录成功" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `自动登录失败: ${msg}` };
  }
}
