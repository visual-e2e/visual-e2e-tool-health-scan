# 健康扫描 (`health-scan`)

扫描目标站点的：

1. 静态资源 404 / 失败请求  
2. 接口 5xx  
3. 页面布局错乱（溢出、白屏、遮挡等启发式）  
4. 失效点击（可见可点元素无反馈）

## 开发

```bash
npm install
npm run dev
# API http://127.0.0.1:3203
# Web http://127.0.0.1:5203
```

依赖主应用提供的 Chromium（`E2E_ROOT` / `browser-runtime`），与场景录制工具相同。

## 打包

```bash
npm run pack
# → dist/health-scan-1.0.0.vettool.zip
```

在 Visual E2E Test → 工具箱安装该 zip。Playwright 由 Host 通过 `NODE_PATH` 注入，不打进包内。
