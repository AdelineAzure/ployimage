# POLYIMAGE · DeerAPI 图像任务工具

一个基于 React + Vite 的网页工具，用于多模型生图、提示词对比、风格批量任务与图集导出。  
支持 DeerAPI 通道，适合做模型对照、提示词实验和风格探索。

---

## 1) 快速可用（网页可见 + API 跑通）

### 环境要求
- Node.js 18+（推荐 LTS）
- 可用 DeerAPI Key（`sk-...`）
- Cloudflare 账号（用于部署 Worker 代理）

### 本地启动网页（先看到界面）
```bash
cd "/Users/mac/Desktop/模版检测工具"
npm install
npm run dev
```

浏览器打开终端输出的本地地址（默认 `http://localhost:5173`）。

### 配置 API 通路（让生成真正可用）
1. 将根目录 `cloudflare-worker-deerapi.js` 部署到 Cloudflare Worker。
2. 在 Worker 环境变量中配置 `DEERAPI_KEY=你的sk...`。
3. 回到网页右上角 `⚙`，填入 Worker URL。
4. （可选）右上角 `API` 中填 Key。留空时走 Worker 环境变量。

### 2 分钟自检（确认 API 跑通）
1. 选 `Single` 模式。
2. 输入任意 prompt（例如：`a cinematic portrait, soft light`）。
3. 选任意 1 个模型，数量设为 1。
4. 点击 `Enqueue Task`。
5. 若状态从 `loading` 到 `success` 且出现图片，说明 API 链路已跑通。

---

## 2) 核心功能

### 任务模式
- `Single`：单提示词多模型出图。
- `Prompt Compare`：同图双提示词并行对比（A/B）。
- `Style`：单模型 + 多主题词批量任务，生成风格一致、主题变化的结果。

### 模型与参数
- 支持多模型选择、每模型数量设置、统一同步数量。
- 支持图像比例选择（如 `1:1`、`16:9` 等）。

### 输入与模板
- 普通模板：用于 `Single/Compare` 的提示词模板。
- Style 模板：独立于普通模板，配合 12 个主题词槽位。
- 支持 `{{ }}` 占位编辑与快捷插入。

### 图像输入
- `Single/Compare`：单参考图输入。
- `Style`：输入图 + 参考图分离管理；参考图支持多张（2x2 视图、弹窗内增删、多选上传）。

### GPT 助手
- 仅改写 `{{ }}` 内文本，不直接生图。
- 可带输入图作为视觉上下文。
- GPT 规则可保存并随历史文件夹加载。

### 历史与复用
- 支持选择 `History Folder` 后本地持久化：
  - 任务记录
  - 模板/Style 模板
  - GPT 配置
  - API 配置
- 历史任务支持 `Reuse / Sync Template / Hide / Delete`。

### Style 图集工作流
- 可跨任务选图（上限 15 张）。
- 生成缩略图（拼接）。
- 导出图集文件夹（非压缩包，含选中图 + 缩略图 + manifest）。

---

## 3) 适用场景

- **提示词迭代**：快速验证同一想法在不同措辞下的差异。
- **模型选型**：同 prompt 比较多模型输出风格、稳定性、细节。
- **风格保持批量出图**：固定风格，多主题批量产出素材。
- **内容团队评审**：通过历史记录与图集导出做协作筛选。

---

## 4) 常见问题（简版）

- 页面能打开但无法生成：优先检查 Worker URL、Worker 环境变量 `DEERAPI_KEY`、网络权限。
- 有结果但图片加载失败：先尝试预览/下载，确认是否是第三方图床防盗链导致。
- 模板点击无效：确保已选择 History Folder（模板写入依赖本地目录权限）。

---

## 5) 主要文件

- `src/App.jsx`：主页面与核心逻辑。
- `cloudflare-worker-deerapi.js`：Worker 代理示例。
- `package.json`：脚本与依赖。
- `vite.config.js`：Vite 配置。
