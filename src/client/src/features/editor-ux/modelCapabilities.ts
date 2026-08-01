export const TOOL_CAPABILITIES = {
  remove: {
    executable: false,
    reason: '区域蒙版选择尚未接入，当前功能开发中，暂不可执行。',
  },
  export: {
    executable: true,
    localOnly: true,
    reason: '导出仅在浏览器本地编码，不调用图像生成接口。',
  },
} as const;

export function canExecutePlaceholderRemove(): boolean {
  return TOOL_CAPABILITIES.remove.executable;
}
