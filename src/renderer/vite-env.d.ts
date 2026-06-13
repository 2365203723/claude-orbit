/// <reference types="vite/client" />

declare global {
  interface Window {
    // 唯一类型来源是 preload 的 api 对象——避免双份手写漂移
    station: import('../preload/index').StationApi;
    terminal: import('../preload/index').TerminalApi;
  }
}
export {};

// Electron 自定义窗口拖拽区域属性(标准 CSSProperties 没有)
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}
