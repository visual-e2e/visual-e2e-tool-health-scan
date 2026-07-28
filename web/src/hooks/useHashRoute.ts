import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | { type: "list" }
  | { type: "detail"; profileId: string };

function parseHash(): AppRoute {
  const hash = window.location.hash.replace(/^#/, "");
  const match = /^\/profiles\/([^/?]+)/.exec(hash);
  if (match?.[1]) return { type: "detail", profileId: decodeURIComponent(match[1]) };
  return { type: "list" };
}

export function useHashRoute(): [AppRoute, (route: AppRoute) => void] {
  const [route, setRouteState] = useState<AppRoute>(() => parseHash());

  useEffect(() => {
    const onHashChange = () => setRouteState(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setRoute = useCallback((next: AppRoute) => {
    if (next.type === "list") {
      window.location.hash = "#/";
    } else {
      window.location.hash = `#/profiles/${encodeURIComponent(next.profileId)}`;
    }
    setRouteState(next);
  }, []);

  return [route, setRoute];
}

export function navigateToProfile(profileId: string): void {
  window.location.hash = `#/profiles/${encodeURIComponent(profileId)}`;
}

export function navigateToList(): void {
  window.location.hash = "#/";
}
