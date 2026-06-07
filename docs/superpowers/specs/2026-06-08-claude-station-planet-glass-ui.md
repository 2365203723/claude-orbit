# Claude Station — M2.6 Planet Graph UI Redesign 设计文档

> 对 M1–M2.5 已完成的 MCP 装配/Apply/全局清理能力做一次 renderer-only 交互与视觉重设计。
> 目标:解决项目卡片重叠、添加体验生硬的问题,把 Claude Station 从"配置卡片面板"
> 升级成 graphify 风格的「项目星球 × MCP 卫星」液态玻璃图谱。

- 日期:2026-06-08
- 状态:设计已确认,待写实现计划
- 范围:MCP-only UI redesign;不新增后端配置能力

---

## 1. 背景与问题

用户体验 M1–M2.5 后反馈:

1. **项目卡片重叠**:当前 `Canvas.tsx` 用固定网格坐标摆放项目节点:
   `x=(i%3)*300+40`, `y=floor(i/3)*240+40`。项目卡片高度会随能力数量增长,
   所以能力多时必然重叠。
2. **添加体验不好**:当前从左侧拖 MCP 到项目卡片,视觉反馈弱,更像表单拖拽,不像图谱装配。
3. **想要 graphify 的图谱感**:项目应该像星球,能力像围绕它的小组件/卫星,连接关系一眼可见。
4. **视觉要求升级**:整体希望是「液态玻璃」质感,但仍保留 Claude 的高保真暖色气质。

现有后端能力已完成且通过安全审查,本次不重写:

- reverse-import scanner;
- desired state store;
- assign / apply / cleanup IPC;
- hasSecrets 路由;
- diff/backup/structural write;
- global MCP cleanup 安全模型。

---

## 2. 已确认设计决策

| 维度 | 决策 |
|------|------|
| 图谱模型 | **星球 + 轨道吸附**:项目是稳定星球,MCP 是环绕卫星 |
| 添加体验 | **拖拽 + 吸附预览**:保留左侧库,拖近星球时出现引力场/轨道预览/落点 |
| 视觉方向 | **A 为主 + B 为辅**:Claude 暖色液态玻璃 + 轻星系空间感 |
| 功能范围 | **只做 MCP**。Skills / Plugins 不做假交互,等后端 M3 完成后再接入 |
| 技术边界 | renderer-only;尽量不碰 `src/main/station/*` 安全后端 |
| 里程碑名 | M2.6 Planet Graph UI Redesign |

---

## 3. 新画布模型

### 3.1 Project Planet

项目不再是矩形卡片,而是圆形玻璃星球:

- 星球中心显示项目名;
- 副信息显示 `N MCP · pending/global` 等摘要;
- 星球大小按 MCP 数量轻微变化,但设置上下限,避免失控;
- hover / drag-over 时出现外圈发光和引力场;
- 点击星球仍选中项目并打开右侧详情面板。

### 3.2 MCP Satellite

已装配的 MCP 不再挤在卡片内部,而是作为卫星沿星球轨道分布:

- 每个 MCP 是玻璃胶囊或小圆体;
- 含密钥显示钥匙图标;
- 状态通过颜色区分:
  - 已应用:柔橄榄/暖灰;
  - 待应用:琥珀;
  - 全局注入候选/可退役:陶土橙或绿点;
  - 风险/漂移:锈红。
- 卫星与星球之间用柔和轨道线/引力线连接。

### 3.3 防重叠布局

彻底替换固定网格。v1 使用确定性极坐标布局,不引入新的物理模拟依赖:

- 项目星球按黄金角螺旋或同心环排列;
- 每个项目给一个安全半径:`planetRadius + orbitRadius + satelliteSize + gap`;
- 相邻项目之间留出固定最小距离;
- React Flow 仍负责 pan/zoom/selection,但节点位置由布局函数计算;
- 卫星由 ProjectPlanet 内部绝对定位渲染,不再作为独立 React Flow 节点,降低复杂度。

这样能稳定解决重叠,也避免力导向布局带来的抖动和不可控。

---

## 4. 添加交互:拖拽 + 吸附预览

### 4.1 默认状态

左侧 `LibraryRail` 继续显示 MCP 库,但改成液态玻璃胶囊列表。每个 MCP 可拖拽。

### 4.2 拖拽中

当拖起一个 MCP:

- 画布进入 `draggingMcpId` 状态;
- 所有项目星球显示淡淡引力场;
- 鼠标靠近某个星球时,该星球进入 `drag-over` 状态。

### 4.3 吸附预览

拖近项目星球时:

- 星球外圈发光;
- 显示一条半透明预览轨道;
- 在下一可用轨道槽位显示半透明卫星;
- 如果该 MCP 已装配到该项目,显示"已在轨道中"提示,松手不重复添加。

### 4.4 松手落位

松手时:

- 若 MCP 未装配:调用现有 `window.station.assign(projectPath, mcpId)`;
- 更新 desired state;
- 顶栏 Apply 计数更新;
- 新卫星以待应用状态出现在轨道上。

Apply / diff / confirm / backup / write 流程全部复用 M2。

---

## 5. 液态玻璃视觉语言

### 5.1 总方向

采用 **Claude 暖色液态玻璃 + 轻星系空间感**:

- 不做冷蓝科技风;
- 不做纯黑宇宙;
- 以 Claude 暖纸色、陶土橙、暖灰为基础;
- 叠加玻璃折射、柔光晕、星尘网格和景深。

### 5.2 Token 扩展

在现有 `tokens.css` 上新增语义 token,组件不直接写大段色值:

- `--glass-surface`
- `--glass-surface-strong`
- `--glass-border`
- `--glass-highlight`
- `--glass-shadow`
- `--orbit-line`
- `--orbit-line-active`
- `--gravity-glow`
- `--space-dust`

浅色主题以 cream/ivory 为底;深色主题以 warm charcoal 为底。

### 5.3 星球材质

项目星球使用:

- `border-radius: 999px`;
- `background: radial-gradient(...) + rgba(...)`;
- `backdrop-filter: blur(18px) saturate(1.3)`;
- 内部高光 `box-shadow: inset ...`;
- 外部柔阴影和陶土橙边缘光;
- hover / drag-over 时增强外圈 glow。

### 5.4 画布背景

背景不是纯白也不是纯黑:

- 浅色:暖纸底 + 极淡星尘点阵 + 陶土橙/象牙径向光晕;
- 深色:暖炭底 + 低透明星尘 + 陶土橙远光;
- 继续保留 React Flow pan/zoom 控制,但隐藏默认网格的机械感,改成更柔的 space dust。

---

## 6. 文件级设计

### 6.1 新增/重写 renderer 文件

- `src/renderer/canvas/orbitLayout.ts`
  - 纯函数:根据项目数量和每个项目 MCP 数量计算星球位置、星球半径、轨道半径。
  - 单元测试覆盖:不重叠、确定性、不同项目数量。

- `src/renderer/canvas/ProjectPlanet.tsx`
  - 替代 `ProjectNode` 的主要视觉。
  - 渲染星球、轨道、卫星、drag-over 预览。
  - 接收 `project`, `assignedMcpIds`, `libraryMcp`, `draggingMcpId`, `onDropMcp`。

- `src/renderer/canvas/McpSatellite.tsx`
  - 渲染单个 MCP 卫星/胶囊。
  - 显示 hasSecrets、状态、名称。

- `src/renderer/canvas/Canvas.tsx`
  - 使用 `orbitLayout` 计算项目节点位置。
  - React Flow node type 改为 `planet`。
  - 管理拖拽 hover 状态,把数据传给 `ProjectPlanet`。

- `src/renderer/rail/LibraryRail.tsx`
  - 保留 API,改视觉为玻璃胶囊。
  - 拖拽开始时设置 `application/x-mcp-id`。

- `src/renderer/theme/tokens.css`
  - 扩展 liquid glass tokens。

### 6.2 保留/轻改文件

- `src/renderer/App.tsx`
  - 继续负责 state/reload/apply/cleanup;
  - 增加 `draggingMcpId` state,传给 `LibraryRail` / `Canvas`。

- `src/renderer/panel/DetailPanel.tsx`
  - v1 可保持,后续再玻璃化。

- `src/main/station/*`
  - 不改。

---

## 7. 测试策略

### 7.1 自动测试

重点测纯函数 `orbitLayout`:

- 项目数量 1/3/7/12 时返回稳定位置;
- 任意两个项目的安全半径不重叠;
- MCP 数量越多,轨道半径增加但有上限;
- 同输入多次调用结果完全一致。

### 7.2 构建验证

- `npx vitest run` 全绿;
- `npx tsc --noEmit` clean;
- `npm run build` 无 error。

### 7.3 手动验证

- 7 个项目不重叠;
- 缩放/平移顺畅;
- 拖 MCP 时所有星球显示引力场;
- 拖近某星球出现吸附预览;
- 松手后 MCP 成为该星球卫星,Apply 计数更新;
- 已装配 MCP 不重复添加;
- 浅/深主题下玻璃质感都成立。

---

## 8. 非目标

- 不做 Skills / Plugins 的卫星交互;
- 不改 Apply / cleanup 后端;
- 不引入 d3-force 或新布局依赖;
- 不做复杂物理动画;
- 不做真实 3D / WebGL。

---

## 9. 成功标准

- 项目节点不再重叠;
- 添加 MCP 的主体验从"拖到卡片"升级为"拖近星球吸附成卫星";
- 液态玻璃视觉明显,但仍保留 Claude 暖色气质;
- 现有 M2/M2.5 安全能力全部可用;
- 自动测试与构建通过。
