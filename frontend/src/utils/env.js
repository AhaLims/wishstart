// 运行环境标记：桌面端（Electron）通过 preload 注入 window.wishstarDesktop
export const isDesktop = () =>
  !!(window.wishstarDesktop && window.wishstarDesktop.isDesktop) ||
  !!window.__WISHSTAR_DESKTOP__
