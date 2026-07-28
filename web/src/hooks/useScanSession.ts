import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { message } from "antd";
import { api } from "../api/client";
import { LIVE_STATUSES } from "../constants";
import type { ScanOptions, ScanSession } from "../types";

export function useScanSession() {
  const [session, setSession] = useState<ScanSession | null>(null);

  useEffect(() => {
    if (!session || !LIVE_STATUSES.has(session.status)) return;
    const timer = window.setInterval(() => {
      api
        .getScan(session.sessionId)
        .then(setSession)
        .catch(() => undefined);
    }, 800);
    return () => window.clearInterval(timer);
  }, [session?.sessionId, session?.status]);

  const launchMut = useMutation({
    mutationFn: (body: Partial<ScanOptions> & { startUrl: string }) => api.createScan(body),
    onSuccess: (data) => {
      setSession(data);
      message.success("浏览器启动中，就绪后可登录再开始扫描");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const startMut = useMutation({
    mutationFn: () => api.startScan(session!.sessionId),
    onSuccess: (data) => {
      setSession(data);
      message.success("已开始扫描");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const pauseMut = useMutation({
    mutationFn: () => api.pauseScan(session!.sessionId),
    onSuccess: (data) => {
      setSession(data);
      message.info("已请求暂停");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const resumeMut = useMutation({
    mutationFn: () => api.resumeScan(session!.sessionId),
    onSuccess: (data) => {
      setSession(data);
      message.success("已继续扫描");
    },
    onError: (err: Error) => message.error(err.message),
  });

  const stopMut = useMutation({
    mutationFn: () => api.stopScan(session!.sessionId),
    onSuccess: (data) => {
      setSession(data);
      message.info("已请求停止");
    },
    onError: (err: Error) => message.error(err.message),
  });

  return {
    session,
    setSession,
    launchMut,
    startMut,
    pauseMut,
    resumeMut,
    stopMut,
  };
}
