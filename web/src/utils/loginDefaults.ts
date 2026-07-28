import {
  DEFAULT_SCAN_OPTIONS,
  type LoginDefaults,
  type LoginProfile,
  type LoginSelectors,
} from "../types";

export function resolveLoginDefaults(
  vars: Record<string, Record<string, string>>,
): LoginDefaults {
  const global = vars.global ?? {};
  const login = vars.login ?? {};
  const flat = Object.values(vars).reduce(
    (acc, scope) => ({ ...acc, ...scope }),
    {} as Record<string, string>,
  );

  const baseUrl = (global.url ?? flat.url ?? "").replace(/\/$/, "");
  const loginPath = login.login_path ?? flat.login_path ?? "";
  const startUrl = baseUrl && loginPath ? `${baseUrl}${loginPath.startsWith("/") ? loginPath : `/${loginPath}`}` : baseUrl;

  const username =
    flat.USERNAME ?? flat.username ?? flat.login_username ?? flat["login.username"] ?? "";
  const password =
    flat.PASSWORD ?? flat.password ?? flat.login_password ?? flat["login.password"] ?? "";

  return {
    startUrl: startUrl || undefined,
    loginProfile: username || password ? { username, password, source: "rpc" } : undefined,
    loginSelectors: {
      username:
        login.login_username_selector ??
        flat.login_username_selector ??
        DEFAULT_SCAN_OPTIONS.loginSelectors?.username,
      password:
        login.login_password_selector ??
        flat.login_password_selector ??
        DEFAULT_SCAN_OPTIONS.loginSelectors?.password,
      submit:
        login.login_submit_selector ??
        flat.login_submit_selector ??
        DEFAULT_SCAN_OPTIONS.loginSelectors?.submit,
    },
  };
}
