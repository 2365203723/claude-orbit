// UI 文案唯一来源(暂只有 zh)。术语约定:专有名词保留英文(Bundle/Skill/Plugin/MCP/Snippet),
// 计数一律用「N 个 X」句式,避免英文单复数问题。后续接英文 locale 时只需扩充字典。
export const STR = {
  library: {
    title: '能力库',
    searchPlaceholder: '搜索… (⌘F)',
    newBundle: '新建 Bundle',
    sectionBundles: 'Bundles',
    sectionMcp: 'MCP 服务器',
    sectionSkills: 'Skills',
    sectionPlugins: 'Plugins',
    sectionSnippets: '配置片段',
    emptySearch: '没有匹配的结果',
    emptySection: '暂无内容',
    menuEdit: '✏️ 编辑',
    menuDelete: '🗑 删除',
    editEnv: '配置环境变量',
    editSecret: '编辑密钥',
  },
  panel: {
    emptyHint: '点击一个项目查看已分配的能力',
    deleteProject: '删除项目…',
    removeBundle: '移除 Bundle',
    unassign: '撤销装配',
    managedByBundle: '由 Bundle 管理',
    statusApplied: '已应用',
    statusPending: '待应用',
    empty: '暂无内容',
  },
  canvas: {
    addFirstProject: '+ 添加第一个项目',
    menuAddProject: '🆕 添加项目',
    menuDeleteProject: '🔌 删除项目…',
  },
  deleteModal: {
    unmountTitle: '🔌 取消挂载',
    unmountDesc: '移除所有分配，星球不显示。文件保留在磁盘上。',
    trashTitle: '🗑 移到废纸篓',
    trashDesc: '将整个项目目录移入系统废纸篓，可从废纸篓恢复。',
    trashConfirm: '再次点击确认移入废纸篓',
    trashBusy: '正在移入废纸篓…',
    cancel: '取消',
  },
  common: {
    loading: '加载中…',
    close: '关闭',
  },
} as const;

// 计数摘要:「2 个 Skill」——保留接口,接英文 locale 时在此做单复数
export function countLabel(n: number, word: string): string {
  return `${n} 个 ${word}`;
}
