import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── Model Registry ───
// Each model has its own apiType defining which upstream endpoint/format to use.
const IMAGE_MODELS = [
  // Seedream — /v1/images/generations (豆包生图)
  { id: "doubao-seedream-4-0-250828", name: "Seedream 4.0", shortName: "Seed 4.0", provider: "ByteDance", apiType: "images", platforms: ["deerapi"] },
  { id: "doubao-seedream-4-5-251128", name: "Seedream 4.5", shortName: "Seed 4.5", provider: "ByteDance", apiType: "images", badge: "NEW", platforms: ["deerapi"] },
  { id: "doubao-seedream-5-0-260128", name: "Seedream 5.0 Lite", shortName: "Seed 5", provider: "ByteDance", apiType: "images", badge: "NEW", platforms: ["deerapi"] },
  // Midjourney via /mj
  { id: "midjourney-imagine", name: "Midjourney Imagine", shortName: "Midjourney", provider: "Midjourney", apiType: "midjourney", badge: "BETA", platforms: ["deerapi"] },
  // GPT‑1.5 image — 依旧走 /v1/images/generations
  { id: "gpt-image-1.5", name: "GPT‑1.5 Image", shortName: "GPT-1.5", provider: "OpenAI", apiType: "images", badge: "HOT", platforms: ["deerapi"] },
  // Bailian Qwen Image 系列：走 /api/v1/services/aigc/multimodal-generation/generation
  { id: "qwen-image-2.0", name: "qwen", shortName: "qwen", provider: "Alibaba", apiType: "bailian", badge: "NEW", platforms: ["bailian"] },
  { id: "qwen-image-2.0-pro", name: "qwen pro", shortName: "qwen pro", provider: "Alibaba", apiType: "bailian", badge: "PRO", platforms: ["bailian"] },
  // NanoBanana 系列：本质调用 Gemini 图像模型
  { id: "gemini-2.5-flash-image", name: "NanoBanana", shortName: "Nano", provider: "Google", apiType: "gemini", badge: "HOT", platforms: ["deerapi"] },
  { id: "gemini-3.1-flash-image-preview", name: "NanoBanana 2", shortName: "Nano 2", provider: "Google", apiType: "gemini", badge: "NEW", platforms: ["deerapi"] },
  { id: "gemini-3-pro-image", name: "NanoBanana Pro", shortName: "Nano Pro", provider: "Google", apiType: "gemini", badge: "PRO", platforms: ["deerapi"] },
  // Bailian Wan 2.7 系列
  { id: "wan2.7-image", name: "wan", shortName: "wan", provider: "Alibaba", apiType: "bailian", badge: "NEW", platforms: ["bailian"] },
  { id: "wan2.7-image-pro", name: "wanpro", shortName: "wanpro", provider: "Alibaba", apiType: "bailian", badge: "PRO", platforms: ["bailian"] },
];

const PROVIDER_COLORS = {
  OpenAI: { bg: "#10a37f", text: "#fff" },
  Google: { bg: "#1a73e8", text: "#fff" },
  ByteDance: { bg: "#fe2c55", text: "#fff" },
  Midjourney: { bg: "#6d28d9", text: "#fff" },
  Alibaba: { bg: "#ff6a00", text: "#fff" },
};

const LOCAL_STATE_KEY = "polyimage_local_state_v1";
const DEFAULT_SELECTED_MODELS = [
  "doubao-seedream-4-0-250828",
  "doubao-seedream-4-5-251128",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];
const DEFAULT_MODEL_COUNTS = Object.fromEntries(IMAGE_MODELS.map((m) => [m.id, 1]));
const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const ASPECT_RATIO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "21:9", label: "21:9" },
];
const DEFAULT_TASK_MODE = "single";
const DEFAULT_COMPARE_PROMPTS = { a: "", b: "" };
const DEFAULT_LAST_EDITED_COUNT = 1;
const DEFAULT_ASPECT_RATIO = "auto";
const DEFAULT_API_PLATFORM = "deerapi";
const DEFAULT_API_BASE_URLS = {
  deerapi: "https://api.deerapi.com",
  bailian: "https://dashscope.aliyuncs.com",
};
const DEFAULT_API_BASE_URL = DEFAULT_API_BASE_URLS[DEFAULT_API_PLATFORM];
const DEFAULT_API_KEY = "";
const DEFAULT_API_KEYS = {
  deerapi: DEFAULT_API_KEY,
  bailian: DEFAULT_API_KEY,
};
const DEFAULT_GPT_ASSIST_MODEL = "gpt-4o-mini";
const DEFAULT_BAILIAN_ASSIST_MODEL = "qwen-plus";
const DEFAULT_GPT_ASSIST_PROMPT = "你是一个提示词优化助手。你只改写 {{ }} 里的内容，保持用户原有写作风格、长度和随机感，不要改动大括号外的任何字符。";
const DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT = true;
const DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE = true;
const DEFAULT_STYLE_THEME_ASSIST_PROMPT =
  "你是主题联想助手。用户会给你一个主题词，请输出12个可用于视觉创作的相关元素，要求具体、可见、彼此有区分。只输出JSON：{\"themes\":[\"...\", \"...\"]}，数组长度必须为12。";
const PROMPT_EDITOR_MIN_HEIGHT = 104;
const MAX_TEMPLATES = 8;
const MAX_STYLE_TEMPLATES = 2;
const STYLE_THEME_SLOTS = 12;
const MAX_STYLE_REFERENCE_IMAGES = 4;
const MAX_ATLAS_SELECTED_IMAGES = 20;
const MAX_INPUT_IMAGES_PER_BATCH = 10;
const INPUT_IMAGE_EDITOR_COLORS = ["#f8fafc", "#ef4444", "#f59e0b", "#22c55e", "#38bdf8", "#a855f7"];
const MAX_SPLIT_EXPORT_ITEMS = 120;
const SPLIT_SHAPE_MODE_ORDER = ["edge", "polygon", "rect"];
const SPLIT_RENDER_MODE_ORDER = ["painted", "direct"];
const DEFAULT_SPLIT_SHAPE_MODE = "edge";
const DEFAULT_SPLIT_RENDER_MODE = "painted";
const DEFAULT_SPLIT_BG_COLOR = "#ffffff";
const TEMPLATE_FILE_NAME = "templates.json";
const STYLE_TEMPLATE_FILE_NAME = "style-templates.json";
const GPT_ASSIST_FILE_NAME = "gpt-assist.json";
const API_CONFIG_FILE_NAME = "api-config.json";
const DEFAULT_TEMPLATES = Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
  id: `template-${index + 1}`,
  title: `Preset ${index + 1}`,
  body: "",
  backup: "",
  memo: "",
}));
const DEFAULT_STYLE_TEMPLATES = Array.from({ length: MAX_STYLE_TEMPLATES }, (_, index) => ({
  id: `style-template-${index + 1}`,
  title: `Style ${index + 1}`,
  body: "",
}));
const DEFAULT_STYLE_THEMES = Array.from({ length: STYLE_THEME_SLOTS }, () => "");
const NANO_PRO_OFFICIAL_MODEL_ID = "gemini-3-pro-image";
const NANO_PRO_LEGACY_MODEL_IDS = ["nano-banana-pro-all", "gemini-3-pro-preview"];
const DEFAULT_UI_LANGUAGE = "en";
const I18nContext = createContext({
  uiLanguage: DEFAULT_UI_LANGUAGE,
  t: (key, params) => interpolateTemplate(key, params),
});

const UI_TEXT = {
  en: {
    "settings.title": "Configuration",
    "settings.proxyLabel": "Cloudflare Worker Proxy URL",
    "settings.showWorkerCode": "Show Worker Code",
    "settings.hideWorkerCode": "Hide Worker Code",
    "settings.language": "Language",
    "settings.languageEnglish": "English",
    "settings.languageChinese": "中文",
    "api.title": "API Key",
    "api.deerapiLabel": "DeerAPI Key",
    "api.bailianLabel": "Bailian Key",
    "gpt.title": "GPT Prompt",
    "gpt.rewriteLabel": "GPT Rewrite Instruction",
    "gpt.themeLabel": "Style Theme Association Instruction",
    "gpt.contextLabel": "Generation Prompt Context",
    "gpt.sendPromptTextLabel": "Send generation prompt text",
    "gpt.sendPromptTextHint": "This controls the image-generation prompt, not the rewrite instruction above.",
    "gpt.sendPromptImageLabel": "Send prompt image",
    "gpt.sendPromptImageHint": "Turning this off stops sending the current input image to GPT.",
    "common.save": "Save",
    "common.saved": "Saved",
    "common.unsavedChanges": "Unsaved changes",
    "common.savedAt": "Saved at {{time}}",
    "common.on": "On",
    "common.off": "Off",
    "common.upload": "Upload",
    "common.processing": "Processing...",
    "common.unknownError": "Unknown error",
    "common.edit": "Edit",
    "common.title": "Title",
    "common.body": "Body",
    "common.backup": "Backup",
    "common.memo": "Memo",
    "template.title": "Template Modify",
    "template.titlePlaceholder": "Template title",
    "template.bodyPlaceholder": "Main template content",
    "template.backupPlaceholder": "Backup template content",
    "template.memoPlaceholder": "Notes, spare prompts, or copied backups",
    "template.styleTitle": "Style Template",
    "template.styleTitlePlaceholder": "Style template title",
    "template.styleBodyPlaceholder": "Style template prompt",
    "template.insertPlaceholder": "Insert placeholder {{ }}",
    "template.edit": "Edit template",
    "template.editStyle": "Edit style template",
    "images.defaultTitle": "Images",
    "images.inputTitle": "Input Images",
    "images.referenceTitle": "Reference Images",
    "images.modalHint": "First slot is upload. Changes save automatically when you close.",
    "imageEditor.title": "Prompt Image Editor",
    "imageEditor.hint": "Drag on the canvas to crop or annotate. Confirm will replace the current prompt images.",
    "imageEditor.tools": "Tools",
    "imageEditor.colors": "Colors",
    "imageEditor.toolCrop": "Crop",
    "imageEditor.toolRect": "Box",
    "imageEditor.toolLine": "Line",
    "imageEditor.toolArrow": "Arrow",
    "imageEditor.undo": "Undo",
    "imageEditor.applyCrop": "Apply Crop",
    "imageEditor.clearCrop": "Clear Crop",
    "imageEditor.confirm": "Confirm",
    "imageEditor.cancel": "Cancel",
    "imageEditor.prev": "Prev",
    "imageEditor.next": "Next",
    "imageEditor.page": "Image {{current}} / {{total}}",
    "imageEditor.noImage": "No image loaded.",
    "imageEditor.cropHint": "Drag to define a crop area, then click Apply Crop.",
    "imageEditor.drawHint": "Drag on the image to draw the current annotation.",
    "imageEditor.cropReady": "Crop area ready.",
    "imageEditor.multiHint": "Switch the thumbnails below to edit each uploaded image.",
    "selectionLimit.title": "Selection limit reached",
    "selectionLimit.text": "You can select up to {{limit}} images for atlas export.",
    "action.save": "Save",
    "action.retry": "Retry",
    "action.addOne": "Add one more",
    "split.open": "Auto split",
    "split.title": "Split Console",
    "split.original": "Original Image",
    "split.removed": "Background Removed",
    "split.process": "Process View",
    "split.results": "Split Subjects",
    "split.detecting": "Detecting subjects...",
    "split.noSubjects": "No subjects detected.",
    "split.count": "{{count}} subjects",
    "split.reSplit": "Re-split",
    "split.run": "Run Split",
    "split.sourceRemoved": "Remove BG First",
    "split.sourceOriginal": "Keep Background",
    "split.qualityEnhanced": "Quality: Enhanced",
    "split.qualityOriginal": "Quality: Original",
    "split.upload": "Upload Image",
    "split.export": "Export",
    "split.exporting": "Exporting...",
    "split.merge": "Merge Selected",
    "split.mergeNeedTwo": "Select at least 2 subjects to merge.",
    "split.merged": "Merged {{count}} subjects.",
    "split.delete": "Delete",
    "split.undo": "Undo",
    "split.undoHint": "Undo: Ctrl/Cmd + Z",
    "split.whiteBgOn": "White BG: On",
    "split.whiteBgOff": "White BG: Off",
    "split.renderPainted": "Output: Fill BG",
    "split.renderDirect": "Output: Direct Crop",
    "split.shapeEdge": "Shape: Edge",
    "split.shapePolygon": "Shape: Polygon",
    "split.shapeRect": "Shape: Rectangle",
    "split.enhance": "Enhance to 1024",
    "split.enhancing": "Enhancing...",
    "split.enhanced": "Enhanced {{count}} split image(s), minimum long side 1024.",
    "split.deletedOne": "Deleted one split image.",
    "split.undoDone": "Undo completed.",
    "split.unsupported": "Folder picker is unsupported in this browser.",
    "split.pickFolderFailed": "Export failed: {{error}}",
    "split.exported": "Split export completed: {{folder}} ({{count}} subjects + original)",
    "split.exportNoItems": "No split subjects to export.",
    "split.loadFailed": "Split failed: {{error}}",
    "split.previewSplit": "Preview split image {{index}}",
    "atlas.title": "Thumbnail",
    "atlas.hint": "Drag to reorder. Atlas export and thumbnail follow this order.",
    "atlas.empty": "No selected images yet.",
    "atlas.refresh": "Refresh Thumbnail",
    "atlas.generate": "Generate Thumbnail",
    "atlas.openEditor": "Open thumbnail editor",
    "help.title": "Help",
    "help.hero": "Polyimage compares image models, re-runs tasks quickly, and exports selected images into one atlas folder.",
    "nav.single": "Single",
    "nav.compare": "Prompt Compare",
    "nav.style": "Style",
    "nav.help": "Help",
    "nav.gptPrompt": "GPT Prompt",
    "nav.api": "API",
    "header.subtitle": "Multi-Model Generation · DeerAPI / Bailian",
    "workspace.prompt": "PROMPT",
    "workspace.prompts": "PROMPTS",
    "workspace.compareHint": "Shared image, dual prompt runs",
    "workspace.referenceImage": "REFERENCE IMAGE",
    "workspace.reference": "REFERENCE",
    "workspace.input": "INPUT",
    "workspace.models": "SELECT MODELS",
    "workspace.syncCount": "Sync Last Edited Count",
    "workspace.imageRatio": "IMAGE RATIO",
    "workspace.templates": "TEMPLATES",
    "workspace.styleTemplates": "STYLE TEMPLATES",
    "workspace.themes": "THEMES (12)",
    "workspace.clearAll": "Clear All",
    "workspace.themeSeedPlaceholder": "Theme association seed, e.g. coffee",
    "workspace.themePlaceholder": "Theme {{index}}",
    "workspace.promptAPlaceholder": "Describe prompt A...",
    "workspace.promptBPlaceholder": "Describe prompt B...",
    "workspace.promptPlaceholder": "Describe the image you want to generate...",
    "workspace.rewriteByGpt": "Rewrite {{ }} by GPT",
    "workspace.noPlaceholder": "No {{ }} placeholder found",
    "workspace.enqueueTask": "⬡ Enqueue Task",
    "workspace.enqueueCompare": "⬡ Enqueue Compare Tasks",
    "workspace.enqueueStyle": "⬡ Enqueue Style Tasks",
    "workspace.runningQueued": "Running {{running}} · Queued {{queued}}",
    "workspace.downloadAll": "↓ Download All Dialogs (.zip)",
    "workspace.selectHistoryFolder": "Select History Folder",
    "workspace.switchHistoryFolder": "Switch History Folder",
    "workspace.reloadHistory": "Reload Folder History",
    "workspace.connected": "Connected: {{name}}",
    "workspace.noFolderSelected": "No folder selected",
    "workspace.folderUnsupported": "Folder API unsupported in this browser",
    "workspace.selectedCount": "Selected {{count}}/{{max}}",
    "workspace.clearSelections": "Clear Selections",
    "workspace.exportAtlas": "Export Atlas Folder",
    "workspace.thumbnail": "Thumbnail",
    "workspace.currentDialog": "Current Dialog",
    "workspace.historyDialogs": "History Dialogs",
    "workspace.loadMore": "Load 4 More Dialogs",
    "turn.compare": "Compare",
    "turn.style": "Style",
    "turn.syncTemplate": "Sync Template",
    "turn.reuse": "Reuse",
    "turn.delete": "Delete",
    "turn.summaryModel": "Model",
    "turn.summaryPerTask": "Per Task",
    "turn.summaryGenerated": "Generated",
    "turn.summarySuccess": "Success",
    "turn.summaryFailed": "Failed",
    "turn.summaryRunning": "Running",
    "turn.failedThemes": "Failed themes: {{themes}}",
    "turn.styleResults": "Style Results",
    "turn.generatingCount": "Generating {{generated}}/{{expected}}",
    "turn.generatingImages": "Generating images...",
    "turn.noSuccessfulImages": "No successful images. Check failed themes.",
    "turn.noImagesReturned": "No images returned.",
    "turn.noStyleResults": "No style results yet.",
    "turn.modelTasks": "{{count}} model tasks",
    "status.loading": "loading",
    "status.success": "success",
    "status.error": "error",
    "status.cancelled": "cancelled",
    "status.queued": "queued",
    "status.running": "running",
    "status.done": "done",
    "status.cancelledByUser": "Cancelled by user",
    "status.generating": "Generating... {{generated}}/{{requested}}",
    "status.stop": "Stop",
    "status.noPrompt": "(no prompt)",
    "viewer.collapse": "Collapse",
    "viewer.previewReference": "Preview reference image",
    "viewer.inlineViewer": "Open inline viewer",
    "viewer.previewStyleImage": "Preview style image {{index}}",
    "viewer.compareInput": "INPUT",
    "viewer.compareOutput": "OUTPUT",
    "viewer.fullImage": "Full",
    "viewer.inputImageAlt": "Input Image",
    "select.select": "Select",
    "select.unselect": "Unselect",
    "errors.failedToFetch": "Failed to fetch",
    "history.needFolderForGpt": "Select History Folder first before saving GPT Prompt.",
    "history.noPlaceholder": "No {{ }} placeholder found. GPT did not run.",
    "history.gptRewrote": "GPT rewrote {{count}} prompt(s).",
    "history.gptRewriteFailed": "GPT rewrite failed: {{error}}",
    "history.enterThemeSeed": "Enter a theme seed first.",
    "history.themeAssistInvalid": "Theme association failed: GPT returned no valid themes.",
    "history.generatedThemes": "Generated {{count}} theme(s).",
    "history.themeAssistFailed": "Theme association failed: {{error}}",
    "history.retryTurnNotFound": "Retry failed: task not found.",
    "history.retryResultNotFound": "Retry failed: result not found.",
    "history.retryModelMissing": "Retry failed: model not found.",
    "history.appendedOne": "Added 1 image.",
    "history.replacedOne": "Retried and replaced image.",
    "history.retryFailed": "Retry failed: {{error}}",
    "history.selectImagesFirst": "Select images first.",
    "history.thumbnailFailed": "Thumbnail generation failed.",
    "history.thumbnailFailedDetail": "Thumbnail generation failed: {{error}}",
    "history.thumbnailReady": "Thumbnail created ({{count}} images, 3 rows).",
    "history.selectHistoryFolderFirst": "Select History Folder first.",
    "history.selectExportImagesFirst": "Select images to export first.",
    "history.folderWriteDeniedExport": "Folder write permission denied. Atlas export unavailable.",
    "history.atlasExported": "Atlas exported: atlas/{{folder}}",
    "history.exportFailed": "Export failed: {{error}}",
    "history.folderReadDenied": "Folder read permission denied. History cannot be loaded.",
    "history.folderLoadedWithTemplates": "Loaded folder history: {{turns}} dialogs, templates: {{templates}} + style templates: {{styleTemplates}}, API/GPT config loaded.",
    "history.folderLoadedInitialized": "Loaded folder history: {{turns}} dialogs, templates: {{templates}} + style templates: {{styleTemplates}} (initialized), API/GPT config initialized.",
    "history.browserUnsupported": "Folder read/write is unsupported in this browser. Use a recent Chrome or Edge.",
    "history.pickFolderFailed": "Folder selection failed: {{error}}",
    "history.createdTasks": "Created {{count}} tasks (split by input image).",
    "history.folderWriteDeniedDelete": "Folder write permission denied. Local record cannot be deleted.",
    "history.deletedLocal": "Deleted local history: #{{seq}}",
    "history.deleteLocalFailed": "Failed to delete local history: #{{seq}} ({{error}})",
    "history.folderWriteDeniedAutosave": "Folder write permission denied. Auto-save paused.",
    "history.wroteLocal": "Wrote local history: #{{seq}}",
    "history.writeLocalFailed": "Failed to write local history: #{{seq}} ({{error}})",
  },
  zh: {
    "settings.title": "设置",
    "settings.proxyLabel": "Cloudflare Worker 代理地址",
    "settings.showWorkerCode": "显示 Worker 代码",
    "settings.hideWorkerCode": "隐藏 Worker 代码",
    "settings.language": "语言",
    "settings.languageEnglish": "English",
    "settings.languageChinese": "中文",
    "api.title": "API Key",
    "api.deerapiLabel": "DeerAPI Key",
    "api.bailianLabel": "百炼 Key",
    "gpt.title": "GPT 提示词",
    "gpt.rewriteLabel": "GPT 改写指令",
    "gpt.themeLabel": "主题联想指令",
    "gpt.contextLabel": "生图 Prompt 上下文",
    "gpt.sendPromptTextLabel": "发送生图 prompt 文本",
    "gpt.sendPromptTextHint": "这里控制的是当前生图提示词，不是上面的 GPT 改写指令。",
    "gpt.sendPromptImageLabel": "发送 prompt 图片",
    "gpt.sendPromptImageHint": "关闭后，当前输入图片不会发送给 GPT。",
    "common.save": "保存",
    "common.saved": "已保存",
    "common.unsavedChanges": "有未保存改动",
    "common.savedAt": "保存于 {{time}}",
    "common.on": "开启",
    "common.off": "关闭",
    "common.upload": "上传",
    "common.processing": "处理中...",
    "common.unknownError": "未知错误",
    "common.edit": "编辑",
    "common.title": "标题",
    "common.body": "正文",
    "common.backup": "备用",
    "common.memo": "备忘",
    "template.title": "模板修改",
    "template.titlePlaceholder": "模板标题",
    "template.bodyPlaceholder": "主模板内容",
    "template.backupPlaceholder": "备用模板内容",
    "template.memoPlaceholder": "备忘、备用提示词或复制内容",
    "template.styleTitle": "风格模板",
    "template.styleTitlePlaceholder": "风格模板标题",
    "template.styleBodyPlaceholder": "风格模板提示词",
    "template.insertPlaceholder": "插入占位框 {{ }}",
    "template.edit": "编辑模板",
    "template.editStyle": "编辑风格模板",
    "images.defaultTitle": "图片",
    "images.inputTitle": "输入图",
    "images.referenceTitle": "参考图",
    "images.modalHint": "第一个格子用于上传。关闭弹窗后会自动保存变更。",
    "imageEditor.title": "提示词图片编辑",
    "imageEditor.hint": "在画布上拖动即可裁剪或标注。点击确认后会替换当前提示词图片。",
    "imageEditor.tools": "工具",
    "imageEditor.colors": "颜色",
    "imageEditor.toolCrop": "裁剪",
    "imageEditor.toolRect": "画框",
    "imageEditor.toolLine": "直线",
    "imageEditor.toolArrow": "箭头",
    "imageEditor.undo": "撤回",
    "imageEditor.applyCrop": "应用裁剪",
    "imageEditor.clearCrop": "清除裁剪",
    "imageEditor.confirm": "确认",
    "imageEditor.cancel": "取消",
    "imageEditor.prev": "上一张",
    "imageEditor.next": "下一张",
    "imageEditor.page": "第 {{current}} / {{total}} 张",
    "imageEditor.noImage": "暂无可编辑图片。",
    "imageEditor.cropHint": "拖动选出裁剪区域，再点击“应用裁剪”。",
    "imageEditor.drawHint": "在图片上拖动即可绘制当前标注。",
    "imageEditor.cropReady": "裁剪区域已准备好。",
    "imageEditor.multiHint": "下方缩略图可切换并逐张编辑已上传图片。",
    "selectionLimit.title": "已达到选择上限",
    "selectionLimit.text": "图集导出最多只能选择 {{limit}} 张图片。",
    "action.save": "下载",
    "action.retry": "重试",
    "action.addOne": "再来一张",
    "split.open": "自动切分",
    "split.title": "切分操作台",
    "split.original": "原图",
    "split.removed": "去背景结果",
    "split.process": "过程图",
    "split.results": "拆分主体",
    "split.detecting": "正在识别主体...",
    "split.noSubjects": "未识别到可切分主体。",
    "split.count": "共 {{count}} 个主体",
    "split.reSplit": "重新切分",
    "split.run": "执行切分",
    "split.sourceRemoved": "先去背景",
    "split.sourceOriginal": "不去背景",
    "split.qualityEnhanced": "清晰度：增强",
    "split.qualityOriginal": "清晰度：原始",
    "split.upload": "上传图片",
    "split.export": "导出",
    "split.exporting": "导出中...",
    "split.merge": "合并选中",
    "split.mergeNeedTwo": "至少选择 2 个主体才能合并。",
    "split.merged": "已合并 {{count}} 个主体。",
    "split.delete": "删除",
    "split.undo": "撤回",
    "split.undoHint": "撤回快捷键：Ctrl/Cmd + Z",
    "split.whiteBgOn": "白底：开",
    "split.whiteBgOff": "白底：关",
    "split.renderPainted": "输出：背景色填充",
    "split.renderDirect": "输出：直接裁切",
    "split.shapeEdge": "形状：边缘",
    "split.shapePolygon": "形状：多边形",
    "split.shapeRect": "形状：矩形",
    "split.enhance": "增强到 1024",
    "split.enhancing": "增强中...",
    "split.enhanced": "已增强 {{count}} 张切分图，最长边不低于 1024。",
    "split.deletedOne": "已删除 1 张切分图。",
    "split.undoDone": "已撤回。",
    "split.unsupported": "当前浏览器不支持选择文件夹。",
    "split.pickFolderFailed": "导出失败：{{error}}",
    "split.exported": "切分导出完成：{{folder}}（主体 {{count}} 个 + 原图）",
    "split.exportNoItems": "没有可导出的切分主体。",
    "split.loadFailed": "切分失败：{{error}}",
    "split.previewSplit": "预览切分图 {{index}}",
    "atlas.title": "缩略图",
    "atlas.hint": "拖拽即可调整顺序。图集导出和缩略图都会按这个顺序生成。",
    "atlas.empty": "还没有选中的图片。",
    "atlas.refresh": "刷新缩略图",
    "atlas.generate": "生成缩略图",
    "atlas.openEditor": "打开缩略图编辑器",
    "help.title": "帮助",
    "help.hero": "Polyimage 用来对比不同生图模型、快速重跑任务，并把选中的图片导出成一个图集文件夹。",
    "nav.single": "单任务",
    "nav.compare": "提示词对比",
    "nav.style": "风格",
    "nav.help": "帮助",
    "nav.gptPrompt": "GPT 提示词",
    "nav.api": "API",
    "header.subtitle": "多模型生图工作台 · DeerAPI / 百炼",
    "workspace.prompt": "提示词",
    "workspace.prompts": "提示词",
    "workspace.compareHint": "共享输入图，双提示词同时运行",
    "workspace.referenceImage": "参考图",
    "workspace.reference": "参考图",
    "workspace.input": "输入图",
    "workspace.models": "选择模型",
    "workspace.syncCount": "同步最近修改数量",
    "workspace.imageRatio": "画幅比例",
    "workspace.templates": "模板",
    "workspace.styleTemplates": "风格模板",
    "workspace.themes": "主题词（12）",
    "workspace.clearAll": "清空全部",
    "workspace.themeSeedPlaceholder": "输入一个主题种子，例如：咖啡",
    "workspace.themePlaceholder": "主题 {{index}}",
    "workspace.promptAPlaceholder": "描述提示词 A...",
    "workspace.promptBPlaceholder": "描述提示词 B...",
    "workspace.promptPlaceholder": "描述你想生成的画面...",
    "workspace.rewriteByGpt": "用 GPT 改写 {{ }}",
    "workspace.noPlaceholder": "没有找到 {{ }} 占位符",
    "workspace.enqueueTask": "⬡ 开始任务",
    "workspace.enqueueCompare": "⬡ 开始对比任务",
    "workspace.enqueueStyle": "⬡ 开始风格任务",
    "workspace.runningQueued": "运行中 {{running}} · 排队中 {{queued}}",
    "workspace.downloadAll": "↓ 下载全部记录（.zip）",
    "workspace.selectHistoryFolder": "选择历史文件夹",
    "workspace.switchHistoryFolder": "切换历史文件夹",
    "workspace.reloadHistory": "重新读取文件夹历史",
    "workspace.connected": "已连接：{{name}}",
    "workspace.noFolderSelected": "未选择文件夹",
    "workspace.folderUnsupported": "当前浏览器不支持文件夹 API",
    "workspace.selectedCount": "已选 {{count}}/{{max}}",
    "workspace.clearSelections": "清空选择",
    "workspace.exportAtlas": "导出图集文件夹",
    "workspace.thumbnail": "缩略图",
    "workspace.currentDialog": "当前任务",
    "workspace.historyDialogs": "历史记录",
    "workspace.loadMore": "再加载 4 条记录",
    "turn.compare": "对比",
    "turn.style": "风格",
    "turn.syncTemplate": "同步模板",
    "turn.reuse": "复用",
    "turn.delete": "删除",
    "turn.summaryModel": "模型",
    "turn.summaryPerTask": "单任务数量",
    "turn.summaryGenerated": "已生成",
    "turn.summarySuccess": "成功",
    "turn.summaryFailed": "失败",
    "turn.summaryRunning": "运行中",
    "turn.failedThemes": "失败主题：{{themes}}",
    "turn.styleResults": "风格结果",
    "turn.generatingCount": "生成中 {{generated}}/{{expected}}",
    "turn.generatingImages": "正在生成图片...",
    "turn.noSuccessfulImages": "没有成功图片，请检查失败主题。",
    "turn.noImagesReturned": "没有返回图片。",
    "turn.noStyleResults": "还没有风格结果。",
    "turn.modelTasks": "{{count}} 个模型任务",
    "status.loading": "生成中",
    "status.success": "成功",
    "status.error": "失败",
    "status.cancelled": "已取消",
    "status.queued": "排队中",
    "status.running": "运行中",
    "status.done": "已完成",
    "status.cancelledByUser": "已由用户取消",
    "status.generating": "生成中... {{generated}}/{{requested}}",
    "status.stop": "停止",
    "status.noPrompt": "（无提示词）",
    "viewer.collapse": "收起",
    "viewer.previewReference": "预览参考图",
    "viewer.inlineViewer": "打开内嵌查看器",
    "viewer.previewStyleImage": "预览风格图 {{index}}",
    "viewer.compareInput": "输入图",
    "viewer.compareOutput": "输出图",
    "viewer.fullImage": "大图",
    "viewer.inputImageAlt": "输入图",
    "select.select": "选中",
    "select.unselect": "取消选中",
    "errors.failedToFetch": "请求失败：无法连接到接口或代理地址。",
    "history.needFolderForGpt": "请先选择历史文件夹，再保存 GPT 提示词。",
    "history.noPlaceholder": "未找到 {{ }} 占位符，GPT 未执行。",
    "history.gptRewrote": "GPT 已改写 {{count}} 个提示词。",
    "history.gptRewriteFailed": "GPT 改写失败：{{error}}",
    "history.enterThemeSeed": "请输入主题联想关键词。",
    "history.themeAssistInvalid": "主题联想失败：GPT 未返回有效主题。",
    "history.generatedThemes": "已生成 {{count}} 个主题元素。",
    "history.themeAssistFailed": "主题联想失败：{{error}}",
    "history.retryTurnNotFound": "重试失败：找不到对应任务。",
    "history.retryResultNotFound": "重试失败：找不到对应结果。",
    "history.retryModelMissing": "重试失败：模型不存在。",
    "history.appendedOne": "已追加 1 张图片。",
    "history.replacedOne": "已重试并替换图片。",
    "history.retryFailed": "重试失败：{{error}}",
    "history.selectImagesFirst": "请先选择要拼接的图片。",
    "history.thumbnailFailed": "缩略图生成失败。",
    "history.thumbnailFailedDetail": "缩略图生成失败：{{error}}",
    "history.thumbnailReady": "缩略图已生成（{{count}} 张，3 行）。",
    "history.selectHistoryFolderFirst": "请先选择历史文件夹。",
    "history.selectExportImagesFirst": "请先选择要导出的图片。",
    "history.folderWriteDeniedExport": "文件夹写入权限未授权，无法导出图集。",
    "history.atlasExported": "图集已导出：atlas/{{folder}}",
    "history.exportFailed": "导出失败：{{error}}",
    "history.folderReadDenied": "文件夹读取权限未授权，无法加载历史。",
    "history.folderLoadedWithTemplates": "已读取文件夹历史：{{turns}} 条，模板：{{templates}} + 风格模板：{{styleTemplates}}，API/GPT 配置已加载。",
    "history.folderLoadedInitialized": "已读取文件夹历史：{{turns}} 条，模板：{{templates}} + 风格模板：{{styleTemplates}}（已初始化），API/GPT 配置已初始化。",
    "history.browserUnsupported": "当前浏览器不支持文件夹读写（请使用较新版本 Chrome/Edge）。",
    "history.pickFolderFailed": "选择文件夹失败：{{error}}",
    "history.createdTasks": "已创建 {{count}} 个任务（按输入图拆分）。",
    "history.folderWriteDeniedDelete": "文件夹写入权限未授权，无法删除本地记录。",
    "history.deletedLocal": "已删除本地历史：#{{seq}}",
    "history.deleteLocalFailed": "删除本地历史失败：#{{seq}}（{{error}}）",
    "history.folderWriteDeniedAutosave": "文件夹写入权限未授权，自动保存已暂停。",
    "history.wroteLocal": "已写入本地历史：#{{seq}}",
    "history.writeLocalFailed": "写入本地历史失败：#{{seq}}（{{error}}）",
  },
};

function interpolateTemplate(template, params = {}) {
  return String(template ?? "").replace(/\{\{(\w+)\}\}/g, (_, key) => String(params?.[key] ?? ""));
}

function translateUiText(uiLanguage, key, params) {
  const locale = uiLanguage === "zh" ? "zh" : "en";
  const template = UI_TEXT[locale]?.[key] ?? UI_TEXT.en?.[key] ?? key;
  return interpolateTemplate(template, params);
}

function normalizeUiLanguage(value) {
  return value === "zh" ? "zh" : "en";
}

function useI18n() {
  return useContext(I18nContext);
}

function formatUiTime(value, uiLanguage) {
  return new Date(value).toLocaleTimeString(uiLanguage === "zh" ? "zh-CN" : "en-US");
}

function formatUiDateTime(value, uiLanguage) {
  return new Date(value).toLocaleString(uiLanguage === "zh" ? "zh-CN" : "en-US");
}

function getDefaultTemplateTitle(templateId, uiLanguage) {
  const match = String(templateId || "").match(/(\d+)/);
  const index = Number(match?.[1] || 1);
  return uiLanguage === "zh" ? `预设 ${index}` : `Preset ${index}`;
}

function getDefaultStyleTemplateTitle(templateId, uiLanguage) {
  const match = String(templateId || "").match(/(\d+)/);
  const index = Number(match?.[1] || 1);
  return uiLanguage === "zh" ? `风格 ${index}` : `Style ${index}`;
}

function getLocalizedTemplateTitle(title, templateId, uiLanguage, isStyle = false) {
  const fallback = isStyle ? getDefaultStyleTemplateTitle(templateId, uiLanguage) : getDefaultTemplateTitle(templateId, uiLanguage);
  const altFallback = isStyle
    ? getDefaultStyleTemplateTitle(templateId, uiLanguage === "zh" ? "en" : "zh")
    : getDefaultTemplateTitle(templateId, uiLanguage === "zh" ? "en" : "zh");
  if (!title || title === altFallback || title === fallback) return fallback;
  return title;
}

function getLocalizedPromptLabel(label, key, uiLanguage) {
  if (key === "a" || label === "PROMPT A") return uiLanguage === "zh" ? "提示词 A" : "PROMPT A";
  if (key === "b" || label === "PROMPT B") return uiLanguage === "zh" ? "提示词 B" : "PROMPT B";
  if (key === "single" || label === "PROMPT") return uiLanguage === "zh" ? "提示词" : "PROMPT";
  return label;
}

function getLocalizedStatusLabel(status, t) {
  return t(`status.${status || "done"}`);
}

function localizeRuntimeMessage(message, t) {
  const text = String(message || "").trim();
  if (!text) return t("common.unknownError");
  const exactMap = new Map([
    ["No images returned", t("turn.noImagesReturned").replace(/\.$/, "")],
    ["No images returned.", t("turn.noImagesReturned")],
    ["Cancelled by user", t("status.cancelledByUser")],
    ["Unknown error", t("common.unknownError")],
    ["Failed to fetch", t("errors.failedToFetch")],
  ]);
  return exactMap.get(text) || message;
}

// ─── Cloudflare Worker Proxy Code ───
const CF_WORKER_CODE = `// Deploy this as a Cloudflare Worker
// Optional env vars:
//   - DEERAPI_KEY
//   - DASHSCOPE_API_KEY
// Platform is inferred from X-Upstream-Base when X-Api-Platform is absent.

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const imageUrl = request.headers.get("X-Image-Url") || url.searchParams.get("image_url");
      if (imageUrl) {
        if (method !== "GET") return json({ error: "Image proxy only supports GET" }, 405);
        const imgResp = await fetch(imageUrl, { method: "GET", redirect: "follow" });
        const imgType = imgResp.headers.get("Content-Type") || "application/octet-stream";
        const imgData = await imgResp.arrayBuffer();
        return new Response(imgData, {
          status: imgResp.status,
          headers: {
            "Content-Type": imgType,
            ...corsHeaders(),
          },
        });
      }

      const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
      const upstreamBase = resolveUpstreamBase(request.headers.get("X-Upstream-Base"));
      if (!upstreamBase) return json({ error: "Invalid X-Upstream-Base" }, 400);

      const isAllowedGetPath =
        /^\\/mj\\/task\\/[^/]+\\/fetch(?:\\?.*)?$/.test(targetPath) ||
        /^\\/replicate\\/v1\\/predictions\\/[^/]+(?:\\?.*)?$/.test(targetPath);
      if (method !== "POST" && !(method === "GET" && isAllowedGetPath)) {
        return json({ error: "Method not allowed" }, 405);
      }

      const body = method === "POST" ? await request.text() : undefined;
      const apiPlatform = normalizeApiPlatform(
        request.headers.get("X-Api-Platform") || inferApiPlatformFromBase(upstreamBase)
      );
      const requestApiKey = normalizeApiKey(request.headers.get("X-Api-Key") || "");
      const fallbackApiKey = getFallbackApiKey(env, apiPlatform);
      const apiKey = requestApiKey || fallbackApiKey;
      if (!apiKey) {
        const envName = apiPlatform === "bailian" ? "DASHSCOPE_API_KEY" : "DEERAPI_KEY";
        return json({ error: \`API key missing. Provide X-Api-Key or configure \${envName}.\` }, 400);
      }

      const isGemini = targetPath.includes("/v1beta/");
      const prefersBearer = apiPlatform === "bailian" || !isGemini;
      const primaryAuth = prefersBearer ? \`Bearer \${apiKey}\` : apiKey;
      const fallbackAuth = prefersBearer ? apiKey : \`Bearer \${apiKey}\`;
      const baseHeaders = {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Goog-Api-Key": apiKey,
      };

      const forward = (authorization) =>
        fetch(\`\${upstreamBase}\${targetPath}\`, {
          method,
          headers: {
            ...baseHeaders,
            "Authorization": authorization,
          },
          body,
        });

      let resp = await forward(primaryAuth);
      let data = await resp.text();
      const authError = /auth|authorization|api.?key|bearer|x-goog-api-key|invalid key|token|密钥/i.test(data);
      if ([400, 401, 403].includes(resp.status) && authError && fallbackAuth !== primaryAuth) {
        const retry = await forward(fallbackAuth);
        const retryData = await retry.text();
        if (retry.ok || !resp.ok) {
          resp = retry;
          data = retryData;
        }
      }

      return new Response(data, {
        status: resp.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};

const DEFAULT_UPSTREAM_BASE = "https://api.deerapi.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key, X-Api-Platform",
  };
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\\s*:\\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\\s*:\\s*/i, "").trim();
  next = next.replace(/^bearer\\s+/i, "").trim();
  next = next.replace(/^[\\"']+|[\\"']+$/g, "").trim();
  return next;
}

function normalizeApiPlatform(value) {
  return value === "bailian" ? "bailian" : "deerapi";
}

function inferApiPlatformFromBase(value) {
  return /dashscope\\.aliyuncs\\.com/i.test(value || "") ? "bailian" : "deerapi";
}

function getFallbackApiKey(env, apiPlatform) {
  if (apiPlatform === "bailian") {
    return normalizeApiKey(env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "");
  }
  return normalizeApiKey(env.DEERAPI_KEY || "");
}

function resolveUpstreamBase(value) {
  if (!value) return DEFAULT_UPSTREAM_BASE;
  try {
    const target = new URL(value);
    if (!/^https?:$/i.test(target.protocol)) return null;
    return \`\${target.origin}\${target.pathname}\`.replace(/\\/+$/, "");
  } catch {
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}`;

// ─── Helpers ───
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function useUndoRedoText(initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const setText = useCallback((nextValue, options = {}) => {
    const { record = true } = options;
    setValue((prev) => {
      const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      const normalized = typeof resolved === "string" ? resolved : String(resolved ?? "");
      if (record && normalized !== prev) {
        undoStackRef.current.push(prev);
        if (undoStackRef.current.length > 200) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
      return normalized;
    });
  }, []);

  const resetText = useCallback((nextValue = "") => {
    const normalized = typeof nextValue === "string" ? nextValue : String(nextValue ?? "");
    undoStackRef.current = [];
    redoStackRef.current = [];
    setValue(normalized);
  }, []);

  const undo = useCallback(() => {
    setValue((prev) => {
      if (!undoStackRef.current.length) return prev;
      const next = undoStackRef.current.pop();
      redoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setValue((prev) => {
      if (!redoStackRef.current.length) return prev;
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback((event) => {
    const withMeta = event.metaKey || event.ctrlKey;
    if (!withMeta || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  }, [redo, undo]);

  return { value, setText, resetText, undo, redo, handleKeyDown };
}

function stripBase64Prefix(dataUrl) {
  if (!dataUrl) return "";
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

function getMimeFromDataUrl(dataUrl) {
  const m = dataUrl?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return m ? m[1] : "image/png";
}

function isAbortError(err) {
  const msg = String(err?.message || "");
  return err?.name === "AbortError" || /abort|cancel/i.test(msg);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shouldRetryApiFailure(status, text = "") {
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  return /未接收到上游响应内容|upstream|timeout|temporarily unavailable|traceid/i.test(text);
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  if (next.startsWith("//")) next = `https:${next}`;
  if (!/^[a-z]+:\/\//i.test(next)) next = `https://${next}`;
  try {
    const url = new URL(next);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeApiPlatform(value) {
  return value === "bailian" ? "bailian" : DEFAULT_API_PLATFORM;
}

function getDefaultApiBaseUrl(apiPlatform = DEFAULT_API_PLATFORM) {
  return DEFAULT_API_BASE_URLS[normalizeApiPlatform(apiPlatform)] || DEFAULT_API_BASE_URL;
}

function resolveApiBaseUrl(value, apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiBaseUrl(value) || getDefaultApiBaseUrl(apiPlatform);
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\s*:\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\s*:\s*/i, "").trim();
  next = next.replace(/^bearer\s+/i, "").trim();
  next = next.replace(/^["']+|["']+$/g, "").trim();
  return next;
}

function normalizeApiKeys(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    deerapi: normalizeApiKey(source.deerapi || source.deerApiKey || source.deerapiKey || source.DEERAPI_KEY || ""),
    bailian: normalizeApiKey(source.bailian || source.bailianKey || source.dashscopeKey || source.DASHSCOPE_API_KEY || ""),
  };
}

function getApiKeyForPlatform(apiKeys, apiPlatform = DEFAULT_API_PLATFORM) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  const platform = normalizeApiPlatform(apiPlatform);
  return normalizedKeys[platform] || "";
}

function getAssistPlatformOrder(apiKeys) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  if (normalizedKeys.deerapi && normalizedKeys.bailian) return ["deerapi", "bailian"];
  if (normalizedKeys.deerapi) return ["deerapi", "bailian"];
  if (normalizedKeys.bailian) return ["bailian", "deerapi"];
  return ["deerapi", "bailian"];
}

function resolveTextAssistTargetPath(apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiPlatform(apiPlatform) === "bailian"
    ? "/compatible-mode/v1/chat/completions"
    : "/v1/chat/completions";
}

function resolveTextAssistModelId(apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiPlatform(apiPlatform) === "bailian"
    ? DEFAULT_BAILIAN_ASSIST_MODEL
    : DEFAULT_GPT_ASSIST_MODEL;
}

function isModelAvailableOnPlatform(model, apiPlatform = DEFAULT_API_PLATFORM) {
  if (!model) return false;
  const supportedPlatforms =
    Array.isArray(model.platforms) && model.platforms.length
      ? model.platforms
      : [DEFAULT_API_PLATFORM];
  return supportedPlatforms.includes(normalizeApiPlatform(apiPlatform));
}

function getModelApiPlatform(model) {
  if (!model) return DEFAULT_API_PLATFORM;
  const supportedPlatforms =
    Array.isArray(model.platforms) && model.platforms.length
      ? model.platforms
      : [DEFAULT_API_PLATFORM];
  return normalizeApiPlatform(supportedPlatforms[0]);
}

function getApiConfigForPlatform(apiPlatform, apiKeys) {
  const platform = normalizeApiPlatform(apiPlatform);
  return {
    apiPlatform: platform,
    apiBaseUrl: getDefaultApiBaseUrl(platform),
    apiKey: getApiKeyForPlatform(apiKeys, platform),
  };
}

function getApiConfigForModel(model, apiKeys) {
  return getApiConfigForPlatform(getModelApiPlatform(model), apiKeys);
}

function normalizeAspectRatio(value) {
  if (typeof value !== "string") return DEFAULT_ASPECT_RATIO;
  const normalized = value.trim();
  if (!normalized) return DEFAULT_ASPECT_RATIO;
  return ASPECT_RATIO_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_ASPECT_RATIO;
}

function normalizeModelId(id) {
  if (typeof id !== "string") return id;
  if (NANO_PRO_LEGACY_MODEL_IDS.includes(id)) return NANO_PRO_OFFICIAL_MODEL_ID;
  return id;
}

function isQwenImageModel(model) {
  return /^qwen-image-2\.0(?:-pro)?(?:-|$)/.test(String(model?.id || ""));
}

function roundBailianSize(value, step = 64) {
  const safe = Number(value) || step;
  return Math.max(step, Math.round(safe / step) * step);
}

function getBailianAspectRatioSize(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  const presetSizes = {
    "1:1": "2048*2048",
    "4:3": "2368*1728",
    "3:4": "1728*2368",
    "16:9": "2688*1536",
    "9:16": "1536*2688",
  };
  if (presetSizes[normalizedRatio]) return presetSizes[normalizedRatio];
  if (normalizedRatio === DEFAULT_ASPECT_RATIO) return null;

  const [widthRatio, heightRatio] = normalizedRatio.split(":").map((value) => Number(value) || 0);
  if (!widthRatio || !heightRatio) return null;

  const maxPixels = 2048 * 2048;
  let width = roundBailianSize(Math.sqrt((maxPixels * widthRatio) / heightRatio));
  let height = roundBailianSize((width * heightRatio) / widthRatio);

  while (width * height > maxPixels && width > 512 && height > 512) {
    if (widthRatio >= heightRatio) {
      width = Math.max(512, width - 64);
      height = roundBailianSize((width * heightRatio) / widthRatio);
    } else {
      height = Math.max(512, height - 64);
      width = roundBailianSize((height * widthRatio) / heightRatio);
    }
  }

  return `${width}*${height}`;
}

function getBailianImageInputLimit(model) {
  if (isQwenImageModel(model)) return 3;
  if (/^wan2\.7-image(?:-pro)?(?:-|$)/.test(String(model?.id || ""))) return 9;
  return MAX_INPUT_IMAGES_PER_BATCH;
}

function getBailianImageSize(model, aspectRatio = DEFAULT_ASPECT_RATIO, hasImageInputs = false) {
  const isQwenModel = isQwenImageModel(model);
  const fallbackSize = isQwenModel ? "2048*2048" : "2K";
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedRatio === DEFAULT_ASPECT_RATIO) {
    // For Qwen image editing, omitting size lets Bailian keep the last input image ratio.
    if (isQwenModel && hasImageInputs) return null;
    return fallbackSize;
  }
  if (!isQwenModel && hasImageInputs) return fallbackSize;
  return getBailianAspectRatioSize(normalizedRatio) || fallbackSize;
}

function getGeminiModelCandidates(id) {
  const normalized = normalizeModelId(id);
  if (normalized !== NANO_PRO_OFFICIAL_MODEL_ID) return [normalized];
  return [NANO_PRO_OFFICIAL_MODEL_ID, ...NANO_PRO_LEGACY_MODEL_IDS];
}

function mergePromptWithAspectRatio(prompt, aspectRatio, model) {
  const safePrompt = (prompt || "").trim();
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedRatio === "auto") return safePrompt || "Generate a creative image";
  if (model?.apiType === "midjourney") {
    if (/--ar\s+\d+:\d+/i.test(safePrompt)) return safePrompt;
    return `${safePrompt || "Generate a creative image"} --ar ${normalizedRatio}`.trim();
  }
  const suffix = `Aspect ratio: ${normalizedRatio}`;
  if (safePrompt.toLowerCase().includes(suffix.toLowerCase())) return safePrompt || "Generate a creative image";
  return `${safePrompt || "Generate a creative image"}\n${suffix}`.trim();
}

function normalizeGptAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_GPT_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_GPT_ASSIST_PROMPT;
}

function normalizeGptAssistFlag(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeStyleThemeAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_STYLE_THEME_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_STYLE_THEME_ASSIST_PROMPT;
}

function extractPlaceholderTokens(input = "") {
  const text = typeof input === "string" ? input : "";
  const matches = [];
  const regex = /\{\{([^{}]*)\}\}/g;
  let found = regex.exec(text);
  while (found) {
    matches.push(typeof found[1] === "string" ? found[1] : "");
    found = regex.exec(text);
  }
  return matches;
}

function applyPlaceholderReplacements(input = "", replacements = []) {
  const text = typeof input === "string" ? input : "";
  let cursor = 0;
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, original) => {
    const next = replacements[cursor];
    cursor += 1;
    const fallback = typeof original === "string" ? original : "";
    return `{{${typeof next === "string" ? next.trim() : fallback}}}`;
  });
}

function clearPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{[^{}]*\}\}/g, "{{}}");
}

function expandPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => String(inner ?? "").trim());
}

function getFilledPlaceholderTokens(input = "") {
  return extractPlaceholderTokens(input)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function splitPromptByPlaceholders(input = "") {
  const text = typeof input === "string" ? input : "";
  const chunks = [];
  const regex = /\{\{([^{}]*)\}\}/g;
  let last = 0;
  let match = regex.exec(text);
  while (match) {
    if (match.index > last) {
      chunks.push({ type: "text", value: text.slice(last, match.index) });
    }
    chunks.push({ type: "placeholder", value: typeof match[1] === "string" ? match[1] : "" });
    last = match.index + match[0].length;
    match = regex.exec(text);
  }
  if (last < text.length) {
    chunks.push({ type: "text", value: text.slice(last) });
  }
  return chunks;
}

function assistantMessageToText(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part?.text || "";
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJsonFromText(rawText = "") {
  const raw = String(rawText || "").trim();
  if (!raw) return null;

  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(raw);
  const objectLike = raw.match(/\{[\s\S]*\}/);
  if (objectLike?.[0]) candidates.push(objectLike[0].trim());

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function parseThemeSuggestions(rawText = "") {
  const parsed = parseJsonFromText(rawText);
  const listFromJson = Array.isArray(parsed?.themes)
    ? parsed.themes
    : Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
    ? parsed
    : [];

  const fallback = String(rawText || "")
    .split(/[\n,，、;；]/g)
    .map((item) => item.replace(/^[\-\d\.\)\s]+/, "").trim())
    .filter(Boolean);

  const merged = [...listFromJson, ...fallback]
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean);

  const deduped = [];
  merged.forEach((item) => {
    if (!item || deduped.includes(item)) return;
    deduped.push(item);
  });

  return deduped.slice(0, STYLE_THEME_SLOTS);
}

function normalizeImageInputs(imageBase64, imageInputs = []) {
  const collected = [];
  if (typeof imageBase64 === "string" && imageBase64.trim()) collected.push(imageBase64.trim());
  if (Array.isArray(imageInputs)) {
    imageInputs.forEach((item) => {
      if (typeof item === "string" && item.trim()) collected.push(item.trim());
    });
  }
  return Array.from(new Set(collected));
}

function injectThemeIntoPrompt(basePrompt = "", theme = "") {
  const promptText = typeof basePrompt === "string" ? basePrompt : "";
  const themeText = typeof theme === "string" ? theme.trim() : "";
  if (!themeText) return promptText;
  if (!promptText.trim()) return promptText;
  if (/\{\{[^{}]*\}\}/.test(promptText)) {
    return promptText.replace(/\{\{[^{}]*\}\}/, themeText);
  }
  return `${promptText}\nTheme: ${themeText}`;
}

function buildStylePromptVariants(basePrompt = "", themes = []) {
  const cleanedBase = typeof basePrompt === "string" ? basePrompt : "";
  const cleanedThemes = (Array.isArray(themes) ? themes : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, STYLE_THEME_SLOTS);
  if (!cleanedBase.trim() || !cleanedThemes.length) {
    return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: cleanedBase }, 0)];
  }
  return cleanedThemes.map((theme, index) =>
    normalizePromptVariant({
      key: `theme-${index + 1}`,
      label: theme,
      prompt: injectThemeIntoPrompt(cleanedBase, theme),
    }, index + 1)
  );
}

function formatAtlasFolderName(items = []) {
  const themes = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => (typeof item?.theme === "string" ? item.theme.trim() : ""))
        .filter(Boolean)
    )
  );
  const themePart = themes.slice(0, 3).map((item) => safeName(item)).filter(Boolean).join("_");
  return themePart ? `atlas-${Date.now()}-${themePart}` : `atlas-${Date.now()}`;
}

function buildAtlasImageFileStem(item, index = 0) {
  const theme = safeName(item?.theme || `theme_${index + 1}`);
  const model = safeName(item?.modelName || item?.modelId || "model");
  return `${String(index + 1).padStart(2, "0")}_${theme}_${model}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function normalizeEditorRect(start, end, boundsWidth, boundsHeight) {
  const maxWidth = Math.max(1, Number(boundsWidth) || 1);
  const maxHeight = Math.max(1, Number(boundsHeight) || 1);
  const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  const x1 = clamp(Math.min(start?.x ?? 0, end?.x ?? 0), maxWidth);
  const y1 = clamp(Math.min(start?.y ?? 0, end?.y ?? 0), maxHeight);
  const x2 = clamp(Math.max(start?.x ?? 0, end?.x ?? 0), maxWidth);
  const y2 = clamp(Math.max(start?.y ?? 0, end?.y ?? 0), maxHeight);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

function isEditorRectValid(rect, minSize = 8) {
  return !!rect && rect.width >= minSize && rect.height >= minSize;
}

function getInputImageEditorStrokeWidth(width, height) {
  const longSide = Math.max(1, Number(width) || 1, Number(height) || 1);
  return Math.max(3, Math.round(longSide / 320));
}

function drawInputImageEditorShape(ctx, operation) {
  if (!ctx || !operation || !operation.type) return;
  ctx.save();
  ctx.strokeStyle = operation.color || "#f8fafc";
  ctx.lineWidth = Math.max(2, Number(operation.strokeWidth) || 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (operation.type === "rect" && operation.rect) {
    ctx.strokeRect(operation.rect.x, operation.rect.y, operation.rect.width, operation.rect.height);
  } else if ((operation.type === "line" || operation.type === "arrow") && operation.start && operation.end) {
    ctx.beginPath();
    ctx.moveTo(operation.start.x, operation.start.y);
    ctx.lineTo(operation.end.x, operation.end.y);
    ctx.stroke();

    if (operation.type === "arrow") {
      const angle = Math.atan2(operation.end.y - operation.start.y, operation.end.x - operation.start.x);
      const headLength = Math.max(12, ctx.lineWidth * 4);
      ctx.beginPath();
      ctx.moveTo(operation.end.x, operation.end.y);
      ctx.lineTo(
        operation.end.x - headLength * Math.cos(angle - Math.PI / 6),
        operation.end.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(operation.end.x, operation.end.y);
      ctx.lineTo(
        operation.end.x - headLength * Math.cos(angle + Math.PI / 6),
        operation.end.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

async function applyInputImageEditorOperation(sourceDataUrl, operation) {
  const normalizedSource = normalizeImageValue(sourceDataUrl) || sourceDataUrl;
  if (!normalizedSource) return sourceDataUrl;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  drawInputImageEditorShape(ctx, operation);
  return canvas.toDataURL("image/png");
}

async function cropInputImageDataUrl(sourceDataUrl, cropRect) {
  const normalizedSource = normalizeImageValue(sourceDataUrl) || sourceDataUrl;
  if (!normalizedSource || !isEditorRectValid(cropRect, 2)) return sourceDataUrl;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const safeRect = normalizeEditorRect(
    { x: cropRect.x, y: cropRect.y },
    { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
    width,
    height
  );
  if (!isEditorRectValid(safeRect, 2)) return sourceDataUrl;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.max(1, Math.round(safeRect.width));
  outCanvas.height = Math.max(1, Math.round(safeRect.height));
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.drawImage(
    image,
    safeRect.x,
    safeRect.y,
    safeRect.width,
    safeRect.height,
    0,
    0,
    outCanvas.width,
    outCanvas.height
  );
  return outCanvas.toDataURL("image/png");
}

async function createAtlasThumbnailDataUrl(imageSources = [], options = {}) {
  const sources = (Array.isArray(imageSources) ? imageSources : [])
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, MAX_ATLAS_SELECTED_IMAGES);
  if (!sources.length) return null;

  const rows = Math.max(1, Number(options.rows) || 3);
  const cols = Math.max(1, Math.ceil(sources.length / rows));
  const cellWidth = Math.max(120, Number(options.cellWidth) || 256);
  const cellHeight = Math.max(120, Number(options.cellHeight) || 256);

  const canvas = document.createElement("canvas");
  canvas.width = cols * cellWidth;
  canvas.height = rows * cellHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  for (let index = 0; index < sources.length; index += 1) {
    const src = sources[index];
    try {
      const image = await loadImageElement(src);
      const row = index % rows;
      const col = Math.floor(index / rows);
      const x = col * cellWidth;
      const y = row * cellHeight;
      const scale = Math.max(cellWidth / image.width, cellHeight / image.height);
      const drawWidth = Math.max(1, Math.floor(image.width * scale));
      const drawHeight = Math.max(1, Math.floor(image.height * scale));
      const dx = x + Math.floor((cellWidth - drawWidth) / 2);
      const dy = y + Math.floor((cellHeight - drawHeight) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellWidth, cellHeight);
      ctx.clip();
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
      ctx.restore();
    } catch {}
  }

  return canvas.toDataURL("image/png");
}

function buildProxyHeaders(targetPath, apiBaseUrl, apiKey, extraHeaders = {}, apiPlatform = DEFAULT_API_PLATFORM) {
  const headers = { ...extraHeaders };
  if (targetPath) headers["X-Target-Path"] = targetPath;
  headers["X-Upstream-Base"] = resolveApiBaseUrl(apiBaseUrl, apiPlatform);
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (normalizedApiKey) headers["X-Api-Key"] = normalizedApiKey;
  return headers;
}

async function postJsonWithRetry(proxyUrl, targetPath, body, options = {}) {
  const {
      signal,
      maxAttempts = 3,
      baseDelayMs = 900,
      apiPlatform = DEFAULT_API_PLATFORM,
  } = options;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let resp;
    try {
      resp = await fetch(proxyUrl, {
        method: "POST",
        headers: buildProxyHeaders(targetPath, options.apiBaseUrl, options.apiKey, { "Content-Type": "application/json" }, apiPlatform),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= maxAttempts) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelayMs * attempt + jitter, signal);
      continue;
    }

    if (resp.ok) return resp.json();

    const text = (await resp.text()).slice(0, 600);
    lastError = new Error(`API ${resp.status}: ${text}`);
    const canRetry = shouldRetryApiFailure(resp.status, text);
    if (!canRetry || attempt >= maxAttempts) break;
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelayMs * attempt + jitter, signal);
  }

  throw lastError || new Error("Request failed");
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadImageUrl(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback to direct opening if fetch download fails.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function normalizeImageValue(value, apiBaseUrl) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) {
    const fallbackBaseUrl = apiBaseUrl || (typeof window !== "undefined" ? window.__apiBaseUrl : "");
    const fallbackPlatform = typeof window !== "undefined" ? window.__apiPlatform : DEFAULT_API_PLATFORM;
    return `${resolveApiBaseUrl(fallbackBaseUrl, fallbackPlatform)}${v}`;
  }
  const mdUrl = v.match(/\((https?:\/\/[^)]+)\)/)?.[1] || v.match(/https?:\/\/\S+/)?.[0];
  if (mdUrl) return mdUrl.replace(/[),.;]+$/, "");
  if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 128) {
    return `data:image/png;base64,${v}`;
  }
  return null;
}

function extractImageCandidates(input, out = [], apiBaseUrl) {
  if (input == null) return out;
  if (typeof input === "string") {
    const direct = normalizeImageValue(input, apiBaseUrl);
    if (direct) out.push(direct);
    const urlMatches = input.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    urlMatches.forEach((u) => {
      const normalized = normalizeImageValue(u, apiBaseUrl);
      if (normalized) out.push(normalized);
    });
    return out;
  }
  if (Array.isArray(input)) {
    input.forEach((item) => extractImageCandidates(item, out, apiBaseUrl));
    return out;
  }
  if (typeof input === "object") {
    Object.entries(input).forEach(([k, v]) => {
      if (/url|image|img|uri|link/i.test(k)) extractImageCandidates(v, out, apiBaseUrl);
      else if (typeof v === "object" || typeof v === "string") extractImageCandidates(v, out, apiBaseUrl);
    });
    return out;
  }
  return out;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function proxyFetchImageAsDataUrl(proxyUrl, rawUrl) {
  const normalized = normalizeImageValue(rawUrl);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return normalized;

  try {
    if (!proxyUrl?.trim()) return normalized;
    // Route all image URLs via Worker to bypass browser CORS/hotlink limits.
    const resp = await fetch(proxyUrl, {
      method: "GET",
      headers: { "X-Image-Url": normalized },
    });
    const type = resp.headers.get("content-type") || "";
    if (!resp.ok || !type.startsWith("image/")) return normalized;
    const blob = await resp.blob();
    return await blobToDataUrl(blob);
  } catch {
    return normalized;
  }
}

function buildWorkerImageProxyUrl(proxyUrl, rawUrl) {
  const normalized = normalizeImageValue(rawUrl);
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;
  if (!/^https?:\/\//i.test(normalized)) return normalized;
  if (!proxyUrl?.trim()) return normalized;
  try {
    const base = proxyUrl.replace(/\/+$/, "");
    return `${base}/?image_url=${encodeURIComponent(normalized)}`;
  } catch {
    return normalized;
  }
}

function getMedianNumber(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function colorDistanceSq(r, g, b, bg) {
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return dr * dr + dg * dg + db * db;
}

function rgbToHexColor(r = 255, g = 255, b = 255) {
  const toHex = (value) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return n.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getPercentileNumber(values = [], ratio = 0.5) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return 0;
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor((list.length - 1) * safeRatio)));
  return list[idx];
}

function collectBorderPalette(imageData, width, height) {
  const data = imageData?.data;
  if (!data || width <= 0 || height <= 0) return [{ r: 0, g: 0, b: 0 }];
  const bucketMap = new Map();
  const stepX = Math.max(1, Math.floor(width / 90));
  const stepY = Math.max(1, Math.floor(height / 90));
  const collect = (x, y) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha <= 18) return;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
    const found = bucketMap.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    found.r += r;
    found.g += g;
    found.b += b;
    found.count += 1;
    bucketMap.set(key, found);
  };
  for (let x = 0; x < width; x += stepX) {
    collect(x, 0);
    collect(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    collect(0, y);
    collect(width - 1, y);
  }
  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({
      r: Math.round(item.r / Math.max(1, item.count)),
      g: Math.round(item.g / Math.max(1, item.count)),
      b: Math.round(item.b / Math.max(1, item.count)),
    }));
  return buckets.length ? buckets : [{ r: 0, g: 0, b: 0 }];
}

function getMinPaletteDistanceSq(r, g, b, palette = []) {
  const colors = Array.isArray(palette) && palette.length ? palette : [{ r: 0, g: 0, b: 0 }];
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < colors.length; i += 1) {
    const dist = colorDistanceSq(r, g, b, colors[i]);
    if (dist < min) min = dist;
  }
  return Number.isFinite(min) ? min : 0;
}

function refineForegroundMask(mask, width, height) {
  if (!mask || width <= 2 || height <= 2) return mask;
  const total = width * height;
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const erode = (input) => {
    const out = new Uint8Array(total);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        if (!input[idx]) continue;
        let ok = true;
        for (let n = 0; n < neighbors.length; n += 1) {
          const nx = x + neighbors[n][0];
          const ny = y + neighbors[n][1];
          if (!input[ny * width + nx]) {
            ok = false;
            break;
          }
        }
        if (ok) out[idx] = 1;
      }
    }
    return out;
  };
  const dilate = (input) => {
    const out = new Uint8Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (input[idx]) {
          out[idx] = 1;
          continue;
        }
        let on = false;
        for (let n = 0; n < neighbors.length; n += 1) {
          const nx = x + neighbors[n][0];
          const ny = y + neighbors[n][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (input[ny * width + nx]) {
            on = true;
            break;
          }
        }
        if (on) out[idx] = 1;
      }
    }
    return out;
  };

  const opened = dilate(erode(mask));
  const closed = erode(dilate(opened));

  const queue = new Int32Array(Math.max(1, total));
  const visited = new Uint8Array(total);
  const cleaned = new Uint8Array(total);
  const minIslandArea = Math.max(16, Math.floor(total * 0.00022));

  for (let start = 0; start < total; start += 1) {
    if (!closed[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    const pixels = [];
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    while (head < tail) {
      const idx = queue[head];
      head += 1;
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (let n = 0; n < neighbors.length; n += 1) {
        const nx = x + neighbors[n][0];
        const ny = y + neighbors[n][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!closed[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (pixels.length >= minIslandArea) {
      for (let i = 0; i < pixels.length; i += 1) cleaned[pixels[i]] = 1;
    }
  }

  const invVisited = new Uint8Array(total);
  const holesQueue = new Int32Array(Math.max(1, total));
  let holesHead = 0;
  let holesTail = 0;
  const pushHole = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (cleaned[idx] || invVisited[idx]) return;
    invVisited[idx] = 1;
    holesQueue[holesTail] = idx;
    holesTail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    pushHole(x, 0);
    pushHole(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushHole(0, y);
    pushHole(width - 1, y);
  }
  while (holesHead < holesTail) {
    const idx = holesQueue[holesHead];
    holesHead += 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (let n = 0; n < neighbors.length; n += 1) {
      pushHole(x + neighbors[n][0], y + neighbors[n][1]);
    }
  }
  for (let i = 0; i < total; i += 1) {
    if (!cleaned[i] && !invVisited[i]) cleaned[i] = 1;
  }
  return cleaned;
}

function mergeNearbyBounds(bounds = [], maxGap = 2) {
  const items = (Array.isArray(bounds) ? bounds : []).map((item) => ({ ...item }));
  if (items.length < 2) return items;
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const ax2 = a.x + a.width - 1;
        const ay2 = a.y + a.height - 1;
        const bx2 = b.x + b.width - 1;
        const by2 = b.y + b.height - 1;
        const horizontalGap = b.x > ax2 ? b.x - ax2 - 1 : a.x > bx2 ? a.x - bx2 - 1 : 0;
        const verticalGap = b.y > ay2 ? b.y - ay2 - 1 : a.y > by2 ? a.y - by2 - 1 : 0;
        const overlapX = !(ax2 < b.x || bx2 < a.x);
        const overlapY = !(ay2 < b.y || by2 < a.y);
        if ((horizontalGap <= maxGap && overlapY) || (verticalGap <= maxGap && overlapX) || (overlapX && overlapY)) {
          const nextX = Math.min(a.x, b.x);
          const nextY = Math.min(a.y, b.y);
          const nextRight = Math.max(ax2, bx2);
          const nextBottom = Math.max(ay2, by2);
          items[i] = {
            x: nextX,
            y: nextY,
            width: nextRight - nextX + 1,
            height: nextBottom - nextY + 1,
            area: (a.area || 0) + (b.area || 0),
          };
          items.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return items;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function blurImageData3x3(imageData, width, height) {
  const src = imageData?.data;
  if (!src || width <= 2 || height <= 2) return imageData;
  const out = new Uint8ClampedArray(src.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let aa = 0;
      let weightSum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const nx = Math.max(0, Math.min(width - 1, x + kx));
          const ny = Math.max(0, Math.min(height - 1, y + ky));
          const nIdx = (ny * width + nx) * 4;
          const w = kernel[ki];
          ki += 1;
          rr += src[nIdx] * w;
          gg += src[nIdx + 1] * w;
          bb += src[nIdx + 2] * w;
          aa += src[nIdx + 3] * w;
          weightSum += w;
        }
      }
      const safeW = weightSum || kernelSum;
      out[base] = clampByte(rr / safeW);
      out[base + 1] = clampByte(gg / safeW);
      out[base + 2] = clampByte(bb / safeW);
      out[base + 3] = clampByte(aa / safeW);
    }
  }
  return new ImageData(out, width, height);
}

function applySharpenToImageData(imageData, width, height, amount = 0.58, threshold = 3) {
  const src = imageData?.data;
  if (!src || width <= 2 || height <= 2) return imageData;
  const blurred = blurImageData3x3(imageData, width, height);
  const blur = blurred?.data;
  if (!blur) return imageData;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = src[idx + 3];
      if (alpha <= 10) {
        out[idx] = src[idx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[idx + 2];
        out[idx + 3] = alpha;
        continue;
      }
      const baseR = src[idx];
      const baseG = src[idx + 1];
      const baseB = src[idx + 2];
      const diffR = baseR - blur[idx];
      const diffG = baseG - blur[idx + 1];
      const diffB = baseB - blur[idx + 2];
      out[idx] = Math.abs(diffR) < threshold ? baseR : clampByte(baseR + diffR * amount);
      out[idx + 1] = Math.abs(diffG) < threshold ? baseG : clampByte(baseG + diffG * amount);
      out[idx + 2] = Math.abs(diffB) < threshold ? baseB : clampByte(baseB + diffB * amount);
      out[idx + 3] = alpha;
    }
  }
  return new ImageData(out, width, height);
}

async function renderDataUrlOnBackground(sourceDataUrl, fillColor = "#ffffff") {
  const image = await loadImageElement(sourceDataUrl);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

async function enhanceSplitImageDataUrl(sourceDataUrl, options = {}) {
  const minLongSide = Math.max(256, Number(options.minLongSide) || 1024);
  const image = await loadImageElement(sourceDataUrl);
  const srcWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const srcHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const longSide = Math.max(srcWidth, srcHeight);
  const scale = longSide >= minLongSide ? 1 : minLongSide / longSide;
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      dataUrl: sourceDataUrl,
      width: srcWidth,
      height: srcHeight,
    };
  }
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Progressive upscale gives cleaner edges than one-shot scaling.
  if (scale > 1.8) {
    let tempWidth = srcWidth;
    let tempHeight = srcHeight;
    let tempCanvas = document.createElement("canvas");
    tempCanvas.width = tempWidth;
    tempCanvas.height = tempHeight;
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (tempCtx) {
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = "high";
      tempCtx.drawImage(image, 0, 0, tempWidth, tempHeight);
      while (tempWidth * 1.45 < targetWidth || tempHeight * 1.45 < targetHeight) {
        const nextWidth = Math.min(targetWidth, Math.round(tempWidth * 1.45));
        const nextHeight = Math.min(targetHeight, Math.round(tempHeight * 1.45));
        const stepCanvas = document.createElement("canvas");
        stepCanvas.width = nextWidth;
        stepCanvas.height = nextHeight;
        const stepCtx = stepCanvas.getContext("2d");
        if (!stepCtx) break;
        stepCtx.imageSmoothingEnabled = true;
        stepCtx.imageSmoothingQuality = "high";
        stepCtx.drawImage(tempCanvas, 0, 0, nextWidth, nextHeight);
        tempCanvas = stepCanvas;
        tempWidth = nextWidth;
        tempHeight = nextHeight;
      }
      ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    } else {
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    }
  } else {
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  }
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const denoised = blurImageData3x3(imageData, targetWidth, targetHeight);
  const sharpened = applySharpenToImageData(denoised, targetWidth, targetHeight, 0.55, 2.5);
  ctx.putImageData(sharpened, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: targetWidth,
    height: targetHeight,
  };
}

function buildForegroundMask(imageData, width, height) {
  const total = width * height;
  const data = imageData?.data;
  const mask = new Uint8Array(total);
  if (!data || total <= 0) return mask;

  let opaqueCount = 0;
  let visibleCount = 0;
  for (let i = 0; i < total; i += 1) {
    const alpha = data[i * 4 + 3];
    if (alpha > 245) opaqueCount += 1;
    if (alpha > 20) visibleCount += 1;
  }
  const transparencyRatio = 1 - opaqueCount / Math.max(1, total);
  const hasUsefulAlpha = transparencyRatio > 0.015 && visibleCount > 0;

  if (hasUsefulAlpha) {
    for (let i = 0; i < total; i += 1) {
      if (data[i * 4 + 3] > 20) mask[i] = 1;
    }
    return refineForegroundMask(mask, width, height);
  }

  const bgPalette = collectBorderPalette(imageData, width, height);
  const borderDistances = [];
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  const collectBorderDistance = (x, y) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha <= 20) return;
    const distSq = getMinPaletteDistanceSq(data[idx], data[idx + 1], data[idx + 2], bgPalette);
    borderDistances.push(Math.sqrt(distSq));
  };
  for (let x = 0; x < width; x += stepX) {
    collectBorderDistance(x, 0);
    collectBorderDistance(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    collectBorderDistance(0, y);
    collectBorderDistance(width - 1, y);
  }
  const borderP70 = getPercentileNumber(borderDistances, 0.7);
  const borderP85 = getPercentileNumber(borderDistances, 0.85);
  const borderMedian = getMedianNumber(borderDistances);
  const bgThreshold = Math.max(14, Math.min(86, Math.max(borderP70 + 8, borderP85 + 2, borderMedian + 12)));
  const bgThresholdSq = bgThreshold * bgThreshold;
  const bgLike = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const idx = i * 4;
    const alpha = data[idx + 3];
    if (alpha <= 20) {
      bgLike[i] = 1;
      continue;
    }
    const distSq = getMinPaletteDistanceSq(data[idx], data[idx + 1], data[idx + 2], bgPalette);
    bgLike[i] = distSq <= bgThresholdSq ? 1 : 0;
  }

  const bgConnected = new Uint8Array(total);
  const queue = new Int32Array(Math.max(1, total));
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (!bgLike[idx] || bgConnected[idx]) return;
    bgConnected[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  for (let i = 0; i < total; i += 1) {
    const alpha = data[i * 4 + 3];
    if (!bgConnected[i] && alpha > 20) mask[i] = 1;
  }
  return refineForegroundMask(mask, width, height);
}

function collectSubjectBounds(mask, width, height) {
  const total = width * height;
  if (!mask || total <= 0) return [];
  const visited = new Uint8Array(total);
  const queue = new Int32Array(Math.max(1, total));
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const minArea = Math.max(20, Math.floor(total * 0.00035));
  const minSide = Math.max(2, Math.floor(Math.min(width, height) * 0.01));
  const bounds = [];

  for (let start = 0; start < total; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    const pixels = [];

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixels.push(idx);
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let n = 0; n < neighbors.length; n += 1) {
        const nextX = x + neighbors[n][0];
        const nextY = y + neighbors[n][1];
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (area < minArea || (boxWidth < minSide && boxHeight < minSide)) continue;
    bounds.push({
      x: minX,
      y: minY,
      width: boxWidth,
      height: boxHeight,
      area,
      pixels,
    });
  }

  if (!bounds.length) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    for (let i = 0; i < total; i += 1) {
      if (!mask[i]) continue;
      area += 1;
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (area > 0 && maxX >= minX && maxY >= minY) {
      bounds.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area,
        pixels: [],
      });
    }
  }

  return bounds
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .slice(0, MAX_SPLIT_EXPORT_ITEMS);
}

function normalizeSplitShapeMode(mode) {
  return SPLIT_SHAPE_MODE_ORDER.includes(mode) ? mode : DEFAULT_SPLIT_SHAPE_MODE;
}

function normalizeSplitRenderMode(mode) {
  return SPLIT_RENDER_MODE_ORDER.includes(mode) ? mode : DEFAULT_SPLIT_RENDER_MODE;
}

function buildSteppedPolygonMask(localMask, width, height) {
  if (!localMask || width <= 0 || height <= 0) return new Uint8Array(Math.max(0, width * height));
  const output = new Uint8Array(width * height);
  const bandHeight = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) / 80) || 1));
  for (let bandTop = 0; bandTop < height; bandTop += bandHeight) {
    const bandBottom = Math.min(height - 1, bandTop + bandHeight - 1);
    let inRun = false;
    let runStart = 0;
    for (let x = 0; x <= width; x += 1) {
      let active = false;
      if (x < width) {
        for (let y = bandTop; y <= bandBottom; y += 1) {
          if (localMask[y * width + x]) {
            active = true;
            break;
          }
        }
      }
      if (active && !inRun) {
        inRun = true;
        runStart = x;
      } else if (!active && inRun) {
        for (let y = bandTop; y <= bandBottom; y += 1) {
          const rowOffset = y * width;
          for (let fillX = runStart; fillX < x; fillX += 1) {
            output[rowOffset + fillX] = 1;
          }
        }
        inRun = false;
      }
    }
  }
  return output;
}

function buildPolygonMaskedImage(rectImageData, localMask, width, height, fallbackImage = "") {
  if (!rectImageData || !localMask || width <= 0 || height <= 0) return fallbackImage;
  const polygonMask = buildSteppedPolygonMask(localMask, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallbackImage;
  const out = ctx.createImageData(width, height);
  const src = rectImageData.data;
  const dst = out.data;
  let visibleCount = 0;
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    if (!polygonMask[i]) {
      dst[offset] = 0;
      dst[offset + 1] = 0;
      dst[offset + 2] = 0;
      dst[offset + 3] = 0;
      continue;
    }
    dst[offset] = src[offset];
    dst[offset + 1] = src[offset + 1];
    dst[offset + 2] = src[offset + 2];
    dst[offset + 3] = src[offset + 3];
    visibleCount += 1;
  }
  if (!visibleCount) return fallbackImage;
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

function getSplitShapeDataUrl(item, shapeMode) {
  const mode = normalizeSplitShapeMode(shapeMode);
  const rectImage = item?.rectImage || item?.image || "";
  const edgeImage = item?.edgeImage || item?.transparentImage || rectImage;
  const polygonImage = item?.polygonImage || edgeImage;
  if (mode === "rect") return rectImage || edgeImage || polygonImage;
  if (mode === "polygon") return polygonImage || edgeImage || rectImage;
  return edgeImage || polygonImage || rectImage;
}

function buildSplitProcessPreview(imageData, mask, width, height) {
  const src = imageData?.data;
  if (!src || !mask || width <= 0 || height <= 0) return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const out = new ImageData(new Uint8ClampedArray(src), width, height);
  const data = out.data;
  const mark = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    data[idx] = 255;
    data[idx + 1] = 45;
    data[idx + 2] = 45;
    data[idx + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      const left = x <= 0 ? 0 : mask[idx - 1];
      const right = x >= width - 1 ? 0 : mask[idx + 1];
      const up = y <= 0 ? 0 : mask[idx - width];
      const down = y >= height - 1 ? 0 : mask[idx + width];
      if (left && right && up && down) continue;
      mark(x, y);
      mark(x - 1, y);
      mark(x + 1, y);
      mark(x, y - 1);
      mark(x, y + 1);
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

async function buildSplitProcessPreviewForShape(sourceImage, baseProcessImage, items = [], shapeMode = DEFAULT_SPLIT_SHAPE_MODE) {
  const mode = normalizeSplitShapeMode(shapeMode);
  const fallbackImage = normalizeImageValue(baseProcessImage) || normalizeImageValue(sourceImage) || "";
  if (mode !== "rect") return fallbackImage;
  const normalizedSource = normalizeImageValue(sourceImage) || fallbackImage;
  if (!normalizedSource) return fallbackImage;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallbackImage;
  ctx.drawImage(image, 0, 0, width, height);
  const strokeWidth = Math.max(2, Math.min(6, Math.round(Math.min(width, height) / 220) || 2));
  ctx.strokeStyle = "rgba(255,45,45,0.96)";
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    const x = Math.max(0, Math.round(Number(item?.x) || 0));
    const y = Math.max(0, Math.round(Number(item?.y) || 0));
    const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
    const drawWidth = Math.max(1, Math.min(width - x, Math.round(baseWidth)));
    const drawHeight = Math.max(1, Math.min(height - y, Math.round(baseHeight)));
    const inset = strokeWidth / 2;
    const rectWidth = Math.max(1, drawWidth - strokeWidth);
    const rectHeight = Math.max(1, drawHeight - strokeWidth);
    if (drawWidth <= 0 || drawHeight <= 0) return;
    ctx.strokeRect(x + inset, y + inset, rectWidth, rectHeight);
  });
  return canvas.toDataURL("image/png");
}

function getSplitItemBaseSize(item) {
  const baseWidth = Math.max(1, Number(item?.baseWidth) || Number(item?.width) || 1);
  const baseHeight = Math.max(1, Number(item?.baseHeight) || Number(item?.height) || 1);
  return { baseWidth, baseHeight };
}

function getSplitItemSourceByShape(item, shape = "rect") {
  if (shape === "polygon") return item?.polygonImage || item?.edgeImage || item?.transparentImage || item?.rectImage || item?.image || "";
  if (shape === "edge") return item?.edgeImage || item?.transparentImage || item?.rectImage || item?.image || "";
  return item?.rectImage || item?.image || item?.edgeImage || item?.transparentImage || "";
}

async function composeMergedSplitField(items, shapeMode, bounds) {
  const width = Math.max(1, Number(bounds?.width) || 1);
  const height = Math.max(1, Number(bounds?.height) || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const dataUrl = getSplitItemSourceByShape(item, shapeMode);
    if (!dataUrl) continue;
    try {
      const image = await loadImageElement(dataUrl);
      const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
      const drawX = Math.round((Number(item?.x) || 0) - (Number(bounds?.x) || 0));
      const drawY = Math.round((Number(item?.y) || 0) - (Number(bounds?.y) || 0));
      ctx.drawImage(image, drawX, drawY, baseWidth, baseHeight);
    } catch {
      // Ignore one failed tile and keep merging others.
    }
  }
  return canvas.toDataURL("image/png");
}

async function splitImageBySubjects(source) {
  const normalized = normalizeImageValue(source);
  if (!normalized) throw new Error("Invalid image source");
  const image = await loadImageElement(normalized);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = buildForegroundMask(imageData, width, height);
  const processImage = buildSplitProcessPreview(imageData, mask, width, height);
  const boxes = collectSubjectBounds(mask, width, height);
  const bgPalette = collectBorderPalette(imageData, width, height);
  const dominantBg = bgPalette[0] || { r: 255, g: 255, b: 255 };
  const backgroundColor = rgbToHexColor(dominantBg.r, dominantBg.g, dominantBg.b);

  const removedCanvas = document.createElement("canvas");
  removedCanvas.width = width;
  removedCanvas.height = height;
  const removedCtx = removedCanvas.getContext("2d");
  if (removedCtx) {
    const removedData = removedCtx.createImageData(width, height);
    const srcData = imageData.data;
    const dstData = removedData.data;
    for (let i = 0; i < width * height; i += 1) {
      const dst = i * 4;
      if (!mask[i]) {
        dstData[dst] = 0;
        dstData[dst + 1] = 0;
        dstData[dst + 2] = 0;
        dstData[dst + 3] = 0;
        continue;
      }
      dstData[dst] = srcData[dst];
      dstData[dst + 1] = srcData[dst + 1];
      dstData[dst + 2] = srcData[dst + 2];
      dstData[dst + 3] = srcData[dst + 3];
    }
    removedCtx.putImageData(removedData, 0, 0);
  }

  const padding = Math.max(1, Math.min(16, Math.floor(Math.min(width, height) * 0.012)));
  const items = boxes.map((box, index) => {
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const right = Math.min(width - 1, box.x + box.width - 1 + padding);
    const bottom = Math.min(height - 1, box.y + box.height - 1 + padding);
    const cropWidth = Math.max(1, right - x + 1);
    const cropHeight = Math.max(1, bottom - y + 1);
    const out = document.createElement("canvas");
    out.width = cropWidth;
    out.height = cropHeight;
    const outCtx = out.getContext("2d");
    const rectOut = document.createElement("canvas");
    rectOut.width = cropWidth;
    rectOut.height = cropHeight;
    const rectCtx = rectOut.getContext("2d");
    if (outCtx && rectCtx) {
      const outImageData = outCtx.createImageData(cropWidth, cropHeight);
      const rectImageData = rectCtx.createImageData(cropWidth, cropHeight);
      const srcData = imageData.data;
      const outData = outImageData.data;
      const rectData = rectImageData.data;
      const localMask = new Uint8Array(cropWidth * cropHeight);
      const componentPixels = Array.isArray(box.pixels) ? box.pixels : [];
      if (componentPixels.length) {
        for (let p = 0; p < componentPixels.length; p += 1) {
          const sourceIndex = componentPixels[p];
          const gx = sourceIndex % width;
          const gy = Math.floor(sourceIndex / width);
          if (gx < x || gx > right || gy < y || gy > bottom) continue;
          localMask[(gy - y) * cropWidth + (gx - x)] = 1;
        }
      }
      for (let py = 0; py < cropHeight; py += 1) {
        for (let px = 0; px < cropWidth; px += 1) {
          const gx = x + px;
          const gy = y + py;
          const srcMaskIndex = gy * width + gx;
          const localMaskIndex = py * cropWidth + px;
          const outIndex = (py * cropWidth + px) * 4;
          const srcIndex = srcMaskIndex * 4;
          rectData[outIndex] = srcData[srcIndex];
          rectData[outIndex + 1] = srcData[srcIndex + 1];
          rectData[outIndex + 2] = srcData[srcIndex + 2];
          rectData[outIndex + 3] = srcData[srcIndex + 3];
          if (!componentPixels.length) {
            localMask[localMaskIndex] = mask[srcMaskIndex] ? 1 : 0;
          }
          const isForeground = localMask[localMaskIndex] === 1;
          if (!isForeground) {
            outData[outIndex] = 0;
            outData[outIndex + 1] = 0;
            outData[outIndex + 2] = 0;
            outData[outIndex + 3] = 0;
            continue;
          }
          outData[outIndex] = srcData[srcIndex];
          outData[outIndex + 1] = srcData[srcIndex + 1];
          outData[outIndex + 2] = srcData[srcIndex + 2];
          outData[outIndex + 3] = srcData[srcIndex + 3];
        }
      }
      rectCtx.putImageData(rectImageData, 0, 0);
      outCtx.putImageData(outImageData, 0, 0);
      const edgeImage = out.toDataURL("image/png");
      const rectImage = rectOut.toDataURL("image/png");
      const polygonImage = buildPolygonMaskedImage(rectImageData, localMask, cropWidth, cropHeight, edgeImage);
      return {
        id: `subject-${index + 1}`,
        index: index + 1,
        x,
        y,
        width: cropWidth,
        height: cropHeight,
        baseWidth: cropWidth,
        baseHeight: cropHeight,
        area: box.area,
        rectImage,
        edgeImage,
        polygonImage,
        transparentImage: edgeImage,
        enhancedRectImage: "",
        enhancedRectWidth: 0,
        enhancedRectHeight: 0,
        enhancedEdgeImage: "",
        enhancedEdgeWidth: 0,
        enhancedEdgeHeight: 0,
        enhancedPolygonImage: "",
        enhancedPolygonWidth: 0,
        enhancedPolygonHeight: 0,
        paintedRectImage: "",
        paintedEdgeImage: "",
        paintedPolygonImage: "",
        paintedEnhancedRectImage: "",
        paintedEnhancedEdgeImage: "",
        paintedEnhancedPolygonImage: "",
        image: edgeImage,
      };
    }
    return {
      id: `subject-${index + 1}`,
      index: index + 1,
      x,
      y,
      width: cropWidth,
      height: cropHeight,
      baseWidth: cropWidth,
      baseHeight: cropHeight,
      area: box.area,
      rectImage: "",
      edgeImage: "",
      polygonImage: "",
      transparentImage: "",
      enhancedRectImage: "",
      enhancedRectWidth: 0,
      enhancedRectHeight: 0,
      enhancedEdgeImage: "",
      enhancedEdgeWidth: 0,
      enhancedEdgeHeight: 0,
      enhancedPolygonImage: "",
      enhancedPolygonWidth: 0,
      enhancedPolygonHeight: 0,
      paintedRectImage: "",
      paintedEdgeImage: "",
      paintedPolygonImage: "",
      paintedEnhancedRectImage: "",
      paintedEnhancedEdgeImage: "",
      paintedEnhancedPolygonImage: "",
      image: "",
    };
  });
  return {
    sourceImage: canvas.toDataURL("image/png"),
    removedImage: removedCanvas.toDataURL("image/png"),
    processImage,
    backgroundColor,
    width,
    height,
    items,
  };
}

async function resolveSplitSourceDataUrl(rawImage, options = {}) {
  const apiBaseUrl = options.apiBaseUrl || (typeof window !== "undefined" ? window.__apiBaseUrl : "");
  const proxyUrl = options.proxyUrl || (typeof window !== "undefined" ? window.__proxyUrl : "");
  let normalized = normalizeImageValue(rawImage, apiBaseUrl);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) {
    const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
    normalized = normalizeImageValue(proxied, apiBaseUrl) || normalized;
  }
  if (/^https?:\/\//i.test(normalized)) {
    const resp = await fetch(normalized);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    normalized = await blobToDataUrl(blob);
  }
  return normalizeImageValue(normalized, apiBaseUrl);
}

async function buildSplitItemDisplayList(items = [], options = {}) {
  const source = Array.isArray(items) ? items : [];
  const shapeMode = normalizeSplitShapeMode(options.shapeMode);
  const renderMode = normalizeSplitRenderMode(options.renderMode);
  const backgroundColor = typeof options.backgroundColor === "string" && options.backgroundColor.trim()
    ? options.backgroundColor
    : DEFAULT_SPLIT_BG_COLOR;
  const enhance = options.enhance !== false;
  const result = [];
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index];
    const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
    const rectImage = item.rectImage || item.image || "";
    const edgeImage = item.edgeImage || item.transparentImage || rectImage;
    const polygonImage = item.polygonImage || edgeImage;
    let displayBaseImage = getSplitShapeDataUrl({ rectImage, edgeImage, polygonImage, image: item.image }, shapeMode);
    if (!displayBaseImage) continue;
    let width = item.width || 0;
    let height = item.height || 0;

    let enhancedRectImage = item.enhancedRectImage || "";
    let enhancedRectWidth = Number(item.enhancedRectWidth) || 0;
    let enhancedRectHeight = Number(item.enhancedRectHeight) || 0;
    let enhancedEdgeImage = item.enhancedEdgeImage || "";
    let enhancedEdgeWidth = Number(item.enhancedEdgeWidth) || 0;
    let enhancedEdgeHeight = Number(item.enhancedEdgeHeight) || 0;
    let enhancedPolygonImage = item.enhancedPolygonImage || "";
    let enhancedPolygonWidth = Number(item.enhancedPolygonWidth) || 0;
    let enhancedPolygonHeight = Number(item.enhancedPolygonHeight) || 0;

    if (enhance) {
      if (shapeMode === "rect" && (!enhancedRectImage || !enhancedRectWidth || !enhancedRectHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(rectImage || displayBaseImage, { minLongSide: 1024 });
        enhancedRectImage = enhanced.dataUrl;
        enhancedRectWidth = enhanced.width;
        enhancedRectHeight = enhanced.height;
      } else if (shapeMode === "polygon" && (!enhancedPolygonImage || !enhancedPolygonWidth || !enhancedPolygonHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(polygonImage || edgeImage || displayBaseImage, { minLongSide: 1024 });
        enhancedPolygonImage = enhanced.dataUrl;
        enhancedPolygonWidth = enhanced.width;
        enhancedPolygonHeight = enhanced.height;
      } else if (shapeMode === "edge" && (!enhancedEdgeImage || !enhancedEdgeWidth || !enhancedEdgeHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(edgeImage || displayBaseImage, { minLongSide: 1024 });
        enhancedEdgeImage = enhanced.dataUrl;
        enhancedEdgeWidth = enhanced.width;
        enhancedEdgeHeight = enhanced.height;
      }
    }

    let displayImage = displayBaseImage;
    if (enhance) {
      if (shapeMode === "rect") {
        displayImage = enhancedRectImage || displayBaseImage;
        width = enhancedRectWidth || width;
        height = enhancedRectHeight || height;
      } else if (shapeMode === "polygon") {
        displayImage = enhancedPolygonImage || displayBaseImage;
        width = enhancedPolygonWidth || width;
        height = enhancedPolygonHeight || height;
      } else {
        displayImage = enhancedEdgeImage || displayBaseImage;
        width = enhancedEdgeWidth || width;
        height = enhancedEdgeHeight || height;
      }
    }

    let paintedRectImage = item.paintedRectImage || "";
    let paintedEdgeImage = item.paintedEdgeImage || "";
    let paintedPolygonImage = item.paintedPolygonImage || "";
    let paintedEnhancedRectImage = item.paintedEnhancedRectImage || "";
    let paintedEnhancedEdgeImage = item.paintedEnhancedEdgeImage || "";
    let paintedEnhancedPolygonImage = item.paintedEnhancedPolygonImage || "";
    const paintedBackgroundColor = item.paintedBackgroundColor || "";
    if (paintedBackgroundColor !== backgroundColor) {
      paintedRectImage = "";
      paintedEdgeImage = "";
      paintedPolygonImage = "";
      paintedEnhancedRectImage = "";
      paintedEnhancedEdgeImage = "";
      paintedEnhancedPolygonImage = "";
    }

    if (renderMode === "painted") {
      if (enhance) {
        if (shapeMode === "rect") {
          if (!paintedEnhancedRectImage) paintedEnhancedRectImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedRectImage;
        } else if (shapeMode === "polygon") {
          if (!paintedEnhancedPolygonImage) paintedEnhancedPolygonImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedPolygonImage;
        } else {
          if (!paintedEnhancedEdgeImage) paintedEnhancedEdgeImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedEdgeImage;
        }
      } else {
        if (shapeMode === "rect") {
          if (!paintedRectImage) paintedRectImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedRectImage;
        } else if (shapeMode === "polygon") {
          if (!paintedPolygonImage) paintedPolygonImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedPolygonImage;
        } else {
          if (!paintedEdgeImage) paintedEdgeImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEdgeImage;
        }
      }
    }

    result.push({
      ...item,
      index: index + 1,
      baseWidth,
      baseHeight,
      width: width || item.width || 0,
      height: height || item.height || 0,
      rectImage,
      edgeImage,
      polygonImage,
      transparentImage: edgeImage,
      enhancedRectImage,
      enhancedRectWidth,
      enhancedRectHeight,
      enhancedEdgeImage,
      enhancedEdgeWidth,
      enhancedEdgeHeight,
      enhancedPolygonImage,
      enhancedPolygonWidth,
      enhancedPolygonHeight,
      paintedRectImage,
      paintedEdgeImage,
      paintedPolygonImage,
      paintedEnhancedRectImage,
      paintedEnhancedEdgeImage,
      paintedEnhancedPolygonImage,
      paintedBackgroundColor: backgroundColor,
      image: displayImage,
    });
  }
  return result;
}

async function buildRemovedDisplayImage(baseImage, options = {}) {
  const source = typeof baseImage === "string" ? baseImage : "";
  if (!source) return { image: "", enhancedImage: "" };
  const enhance = options.enhance !== false;
  const cachedEnhanced = typeof options.cachedEnhanced === "string" ? options.cachedEnhanced : "";
  if (!enhance) {
    return {
      image: source,
      enhancedImage: cachedEnhanced,
    };
  }
  if (cachedEnhanced) {
    return {
      image: cachedEnhanced,
      enhancedImage: cachedEnhanced,
    };
  }
  const enhanced = await enhanceSplitImageDataUrl(source, { minLongSide: 1024 });
  return {
    image: enhanced.dataUrl,
    enhancedImage: enhanced.dataUrl,
  };
}

function normalizePromptVariant(variant, index = 0) {
  const fallbackKey = index === 0 ? "single" : index === 1 ? "a" : index === 2 ? "b" : `variant-${index}`;
  const key = typeof variant?.key === "string" && variant.key ? variant.key : fallbackKey;
  let label = typeof variant?.label === "string" && variant.label ? variant.label : "";
  if (!label) {
    if (key === "single") label = "PROMPT";
    else if (key === "a") label = "PROMPT A";
    else if (key === "b") label = "PROMPT B";
    else label = `PROMPT ${index + 1}`;
  }
  return {
    key,
    label,
    prompt: typeof variant?.prompt === "string" ? variant.prompt : "",
  };
}

function getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes = []) {
  if (taskMode === "compare") {
    return [
      normalizePromptVariant({ key: "a", label: "PROMPT A", prompt: comparePrompts?.a || "" }, 1),
      normalizePromptVariant({ key: "b", label: "PROMPT B", prompt: comparePrompts?.b || "" }, 2),
    ];
  }
  if (taskMode === "style") {
    return buildStylePromptVariants(prompt, styleThemes);
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: prompt || "" }, 0)];
}

function getTurnPromptVariants(turn) {
  if (Array.isArray(turn?.promptVariants) && turn.promptVariants.length) {
    return turn.promptVariants.map((variant, index) => normalizePromptVariant(variant, index));
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: turn?.prompt || "" }, 0)];
}

function getTurnMode(turn) {
  if (turn?.mode === "style") return "style";
  if (turn?.mode === "compare") return "compare";
  if (turn?.mode === "single") return "single";
  return getTurnPromptVariants(turn).length > 1 ? "compare" : "single";
}

function getResultPromptKey(result) {
  return typeof result?.promptKey === "string" && result.promptKey ? result.promptKey : "single";
}

function buildTurnImageKey(turnId, modelId, promptKey = "single", index = 1) {
  return `${turnId}:${modelId}:${promptKey || "single"}:${Math.max(1, Number(index) || 1)}`;
}

function buildTurnTaskKey(turnId, modelId, promptKey = "single") {
  return `${turnId}:${modelId}:${promptKey || "single"}`;
}

function toPersistableTurns(turns) {
  return turns.slice(0, 30);
}

function toLightweightTurns(turns) {
  return turns.slice(0, 30).map((t) => ({
    ...t,
    results: (t.results || []).map((r) => ({
      ...r,
      images: (r.images || []).filter((img) => typeof img === "string" && img.startsWith("http")).slice(0, 1),
    })),
  }));
}

function safeName(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "unknown";
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return cleaned || "unknown";
}

function buildResultFileStem(result) {
  const rawPromptKey = getResultPromptKey(result);
  const promptKey = safeName(rawPromptKey);
  const promptLabel = safeName(result?.promptLabel || "");
  const promptPrefix =
    rawPromptKey !== "single"
      ? `${promptKey}${promptLabel !== "unknown" ? `_${promptLabel}` : ""}_`
      : "";
  return `${promptPrefix}${safeName(result?.modelName || result?.modelId || "model")}`;
}

function isSameResultTask(result, modelId, promptKey = "single") {
  return result?.modelId === modelId && getResultPromptKey(result) === (promptKey || "single");
}

function normalizeTemplate(input, index = 0) {
  const fallbackId = `template-${index + 1}`;
  const id = typeof input?.id === "string" && input.id ? input.id : fallbackId;
  const title = typeof input?.title === "string" && input.title.trim()
    ? input.title.trim()
    : `Template ${index + 1}`;
  return {
    id,
    title,
    body: typeof input?.body === "string" ? input.body : "",
    backup: typeof input?.backup === "string" ? input.backup : "",
    memo: typeof input?.memo === "string" ? input.memo : "",
  };
}

function normalizeTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeTemplate(found || preset, index);
  });
}

function normalizeStyleTemplate(input, index = 0) {
  const fallbackId = `style-template-${index + 1}`;
  const id = typeof input?.id === "string" && input.id ? input.id : fallbackId;
  const title = typeof input?.title === "string" && input.title.trim()
    ? input.title.trim()
    : `Style ${index + 1}`;
  return {
    id,
    title,
    body: typeof input?.body === "string" ? input.body : "",
  };
}

function normalizeStyleTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeStyleTemplate(found || preset, index);
  });
}

function pickStyleTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

function normalizeStyleThemes(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_THEMES.map((_, index) => {
    const next = list[index];
    return typeof next === "string" ? next : "";
  });
}

function pickTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

function getTurnDirName(turn) {
  return `turn-${String(turn?.seq || 0).padStart(4, "0")}-${turn?.id}`;
}

function dataUrlToBytes(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "png";
  return { bytes, ext };
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {}
  return "png";
}

async function fetchImageBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const type = resp.headers.get("content-type") || "";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : extFromUrl(url);
  return { bytes: buf, ext };
}

function supportsFileSystemAccess() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function ensureDirectoryPermission(handle, write = false) {
  if (!handle?.queryPermission || !handle?.requestPermission) return false;
  const mode = write ? "readwrite" : "read";
  let permission = await handle.queryPermission({ mode });
  if (permission === "granted") return true;
  permission = await handle.requestPermission({ mode });
  return permission === "granted";
}

async function writeTextFile(dirHandle, fileName, text) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function writeBinaryFile(dirHandle, fileName, content) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveTurnToLocalFolder(rootHandle, turn) {
  const dirName = getTurnDirName(turn);
  const turnDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const promptVariants = getTurnPromptVariants(turn);
  let referenceImageFile = null;
  if (typeof turn.referenceImage === "string" && turn.referenceImage) {
    const fromData = dataUrlToBytes(turn.referenceImage);
    if (fromData) {
      referenceImageFile = `reference_image.${fromData.ext}`;
      await writeBinaryFile(turnDir, referenceImageFile, fromData.bytes);
    } else if (/^https?:\/\//i.test(turn.referenceImage)) {
      try {
        const remote = await fetchImageBytes(turn.referenceImage);
        referenceImageFile = `reference_image.${remote.ext}`;
        await writeBinaryFile(turnDir, referenceImageFile, remote.bytes);
      } catch {
        referenceImageFile = "reference_image.txt";
        await writeTextFile(turnDir, referenceImageFile, turn.referenceImage);
      }
    }
  }
  const styleReferenceImageFiles = [];
  const styleReferenceImages = Array.isArray(turn.styleReferenceImages) ? turn.styleReferenceImages : [];
  for (let index = 0; index < Math.min(styleReferenceImages.length, MAX_STYLE_REFERENCE_IMAGES); index += 1) {
    const image = styleReferenceImages[index];
    if (typeof image !== "string" || !image) continue;
    const fromData = dataUrlToBytes(image);
    if (fromData) {
      const fileName = `style_reference_${index + 1}.${fromData.ext}`;
      await writeBinaryFile(turnDir, fileName, fromData.bytes);
      styleReferenceImageFiles.push(fileName);
      continue;
    }
    if (/^https?:\/\//i.test(image)) {
      try {
        const remote = await fetchImageBytes(image);
        const fileName = `style_reference_${index + 1}.${remote.ext}`;
        await writeBinaryFile(turnDir, fileName, remote.bytes);
        styleReferenceImageFiles.push(fileName);
      } catch {
        const fileName = `style_reference_${index + 1}.txt`;
        await writeTextFile(turnDir, fileName, image);
        styleReferenceImageFiles.push(fileName);
      }
    }
  }
  const manifest = {
    id: turn.id,
    seq: turn.seq,
    createdAt: turn.createdAt,
    mode: getTurnMode(turn),
    prompt: turn.prompt || promptVariants[0]?.prompt || "",
    styleBasePrompt: typeof turn.styleBasePrompt === "string" ? turn.styleBasePrompt : "",
    styleThemes: normalizeStyleThemes(turn.styleThemes),
    promptVariants,
    apiBaseUrl: resolveApiBaseUrl(turn.apiBaseUrl),
    apiKeys: normalizeApiKeys(turn.apiKeys),
    aspectRatio: normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio),
    referenceImageFile,
    styleReferenceImageFiles,
    selectedModelIds: turn.selectedModelIds || [],
    modelCounts: turn.modelCounts || {},
    status: turn.status || "done",
    results: [],
  };

  const results = Array.isArray(turn.results) ? turn.results : [];
  for (const r of results) {
    const files = [];
    if (r.status === "success" && Array.isArray(r.images) && r.images.length > 0) {
      for (let i = 0; i < r.images.length; i += 1) {
        const img = r.images[i];
        const index = i + 1;
        const base = `${buildResultFileStem(r)}_${index}`;
        const fromData = typeof img === "string" ? dataUrlToBytes(img) : null;
        if (fromData) {
          const fileName = `${base}.${fromData.ext}`;
          await writeBinaryFile(turnDir, fileName, fromData.bytes);
          files.push(fileName);
          continue;
        }
        if (typeof img === "string" && /^https?:\/\//i.test(img)) {
          try {
            const remote = await fetchImageBytes(img);
            const fileName = `${base}.${remote.ext}`;
            await writeBinaryFile(turnDir, fileName, remote.bytes);
            files.push(fileName);
          } catch {
            const fileName = `${base}.txt`;
            await writeTextFile(turnDir, fileName, img);
            files.push(fileName);
          }
        }
      }
    }
    manifest.results.push({
      modelId: r.modelId,
      modelName: r.modelName,
      promptKey: getResultPromptKey(r),
      promptLabel: r.promptLabel || "",
      requestedCount: r.requestedCount || 1,
      status: r.status,
      error: r.error || null,
      files,
    });
  }

  await writeTextFile(turnDir, "prompt.json", JSON.stringify(manifest, null, 2));
}

async function fileToDataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadTurnsFromLocalFolder(rootHandle) {
  const turns = [];
  for await (const [entryName, entryHandle] of rootHandle.entries()) {
    if (entryHandle.kind !== "directory" || !entryName.startsWith("turn-")) continue;
    try {
      const promptHandle = await entryHandle.getFileHandle("prompt.json");
      const promptFile = await promptHandle.getFile();
      const meta = JSON.parse(await promptFile.text());
      const promptVariants = Array.isArray(meta.promptVariants) && meta.promptVariants.length
        ? meta.promptVariants.map((variant, index) => normalizePromptVariant(variant, index))
        : [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: meta.prompt || "" }, 0)];
      const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
      let referenceImage = meta.referenceImage || null;
      if (!referenceImage && typeof meta.referenceImageFile === "string" && meta.referenceImageFile) {
        try {
          const rf = await entryHandle.getFileHandle(meta.referenceImageFile);
          const refFile = await rf.getFile();
          if (/\.txt$/i.test(meta.referenceImageFile)) {
            referenceImage = (await refFile.text()).trim();
          } else {
            const dataUrl = await fileToDataUrlFromFile(refFile);
            if (typeof dataUrl === "string") referenceImage = dataUrl;
          }
        } catch {}
      }
      const styleReferenceImages = [];
      if (Array.isArray(meta.styleReferenceImageFiles)) {
        for (const fileName of meta.styleReferenceImageFiles.slice(0, MAX_STYLE_REFERENCE_IMAGES)) {
          if (typeof fileName !== "string" || !fileName) continue;
          try {
            const fh = await entryHandle.getFileHandle(fileName);
            const f = await fh.getFile();
            if (/\.txt$/i.test(fileName)) {
              const textUrl = (await f.text()).trim();
              if (textUrl) styleReferenceImages.push(textUrl);
            } else {
              const dataUrl = await fileToDataUrlFromFile(f);
              if (typeof dataUrl === "string") styleReferenceImages.push(dataUrl);
            }
          } catch {}
        }
      } else if (Array.isArray(meta.styleReferenceImages)) {
        meta.styleReferenceImages
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean)
          .slice(0, MAX_STYLE_REFERENCE_IMAGES)
          .forEach((item) => styleReferenceImages.push(item));
      }
      const loadedResults = [];

      const metaResults = Array.isArray(meta.results) ? meta.results : [];
      for (const r of metaResults) {
        const images = [];
        const files = Array.isArray(r.files) ? r.files : [];
        for (const fileName of files) {
          try {
            const fh = await entryHandle.getFileHandle(fileName);
            const f = await fh.getFile();
            if (/\.txt$/i.test(fileName)) {
              images.push((await f.text()).trim());
            } else {
              const dataUrl = await fileToDataUrlFromFile(f);
              if (typeof dataUrl === "string") images.push(dataUrl);
            }
          } catch {}
        }
        loadedResults.push({
          modelId: normalizeModelId(r.modelId || "unknown-model"),
          modelName: r.modelName || r.modelId || "Unknown",
          promptKey: getResultPromptKey(r),
          promptLabel:
            r.promptLabel ||
            promptLookup.get(getResultPromptKey(r))?.label ||
            promptVariants[0]?.label ||
            "PROMPT",
          promptText:
            promptLookup.get(getResultPromptKey(r))?.prompt ||
            promptVariants[0]?.prompt ||
            meta.prompt ||
            "",
          requestedCount: r.requestedCount || Math.max(1, images.length || 1),
          status: r.status || (images.length ? "success" : "error"),
          images,
          error: r.error || null,
        });
      }

      turns.push({
        id: meta.id || Date.now() + Math.floor(Math.random() * 1000),
        seq: Number(meta.seq) || 0,
        createdAt: Number(meta.createdAt) || Date.now(),
        mode:
          meta.mode === "style"
            ? "style"
            : meta.mode === "compare" || promptVariants.length > 1
            ? "compare"
            : "single",
        prompt: meta.prompt || promptVariants[0]?.prompt || "",
        styleBasePrompt:
          typeof meta.styleBasePrompt === "string"
            ? meta.styleBasePrompt
            : meta.prompt || promptVariants[0]?.prompt || "",
        styleThemes: normalizeStyleThemes(meta.styleThemes),
        promptVariants,
        apiBaseUrl: resolveApiBaseUrl(meta.apiBaseUrl),
        apiKeys: normalizeApiKeys(
          meta.apiKeys && typeof meta.apiKeys === "object"
            ? meta.apiKeys
            : {
                [normalizeApiPlatform(meta.apiPlatform)]: normalizeApiKey(meta.apiKey),
              }
        ),
        aspectRatio: normalizeAspectRatio(meta.aspectRatio ?? meta.geminiAspectRatio),
        referenceImage,
        styleReferenceImages,
        selectedModelIds: Array.isArray(meta.selectedModelIds)
          ? meta.selectedModelIds.map((id) => normalizeModelId(id))
          : loadedResults.map((r) => r.modelId),
        modelCounts:
          meta.modelCounts && typeof meta.modelCounts === "object"
            ? {
                ...meta.modelCounts,
                ...(typeof meta.modelCounts["nano-banana-pro-all"] === "number" &&
                typeof meta.modelCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number"
                  ? { [NANO_PRO_OFFICIAL_MODEL_ID]: meta.modelCounts["nano-banana-pro-all"] }
                  : null),
                ...(typeof meta.modelCounts["gemini-3-pro-preview"] === "number" &&
                typeof meta.modelCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number"
                  ? { [NANO_PRO_OFFICIAL_MODEL_ID]: meta.modelCounts["gemini-3-pro-preview"] }
                  : null),
              }
            : {},
        proxyUrl: "",
        status: "done",
        results: loadedResults,
        folderSyncedAt: Date.now(),
      });
    } catch {
      // Ignore malformed or incomplete directories.
    }
  }
  return turns.sort((a, b) => b.seq - a.seq);
}

async function loadTemplatesFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(TEMPLATE_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    const templates = normalizeTemplates(raw?.templates);
    const activeTemplateId = pickTemplateId(templates, raw?.activeTemplateId);
    return { templates, activeTemplateId };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") return null;
    const templates = normalizeTemplates(DEFAULT_TEMPLATES);
    return { templates, activeTemplateId: null };
  }
}

async function saveTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
  const normalized = normalizeTemplates(templates);
  const safeActiveId = pickTemplateId(normalized, activeTemplateId);
  await writeTextFile(
    rootHandle,
    TEMPLATE_FILE_NAME,
    JSON.stringify(
      {
        activeTemplateId: safeActiveId,
        templates: normalized,
      },
      null,
      2
    )
  );
}

async function loadStyleTemplatesFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(STYLE_TEMPLATE_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    const templates = normalizeStyleTemplates(raw?.templates);
    const activeTemplateId = pickStyleTemplateId(templates, raw?.activeTemplateId);
    return { templates, activeTemplateId };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") return null;
    const templates = normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES);
    return { templates, activeTemplateId: templates[0]?.id || null };
  }
}

async function saveStyleTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
  const normalized = normalizeStyleTemplates(templates);
  const safeActiveId = pickStyleTemplateId(normalized, activeTemplateId);
  await writeTextFile(
    rootHandle,
    STYLE_TEMPLATE_FILE_NAME,
    JSON.stringify(
      {
        activeTemplateId: safeActiveId,
        templates: normalized,
      },
      null,
      2
    )
  );
}

async function loadGptAssistFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(GPT_ASSIST_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    return {
      prompt: normalizeGptAssistPrompt(raw?.prompt),
      styleThemePrompt: normalizeStyleThemeAssistPrompt(raw?.styleThemePrompt),
      sendPromptText: normalizeGptAssistFlag(raw?.sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT),
      sendPromptImage: normalizeGptAssistFlag(raw?.sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE),
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return {
        prompt: DEFAULT_GPT_ASSIST_PROMPT,
        styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
        sendPromptText: DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
        sendPromptImage: DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
      };
    }
    return {
      prompt: DEFAULT_GPT_ASSIST_PROMPT,
      styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
      sendPromptText: DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
      sendPromptImage: DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
    };
  }
}

async function saveGptAssistToLocalFolder(rootHandle, prompt, styleThemePrompt, sendPromptText, sendPromptImage) {
  const normalizedPrompt = normalizeGptAssistPrompt(prompt);
  const normalizedStyleThemePrompt = normalizeStyleThemeAssistPrompt(styleThemePrompt);
  await writeTextFile(
    rootHandle,
    GPT_ASSIST_FILE_NAME,
    JSON.stringify(
      {
        prompt: normalizedPrompt,
        styleThemePrompt: normalizedStyleThemePrompt,
        sendPromptText: normalizeGptAssistFlag(sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT),
        sendPromptImage: normalizeGptAssistFlag(sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE),
      },
      null,
      2
    )
  );
}

async function loadApiConfigFromLocalFolder(rootHandle) {
  async function recoverApiKeysFromTurns() {
    let bestSeq = -1;
    let bestCreatedAt = -1;
    let recovered = normalizeApiKeys(DEFAULT_API_KEYS);
    let found = false;

    for await (const [entryName, entryHandle] of rootHandle.entries()) {
      if (entryHandle.kind !== "directory" || !entryName.startsWith("turn-")) continue;
      try {
        const promptHandle = await entryHandle.getFileHandle("prompt.json");
        const promptFile = await promptHandle.getFile();
        const raw = JSON.parse(await promptFile.text());
        const candidateKeys = normalizeApiKeys(
          raw?.apiKeys && typeof raw.apiKeys === "object"
            ? raw.apiKeys
            : {
                [normalizeApiPlatform(raw?.apiPlatform)]: raw?.apiKey,
              }
        );
        if (!candidateKeys.deerapi && !candidateKeys.bailian) continue;
        const seq = Number(raw?.seq) || 0;
        const createdAt = Number(raw?.createdAt) || 0;
        const isNewer = seq > bestSeq || (seq === bestSeq && createdAt >= bestCreatedAt);
        if (!isNewer) continue;
        bestSeq = seq;
        bestCreatedAt = createdAt;
        recovered = candidateKeys;
        found = true;
      } catch {}
    }

    return {
      ...recovered,
      exists: found,
    };
  }

  try {
    const fileHandle = await rootHandle.getFileHandle(API_CONFIG_FILE_NAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const raw = JSON.parse(text);
    const rawObject = raw && typeof raw === "object" ? raw : {};
    const rawString = typeof raw === "string" ? raw : "";
    const legacyPlatform = normalizeApiPlatform(raw?.apiPlatform);
    const legacyKey = normalizeApiKey(raw?.apiKey);
    const normalizedKeys = normalizeApiKeys({
      deerapi:
        rawObject?.deerapiKey ||
        rawObject?.deerApiKey ||
        rawObject?.apiKeys?.deerapi ||
        rawObject?.apiKeys?.deerApiKey ||
        rawString ||
        (legacyPlatform === "deerapi" ? legacyKey : ""),
      bailian:
        rawObject?.bailianKey ||
        rawObject?.dashscopeKey ||
        rawObject?.apiKeys?.bailian ||
        rawObject?.apiKeys?.dashscopeKey ||
        (legacyPlatform === "bailian" ? legacyKey : ""),
    });
    if (!normalizedKeys.deerapi && !normalizedKeys.bailian) {
      return recoverApiKeysFromTurns();
    }
    return {
      ...normalizedKeys,
      exists: true,
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return recoverApiKeysFromTurns();
    }
    const recovered = await recoverApiKeysFromTurns();
    if (recovered.exists) return recovered;
    return {
      ...DEFAULT_API_KEYS,
      exists: false,
    };
  }
}

async function saveApiConfigToLocalFolder(rootHandle, apiKeys) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  await writeTextFile(
    rootHandle,
    API_CONFIG_FILE_NAME,
    JSON.stringify(
      {
        deerapiKey: normalizedKeys.deerapi,
        bailianKey: normalizedKeys.bailian,
        apiKeys: {
          deerapi: normalizedKeys.deerapi,
          bailian: normalizedKeys.bailian,
        },
        // Keep legacy DeerAPI fields so old folders remain readable by older builds.
        apiKey: normalizedKeys.deerapi,
        apiPlatform: normalizedKeys.deerapi ? "deerapi" : normalizedKeys.bailian ? "bailian" : "deerapi",
      },
      null,
      2
    )
  );
}

async function downloadAllAsZip(turns) {
  const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
  const zip = new JSZip();

  const ordered = [...turns].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < ordered.length; i += 1) {
    const turn = ordered[i];
    const folder = zip.folder(String(i + 1));
    const promptVariants = getTurnPromptVariants(turn);
    folder.file(
      "prompt.json",
      JSON.stringify(
        {
          seq: turn.seq,
          createdAt: new Date(turn.createdAt).toISOString(),
          mode: getTurnMode(turn),
          prompt: turn.prompt || promptVariants[0]?.prompt || "",
          promptVariants,
          apiBaseUrl: resolveApiBaseUrl(turn.apiBaseUrl),
          apiKeys: normalizeApiKeys(turn.apiKeys),
          selectedModels: turn.selectedModelIds,
          selectedModelCounts: turn.modelCounts || {},
          status: turn.status,
        },
        null,
        2
      )
    );

    const okResults = (turn.results || []).filter((r) => r.status === "success" && r.images?.length);
    for (const r of okResults) {
      const resultBase = buildResultFileStem(r);
      for (let j = 0; j < r.images.length; j += 1) {
        const img = r.images[j];
        const index = j + 1;
        const fromDataUrl = dataUrlToBytes(img);
        if (fromDataUrl) {
          folder.file(`${resultBase}_${index}.${fromDataUrl.ext}`, fromDataUrl.bytes);
          continue;
        }
        if (/^https?:\/\//i.test(img)) {
          try {
            const remote = await fetchImageBytes(img);
            folder.file(`${resultBase}_${index}.${remote.ext}`, remote.bytes);
          } catch {
            // Keep URL fallback if remote download is blocked.
            folder.file(`${resultBase}_${index}.txt`, img);
          }
        }
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `polyimage-history-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── DeerAPI Call Functions ───

async function callTextAssistAPI(proxyUrl, sourcePrompt, imageBase64, assistPrompt, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const sendPromptText = normalizeGptAssistFlag(options.sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const sendPromptImage = normalizeGptAssistFlag(options.sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const normalizedAssistPrompt = normalizeGptAssistPrompt(assistPrompt);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
  const placeholders = extractPlaceholderTokens(sourcePrompt);
  if (!placeholders.length) return sourcePrompt;

  const textInstructionLines = [
    "以下 GPT 改写指令必须严格执行：",
    normalizedAssistPrompt,
    "",
    "只改写 {{ }} 内的内容，不改动大括号外内容。",
    "输出严格 JSON：{\"replacements\":[\"...\", \"...\"]}。",
    "replacements 数组长度必须与占位符数量一致。",
    "改写要保留用户原有语气和随机感，不要模板化。",
    "",
    `占位符数量: ${placeholders.length}`,
  ];
  if (sendPromptText) {
    textInstructionLines.push(`原始 prompt: ${sourcePrompt}`);
    textInstructionLines.push(`占位符原文: ${JSON.stringify(placeholders)}`);
  } else {
    textInstructionLines.push("本次未发送 prompt 文本，请只根据系统提示和已发送的上下文生成替换内容。");
  }
  const textInstruction = textInstructionLines.join("\n");

  const userContent = [{ type: "text", text: textInstruction }];
  if (sendPromptImage && imageBase64) {
    userContent.push({ type: "image_url", image_url: { url: imageBase64 } });
  }

  const body = {
    model: resolveTextAssistModelId(apiPlatform),
    stream: false,
    temperature: 1.15,
    messages: [
      { role: "system", content: normalizedAssistPrompt },
      { role: "user", content: userContent },
    ],
  };

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const rawText = assistantMessageToText(data?.choices?.[0]?.message?.content);
  const parsed = parseJsonFromText(rawText);
  const parsedList = Array.isArray(parsed?.replacements)
    ? parsed.replacements
    : Array.isArray(parsed)
    ? parsed
    : [];
  if (!parsedList.length) {
    throw new Error("GPT 返回格式错误，请检查 GPT Prompt。");
  }
  const replacements = placeholders.map((original, index) => {
    const next = parsedList[index];
    if (typeof next !== "string") return original;
    const normalized = next.trim();
    return normalized || original;
  });
  return applyPlaceholderReplacements(sourcePrompt, replacements);
}

async function callThemeAssistAPI(proxyUrl, seedText, assistPrompt, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const sendPromptText = normalizeGptAssistFlag(options.sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
  const normalizedSeed = typeof seedText === "string" ? seedText.trim() : "";
  if (!normalizedSeed) return [];

  const contentLines = [];
  if (sendPromptText) {
    contentLines.push(`主题词：${normalizedSeed}`);
  } else {
    contentLines.push("本次未发送主题词文本，请只根据系统提示输出 12 个可用于视觉创作的元素。");
  }
  contentLines.push(`请输出 ${STYLE_THEME_SLOTS} 个与主题相关、可用于生图的视觉元素。`);
  contentLines.push("请严格输出 JSON。");

  const body = {
    model: resolveTextAssistModelId(apiPlatform),
    stream: false,
    temperature: 1.1,
    messages: [
      { role: "system", content: normalizeStyleThemeAssistPrompt(assistPrompt) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: contentLines.join("\n"),
          },
        ],
      },
    ],
  };

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const rawText = assistantMessageToText(data?.choices?.[0]?.message?.content);
  return parseThemeSuggestions(rawText);
}

async function callTextAssistWithFallback(proxyUrl, sourcePrompt, imageBase64, assistPrompt, options = {}) {
  const apiKeys = normalizeApiKeys(options.apiKeys);
  const platformOrder = getAssistPlatformOrder(apiKeys);
  let lastError = null;
  for (const platform of platformOrder) {
    try {
      return await callTextAssistAPI(proxyUrl, sourcePrompt, imageBase64, assistPrompt, {
        ...options,
        ...getApiConfigForPlatform(platform, apiKeys),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Text assist request failed");
}

async function callThemeAssistWithFallback(proxyUrl, seedText, assistPrompt, options = {}) {
  const apiKeys = normalizeApiKeys(options.apiKeys);
  const platformOrder = getAssistPlatformOrder(apiKeys);
  let lastError = null;
  for (const platform of platformOrder) {
    try {
      return await callThemeAssistAPI(proxyUrl, seedText, assistPrompt, {
        ...options,
        ...getApiConfigForPlatform(platform, apiKeys),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Theme assist request failed");
}

// 1. OpenAI Chat Completions format (gpt-4o-image, gpt-5-image)
async function callChatAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const content = [];
  if (prompt) content.push({ type: "text", text: prompt });
  imageInputs.forEach((image) => {
    content.push({ type: "image_url", image_url: { url: image } });
  });
  if (!content.length) content.push({ type: "text", text: "Generate a creative image" });

  const body = {
    model: model.id,
    stream: false,
    messages: [{ role: "user", content }],
  };

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const images = [];
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("No response from model");

  const c = msg.content;
  if (typeof c === "string") {
    const re = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
    const matches = c.match(re);
    if (matches) images.push(...matches);
    const urlRe = /https?:\/\/[^\s"')]+/gi;
    const urlMatches = c.match(urlRe);
    if (urlMatches) images.push(...urlMatches);
  } else if (Array.isArray(c)) {
    c.forEach((block) => {
      if (block.type === "image_url") images.push(block.image_url?.url);
      if (block.type === "image" && block.source?.data) images.push(`data:image/${block.source.media_type || "png"};base64,${block.source.data}`);
    });
  }
  if (msg.images) images.push(...msg.images);
  return Array.from(new Set(images.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean)));
}

// 2. OpenAI Images / Seedream format (gpt-image-1, gpt-image-1.5, seedream)
async function callImagesAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
  const isSeedream = model.provider === "ByteDance";
  const body = {
    model: model.id,
    prompt: prompt || "Generate a creative image",
    n: Math.max(1, Number(count) || 1),
    size: isSeedream ? "2K" : "1024x1024",
  };
  if (isSeedream) {
    // Use URL response to avoid oversized base64 payload causing network failures.
    body.response_format = "url";
    body.watermark = true;
    body.guidance_scale = 3;
  }
  if (primaryImage && isSeedream) {
    body.image = primaryImage;
  }

  const data = await postJsonWithRetry(proxyUrl, "/v1/images/generations", body, {
    signal,
    maxAttempts: 4,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const images = [];
  // OpenAI-style: { data: [ { b64_json, url } ] }
  if (Array.isArray(data.data)) {
    data.data.forEach((item) => {
      const normalized =
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  // 某些实现可能直接返回 { image_base64: "...", url: "..." }
  if (!images.length) {
    const normalized = normalizeImageValue(data.image_base64, apiBaseUrl) || normalizeImageValue(data.url, apiBaseUrl);
    if (normalized) images.push(normalized);
  }
  if (!images.length && Array.isArray(data.images)) {
    data.images.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length && Array.isArray(data.result)) {
    data.result.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    extractImageCandidates(data, images, apiBaseUrl);
  }

  const deduped = Array.from(new Set(images));
  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  const finalImages = resolved
    .map((v) => normalizeImageValue(v, apiBaseUrl))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);

  return finalImages;
}

async function callBailianImageAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const isQwenModel = isQwenImageModel(model);
  const effectiveImageInputs = imageInputs
    .slice(0, getBailianImageInputLimit(model))
    .map((image) => normalizeImageValue(image, apiBaseUrl))
    .filter(Boolean);
  const content = [];

  const textPrompt = typeof prompt === "string" && prompt.trim() ? prompt.trim() : "Generate a creative image";
  effectiveImageInputs.forEach((image) => {
    content.push({
      image,
    });
  });
  content.push({ text: textPrompt });
  const imageSize = getBailianImageSize(model, options.aspectRatio, effectiveImageInputs.length > 0);

  const body = {
    model: model.id,
    input: {
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: {
      n: Math.min(Math.max(1, Number(count) || 1), isQwenModel ? 6 : 4),
      ...(imageSize ? { size: imageSize } : {}),
      watermark: false,
      ...(isQwenModel ? { prompt_extend: true } : {}),
      ...(!isQwenModel && !effectiveImageInputs.length && model?.id === "wan2.7-image-pro" ? { thinking_mode: true } : {}),
    },
  };

  const data = await postJsonWithRetry(proxyUrl, "/api/v1/services/aigc/multimodal-generation/generation", body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const images = [];
  if (Array.isArray(data?.output?.choices)) {
    data.output.choices.forEach((choice) => {
      const blocks = Array.isArray(choice?.message?.content) ? choice.message.content : [];
      blocks.forEach((item) => {
        const normalized =
          normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
          normalizeImageValue(item?.image, apiBaseUrl) ||
          normalizeImageValue(item?.url, apiBaseUrl) ||
          normalizeImageValue(item?.image_url, apiBaseUrl);
        if (normalized) images.push(normalized);
      });
    });
  }
  if (Array.isArray(data?.output?.images)) {
    data.output.images.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.image, apiBaseUrl) ||
        normalizeImageValue(item?.image_url, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length && Array.isArray(data?.output?.results)) {
    data.output.results.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.image, apiBaseUrl) ||
        normalizeImageValue(item?.image_url, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    extractImageCandidates(data, images, apiBaseUrl);
  }

  const deduped = Array.from(new Set(images.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean)));
  if (!deduped.length) {
    throw new Error("百炼未返回可用图片");
  }

  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  return resolved
    .map((v) => normalizeImageValue(v, apiBaseUrl))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
}

// 3. Gemini generateContent format
async function callGeminiAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const resolvedImageInputs = await Promise.all(
    imageInputs.map(async (image) => {
      const normalized = normalizeImageValue(image, apiBaseUrl);
      if (!normalized) return null;
      if (normalized.startsWith("data:image/")) return normalized;
      if (!/^https?:\/\//i.test(normalized)) return null;
      const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
      const resolved = normalizeImageValue(proxied, apiBaseUrl);
      return resolved?.startsWith("data:image/") ? resolved : null;
    })
  );
  const parts = [];
  if (prompt) parts.push({ text: prompt });
  if (!prompt && !resolvedImageInputs.filter(Boolean).length) parts.push({ text: "Generate a creative image" });
  resolvedImageInputs.filter(Boolean).forEach((image) => {
    const mimeType = getMimeFromDataUrl(image);
    const data = stripBase64Prefix(image);
    parts.push({
      inlineData: { mimeType, data },
      inline_data: { mime_type: mimeType, data },
    });
  });

  const generationConfig = { responseModalities: ["IMAGE"] };
  if (aspectRatio !== "auto") {
    generationConfig.imageConfig = { aspectRatio };
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  function extractGeminiImages(data) {
    const raw = [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    candidates.forEach((candidate) => {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      parts.forEach((part) => {
        const camelData = part?.inlineData?.data;
        const camelMime = part?.inlineData?.mimeType || "image/png";
        if (camelData) raw.push(`data:${camelMime};base64,${camelData}`);

        const snakeData = part?.inline_data?.data;
        const snakeMime = part?.inline_data?.mime_type || "image/png";
        if (snakeData) raw.push(`data:${snakeMime};base64,${snakeData}`);

        const camelFile = part?.fileData?.fileUri;
        if (camelFile) raw.push(camelFile);
        const snakeFile = part?.file_data?.file_uri;
        if (snakeFile) raw.push(snakeFile);
      });
    });
    if (!raw.length) extractImageCandidates(data, raw, apiBaseUrl);
    return Array.from(new Set(raw.map((v) => normalizeImageValue(v, apiBaseUrl)).filter(Boolean)));
  }

  let lastErr = null;
  const modelCandidates = getGeminiModelCandidates(model.id);
  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const currentModelId = modelCandidates[modelIndex];
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const resp = await fetch(proxyUrl, {
        method: "POST",
        headers: buildProxyHeaders(`/v1beta/models/${currentModelId}:generateContent`, apiBaseUrl, apiKey, { "Content-Type": "application/json" }, apiPlatform),
        body: JSON.stringify(body),
        signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        const extracted = extractGeminiImages(data);
        if (extracted.length) {
          const resolved = await Promise.all(extracted.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
          const finalImages = resolved
            .map((v) => normalizeImageValue(v, apiBaseUrl))
            .filter(Boolean)
            .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
          if (finalImages.length) return finalImages;
        }
        lastErr = new Error("API 200: No images returned");
        if (attempt < maxAttempts) {
          await sleep(1000 * attempt, signal);
          continue;
        }
        break;
      }
      const text = (await resp.text()).slice(0, 300);
      lastErr = new Error(`API ${resp.status}: ${text}`);
      const channelUnavailable = /无可用渠道|更换分组尝试/i.test(text);
      const canTryFallbackModel = channelUnavailable && modelIndex < modelCandidates.length - 1;
      if (canTryFallbackModel) break;
      if (resp.status !== 524 || attempt >= maxAttempts) break;
      await sleep(1000 * attempt, signal);
    }
  }
  throw lastErr || new Error("Gemini request failed");
}
// 4. Midjourney imagine + fetch（按接口文档，只显示 1 张）
async function callMidjourneyAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  if (!prompt) throw new Error("Midjourney 需要文字 prompt");

  function extractTaskId(payload) {
    if (!payload) return null;
    const candidate = payload.result;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "object" && candidate) {
      return candidate.taskId || candidate.task_id || candidate.id || candidate.uuid || null;
    }
    return (
      payload.taskId ||
      payload.task_id ||
      payload.id ||
      payload.uuid ||
      payload.properties?.taskId ||
      payload.properties?.task_id ||
      payload.data?.taskId ||
      payload.data?.task_id ||
      null
    );
  }

  async function submitWithBotType(botType) {
    const submitBody = {
      botType,
      prompt,
      accountFilter: { modes: ["FAST"] },
    };
    if (imageInputs.length) submitBody.base64Array = imageInputs.map((item) => stripBase64Prefix(item)).filter(Boolean);

    const submitResp = await fetch(proxyUrl, {
      method: "POST",
      headers: buildProxyHeaders("/mj/submit/imagine", apiBaseUrl, apiKey, {
        "Content-Type": "application/json",
      }, apiPlatform),
      body: JSON.stringify(submitBody),
      signal,
    });
    const rawText = await submitResp.text();
    let submitData = null;
    try {
      submitData = rawText ? JSON.parse(rawText) : null;
    } catch {}
    return {
      ok: submitResp.ok,
      status: submitResp.status,
      text: rawText,
      submitData,
      taskId: extractTaskId(submitData),
    };
  }

  const requested = Math.max(1, Number(count) || 1);
  const allImages = [];
  for (let idx = 0; idx < requested; idx += 1) {
    let submitData = null;
    let taskId = null;
    let submitError = null;
    for (const botType of ["mj", "MID_JOURNEY"]) {
      const submit = await submitWithBotType(botType);
      submitData = submit.submitData;
      taskId = submit.taskId;
      if (submit.ok && taskId) break;
      const bodyText = (typeof submit.text === "string" ? submit.text : "").slice(0, 300);
      submitError = new Error(`API ${submit.status}: ${bodyText || JSON.stringify(submit.submitData || {})}`);
    }
    if (!taskId) {
      if (submitError) throw submitError;
      throw new Error(`Midjourney 未返回任务 ID: ${JSON.stringify(submitData).slice(0, 500)}`);
    }

    const maxWaitMs = 480_000;
    const intervalMs = 5_000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await sleep(intervalMs, signal);

      const fetchResp = await fetch(proxyUrl, {
        method: "GET",
        headers: buildProxyHeaders(`/mj/task/${taskId}/fetch`, apiBaseUrl, apiKey, {}, apiPlatform),
        signal,
      });
      if (!fetchResp.ok) throw new Error(`API ${fetchResp.status}: ${(await fetchResp.text()).slice(0, 300)}`);
      const taskRaw = await fetchResp.json();
      const task = taskRaw?.result && typeof taskRaw.result === "object" ? taskRaw.result : taskRaw;

      const status =
        task?.status ||
        task?.taskStatus ||
        taskRaw?.status ||
        taskRaw?.taskStatus ||
        taskRaw?.code;
      const statusText = String(status || "").toUpperCase();
      if (statusText === "SUCCESS" || statusText === "SUCCEEDED" || status === 1) {
        const candidates = [
          ...(extractImageCandidates(task, [], apiBaseUrl) || []),
          ...(extractImageCandidates(taskRaw, [], apiBaseUrl) || []),
          ...(extractImageCandidates(task?.properties, [], apiBaseUrl) || []),
          ...(extractImageCandidates(taskRaw?.properties, [], apiBaseUrl) || []),
        ];
        const normalized = Array.from(new Set(candidates.map((v) => normalizeImageValue(v, apiBaseUrl)).filter(Boolean)));
        if (!normalized.length) throw new Error("Midjourney 任务成功但未返回图片地址");
        const resolved = await Promise.all(normalized.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
        const finalImages = resolved
          .map((v) => normalizeImageValue(v, apiBaseUrl))
          .filter(Boolean)
          .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
        if (!finalImages.length) throw new Error("Midjourney 任务成功但图片地址不可访问");
        allImages.push(finalImages[0]);
        break;
      }
      if (statusText === "FAILURE" || statusText === "FAILED" || statusText === "CANCEL" || status === -1) {
        throw new Error(task?.failReason || task?.message || taskRaw?.description || "Midjourney 任务失败");
      }
    }
  }
  if (!allImages.length) throw new Error("Midjourney 任务超时");
  return allImages;
}

// 5. NanoBanana via replicate
async function callReplicateNanoBananaAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
  if (!prompt) throw new Error("NanoBanana 需要文字 prompt");

  const models = "nanobanana";

  const submitBody = {
    input: {
      prompt,
      num_outputs: Math.max(1, Number(count) || 1),
    },
  };
  if (primaryImage) {
    submitBody.input.image = primaryImage;
  }

  const submitResp = await fetch(proxyUrl, {
    method: "POST",
    headers: buildProxyHeaders(`/replicate/v1/models/${models}/predictions`, apiBaseUrl, apiKey, {
      "Content-Type": "application/json",
    }, apiPlatform),
    body: JSON.stringify(submitBody),
    signal,
  });
  if (!submitResp.ok) throw new Error(`API ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`);
  const submitData = await submitResp.json();
  const predictionId = submitData?.id;
  if (!predictionId) throw new Error("NanoBanana 未返回任务 ID");

  const maxWaitMs = 60_000;
  const intervalMs = 3_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(intervalMs, signal);

    const fetchResp = await fetch(proxyUrl, {
      method: "GET",
      headers: buildProxyHeaders(`/replicate/v1/predictions/${predictionId}`, apiBaseUrl, apiKey, {}, apiPlatform),
      signal,
    });
    if (!fetchResp.ok) throw new Error(`API ${fetchResp.status}: ${(await fetchResp.text()).slice(0, 300)}`);
    const prediction = await fetchResp.json();

    if (prediction.status === "succeeded" || prediction.status === "success") {
      const out = prediction.output || [];
      const urls = Array.isArray(out) ? out : [out];
      return urls.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean);
    }
    if (prediction.status === "failed") {
      throw new Error(prediction.error || "NanoBanana 任务失败");
    }
  }

  throw new Error("NanoBanana 任务超时");
}

async function generateImage(proxyUrl, model, prompt, imageBase64, options = {}) {
  const requested = Math.max(1, Number(options.count) || 1);
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const primaryImage = imageInputs[0] || "";
  const expandedPrompt = expandPlaceholderValues(prompt || "");
  if (!isModelAvailableOnPlatform(model, apiPlatform)) {
    throw new Error(`${model?.name || model?.id || "当前模型"} 当前不支持 ${apiPlatform === "bailian" ? "百炼" : "DeerAPI"} 平台`);
  }
  const promptWithAspectRatio =
    model.apiType === "gemini" || model.apiType === "bailian"
      ? expandedPrompt.trim()
      : mergePromptWithAspectRatio(expandedPrompt, aspectRatio, model);
  const nextOptions = { ...options, apiPlatform, aspectRatio, imageInputs };
  switch (model.apiType) {
    case "chat": {
      const all = [];
      for (let i = 0; i < requested; i += 1) {
        const one = await callChatAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, nextOptions);
        if (Array.isArray(one) && one.length) all.push(...one.slice(0, 1));
      }
      return all;
    }
    case "images":
      return callImagesAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    case "bailian":
      return callBailianImageAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    case "gemini": {
      const all = [];
      let lastErr = null;
      let attempts = 0;
      const maxAttempts = Math.max(3, requested * 3);
      while (all.length < requested && attempts < maxAttempts) {
        attempts += 1;
        try {
          const one = await callGeminiAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, nextOptions);
          if (Array.isArray(one) && one.length) {
            all.push(...one.slice(0, 1));
            continue;
          }
          lastErr = new Error("API 200: No images returned");
        } catch (err) {
          lastErr = err;
          const message = String(err?.message || "");
          const retryable = /No images returned|API 429|API 503|temporarily unavailable|RESOURCE_EXHAUSTED|overloaded|timeout/i.test(message);
          if (!retryable || attempts >= maxAttempts) throw err;
        }
      }
      if (all.length) {
        return all.slice(0, requested);
      }
      throw lastErr || new Error("Gemini request failed");
    }
    case "midjourney":
      return callMidjourneyAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    case "replicate":
      return callReplicateNanoBananaAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    default:
      throw new Error(`Unknown apiType: ${model.apiType}`);
  }
}

// ─── Components ───
function PromptTextWithChips({ text }) {
  const chunks = splitPromptByPlaceholders(text);
  if (!chunks.length) return <span>(no prompt)</span>;
  return (
    <>
      {chunks.map((chunk, idx) => (
        chunk.type === "placeholder"
          ? <span key={`ph-${idx}`} style={S.promptChipReadonly}>{chunk.value || " "}</span>
          : <span key={`tx-${idx}`}>{chunk.value}</span>
      ))}
    </>
  );
}

function getPromptPreviewText(text, maxChars = 220) {
  const source = typeof text === "string" ? text : "";
  if (!source) return "";
  if (source.length <= maxChars) return source;
  return `${source.slice(0, maxChars).trimEnd()}…`;
}

function TokenPromptInput({ value, onChange, onKeyDown, onFocus, placeholder, rows = 4, editorRef }) {
  const rootRef = useRef(null);
  const selfUpdateRef = useRef(false);
  const internalValueRef = useRef(typeof value === "string" ? value : "");
  const activeChipRef = useRef(null);
  const selectionSnapshotRef = useRef(null);
  const zeroWidth = "\u200b";

  const setChipEditingState = useCallback((chip, editing) => {
    if (!chip) return;
    chip.contentEditable = editing ? "true" : "false";
    chip.style.background = editing ? "rgba(59,130,246,0.34)" : "rgba(59,130,246,0.24)";
    chip.style.borderColor = editing ? "rgba(147,197,253,0.95)" : "rgba(96,165,250,0.65)";
  }, []);

  const deactivateAllChips = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
    chips.forEach((chip) => setChipEditingState(chip, false));
    activeChipRef.current = null;
  }, [setChipEditingState]);

  const renderValueToDom = useCallback((nextValue) => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = "";
    const chunks = splitPromptByPlaceholders(nextValue);
    if (!chunks.length) return;
    chunks.forEach((chunk) => {
      if (chunk.type === "placeholder") {
        const span = document.createElement("span");
        span.setAttribute("data-placeholder-chip", "1");
        span.style.background = "rgba(59,130,246,0.24)";
        span.style.color = "#bfdbfe";
        span.style.border = "1px solid rgba(96,165,250,0.65)";
        span.style.borderRadius = "6px";
        span.style.padding = "1px 6px";
        span.style.display = "inline-block";
        span.style.minWidth = "12px";
        span.style.margin = "0 1px";
        span.contentEditable = "false";
        span.textContent = chunk.value || zeroWidth;
        root.appendChild(span);
        return;
      }
      root.appendChild(document.createTextNode(chunk.value));
    });
  }, []);

  const serializeDomToValue = useCallback(() => {
    const root = rootRef.current;
    if (!root) return "";
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      if (element.hasAttribute("data-placeholder-chip")) {
        const raw = (element.textContent || "").replaceAll(zeroWidth, "");
        out.push(`{{${raw}}}`);
        return;
      }
      const tag = element.tagName;
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      const childNodes = Array.from(element.childNodes);
      childNodes.forEach((child) => walk(child));
      if (tag === "DIV" || tag === "P") out.push("\n");
    };
    Array.from(root.childNodes).forEach((child) => walk(child));
    return out.join("").replace(/\n{3,}/g, "\n\n");
  }, []);

  const getNodeTextLength = useCallback((node) => {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length || 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return 0;
    const element = node;
    if (element.hasAttribute?.("data-placeholder-chip")) {
      const raw = (element.textContent || "").replaceAll(zeroWidth, "");
      return raw.length + 4;
    }
    if (element.tagName === "BR") return 1;
    let total = 0;
    Array.from(element.childNodes).forEach((child) => {
      total += getNodeTextLength(child);
    });
    if (element.tagName === "DIV" || element.tagName === "P") total += 1;
    return total;
  }, []);

  const getSelectionOffset = useCallback((boundaryNode, boundaryOffset) => {
    const root = rootRef.current;
    if (!root || !boundaryNode) return 0;
    let total = 0;
    const walk = (node) => {
      if (node === boundaryNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          total += Math.min(boundaryOffset, node.textContent?.length || 0);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const children = Array.from(node.childNodes);
          for (let i = 0; i < Math.min(boundaryOffset, children.length); i += 1) {
            total += getNodeTextLength(children[i]);
          }
        }
        return true;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        total += node.textContent?.length || 0;
        return false;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const element = node;
      if (element.hasAttribute?.("data-placeholder-chip")) {
        total += getNodeTextLength(element);
        return false;
      }
      if (element.tagName === "BR") {
        total += 1;
        return false;
      }
      const children = Array.from(element.childNodes);
      for (const child of children) {
        if (walk(child)) return true;
      }
      if (element.tagName === "DIV" || element.tagName === "P") {
        total += 1;
      }
      return false;
    };
    walk(root);
    return total;
  }, [getNodeTextLength]);

  const captureSelectionSnapshot = useCallback(() => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    return {
      start: getSelectionOffset(range.startContainer, range.startOffset),
      end: getSelectionOffset(range.endContainer, range.endOffset),
    };
  }, [getSelectionOffset]);

  const restoreSelectionSnapshot = useCallback((snapshot) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || !snapshot) return;
    const resolveBoundary = (targetOffset) => {
      let remaining = Math.max(0, targetOffset);
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textLength = node.textContent?.length || 0;
          if (remaining <= textLength) return { node, offset: remaining };
          remaining -= textLength;
          return null;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const element = node;
        if (element.hasAttribute?.("data-placeholder-chip")) {
          const firstChild = element.firstChild;
          const logicalLength = getNodeTextLength(element);
          if (remaining <= logicalLength) {
            const rawLength = firstChild?.textContent?.replaceAll?.(zeroWidth, "").length ?? 0;
            const innerOffset = Math.max(0, Math.min(rawLength, remaining >= 2 ? remaining - 2 : 0));
            return firstChild
              ? { node: firstChild, offset: innerOffset }
              : { node: element, offset: 0 };
          }
          remaining -= logicalLength;
          return null;
        }
        if (element.tagName === "BR") {
          if (remaining <= 1) {
            const parent = element.parentNode;
            if (!parent) return { node: root, offset: root.childNodes.length };
            const index = Array.from(parent.childNodes).indexOf(element);
            return { node: parent, offset: Math.max(0, index) };
          }
          remaining -= 1;
          return null;
        }
        const children = Array.from(element.childNodes);
        for (const child of children) {
          const found = walk(child);
          if (found) return found;
        }
        if (element.tagName === "DIV" || element.tagName === "P") {
          if (remaining <= 1) return { node: element, offset: element.childNodes.length };
          remaining -= 1;
        }
        return null;
      };
      return walk(root) || { node: root, offset: root.childNodes.length };
    };

    const start = resolveBoundary(snapshot.start);
    const end = resolveBoundary(snapshot.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [getNodeTextLength]);

  const moveCaretInside = useCallback((element) => {
    if (!element) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const textNode = element.firstChild;
    if (!textNode) {
      element.appendChild(document.createTextNode(zeroWidth));
    }
    const target = element.firstChild;
    const len = target?.textContent?.length || 0;
    range.setStart(target, len);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const syncValueFromDom = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
      chips.forEach((chip) => {
        if (!chip.textContent || chip.textContent.length === 0) {
          chip.textContent = zeroWidth;
        }
      });
    }
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [onChange, serializeDomToValue]);

  const findChipBeforeCaret = useCallback((range) => {
    const root = rootRef.current;
    if (!root || !range) return null;
    const container = range.startContainer;
    const offset = range.startOffset;

    const isChip = (node) =>
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      node.hasAttribute &&
      node.hasAttribute("data-placeholder-chip");

    if (container === root) {
      const prev = root.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset > 0) return null;
      const prev = container.previousSibling;
      if (isChip(prev)) return prev;
      return null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const prev = container.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    return null;
  }, []);

  const insertPlaceholderAtCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus();
    deactivateAllChips();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      renderValueToDom(`${internalValueRef.current}{{}}`);
      internalValueRef.current = `${internalValueRef.current}{{}}`;
      onChange?.(internalValueRef.current);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
    }
    const placeholderChip = document.createElement("span");
    placeholderChip.setAttribute("data-placeholder-chip", "1");
    placeholderChip.style.background = "rgba(59,130,246,0.24)";
    placeholderChip.style.color = "#bfdbfe";
    placeholderChip.style.border = "1px solid rgba(96,165,250,0.65)";
    placeholderChip.style.borderRadius = "6px";
    placeholderChip.style.padding = "1px 6px";
    placeholderChip.style.display = "inline-block";
    placeholderChip.style.minWidth = "12px";
    placeholderChip.style.margin = "0 1px";
    placeholderChip.contentEditable = "false";
    placeholderChip.textContent = zeroWidth;

    const liveRange = selection.getRangeAt(0);
    liveRange.deleteContents();
    liveRange.insertNode(placeholderChip);
    const after = document.createRange();
    after.setStartAfter(placeholderChip);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [deactivateAllChips, onChange, renderValueToDom, serializeDomToValue]);

  const handleEditorKeyDown = useCallback((event) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

    if (root && range && selection && selection.isCollapsed) {
      const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
      const currentChip = startNode?.closest?.('[data-placeholder-chip="1"]');

      if ((event.key === "Backspace" || event.key === "Delete") && currentChip && root.contains(currentChip)) {
        const text = (currentChip.textContent || "").replaceAll(zeroWidth, "");
        if (text.length <= 1) {
          event.preventDefault();
          currentChip.textContent = zeroWidth;
          moveCaretInside(currentChip);
          syncValueFromDom();
          return;
        }
      }

      if (event.key === "Backspace" && !currentChip) {
        const chipBeforeCaret = findChipBeforeCaret(range);
        if (chipBeforeCaret && root.contains(chipBeforeCaret)) {
          event.preventDefault();
          const parent = chipBeforeCaret.parentNode;
          if (parent) {
            const index = Array.from(parent.childNodes).indexOf(chipBeforeCaret);
            chipBeforeCaret.remove();
            const nextRange = document.createRange();
            const safeOffset = Math.max(0, Math.min(index, parent.childNodes.length));
            nextRange.setStart(parent, safeOffset);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
            syncValueFromDom();
          }
          return;
        }
      }
    }

    onKeyDown?.(event);
  }, [findChipBeforeCaret, moveCaretInside, onKeyDown, syncValueFromDom, zeroWidth]);

  useEffect(() => {
    if (selfUpdateRef.current) {
      selfUpdateRef.current = false;
      return;
    }
    const normalized = typeof value === "string" ? value : "";
    if (normalized === internalValueRef.current) return;
    const snapshot = captureSelectionSnapshot();
    internalValueRef.current = normalized;
    renderValueToDom(normalized);
    if (snapshot) {
      requestAnimationFrame(() => {
        restoreSelectionSnapshot(snapshot);
      });
    }
  }, [captureSelectionSnapshot, renderValueToDom, restoreSelectionSnapshot, value]);

  useEffect(() => {
    renderValueToDom(internalValueRef.current);
  }, [renderValueToDom]);

  const handleClick = useCallback((event) => {
    const root = rootRef.current;
    if (!root) return;
    const selection = window.getSelection();
    if (
      selection &&
      selection.rangeCount &&
      !selection.isCollapsed
    ) {
      const range = selection.getRangeAt(0);
      if (root.contains(range.startContainer) && root.contains(range.endContainer)) {
        return;
      }
    }
    const target = event.target instanceof Element ? event.target : null;
    const chip = target?.closest?.('[data-placeholder-chip="1"]');
    if (chip && root.contains(chip)) {
      deactivateAllChips();
      setChipEditingState(chip, true);
      activeChipRef.current = chip;
      moveCaretInside(chip);
      return;
    }
    deactivateAllChips();
  }, [deactivateAllChips, moveCaretInside, setChipEditingState]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      insertPlaceholder: insertPlaceholderAtCaret,
    };
    return () => {
      if (editorRef.current?.insertPlaceholder === insertPlaceholderAtCaret) {
        editorRef.current = null;
      }
    };
  }, [editorRef, insertPlaceholderAtCaret]);

  const handleInput = useCallback(() => {
    syncValueFromDom();
  }, [syncValueFromDom]);

  const handlePaste = useCallback((event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!rootRef.current?.contains(range.startContainer)) return;
    range.deleteContents();
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const fragment = document.createDocumentFragment();
    lines.forEach((line, index) => {
      if (index > 0) fragment.appendChild(document.createElement("br"));
      if (line) {
        fragment.appendChild(document.createTextNode(line));
      }
    });
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    const nextRange = document.createRange();
    if (lastNode) {
      if (lastNode.nodeType === Node.TEXT_NODE) {
        nextRange.setStart(lastNode, lastNode.textContent?.length || 0);
      } else {
        nextRange.setStartAfter(lastNode);
      }
    } else {
      nextRange.setStart(range.endContainer, range.endOffset);
    }
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    syncValueFromDom();
  }, [syncValueFromDom]);

  const fixedHeight = Math.max(PROMPT_EDITOR_MIN_HEIGHT, rows * 24);

  return (
    <div
      ref={rootRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onPaste={handlePaste}
      onKeyDown={handleEditorKeyDown}
      onClick={handleClick}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!nextFocus || !(nextFocus instanceof Node) || !rootRef.current?.contains(nextFocus)) {
          deactivateAllChips();
        }
      }}
      onFocus={onFocus}
      data-placeholder={placeholder}
      style={{ ...S.tokenEditor, height: fixedHeight, maxHeight: fixedHeight, overflowY: "auto" }}
    />
  );
}

function SettingsModal({ show, onClose, proxyUrl, setProxyUrl, uiLanguage, setUiLanguage }) {
  const { t } = useI18n();
  const [showWorkerCode, setShowWorkerCode] = useState(false);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>⚙ {t("settings.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("settings.proxyLabel")}</label>
        <input style={S.proxyInput} value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="https://your-worker.workers.dev" />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("settings.language")}</label>
        <select style={S.proxyInput} value={uiLanguage} onChange={(event) => setUiLanguage(normalizeUiLanguage(event.target.value))}>
          <option value="en">{t("settings.languageEnglish")}</option>
          <option value="zh">{t("settings.languageChinese")}</option>
        </select>
        <p style={S.hint}>
          {uiLanguage === "zh" ? (
            <>
              请先部署下面的 Worker。使用 DeerAPI 时可配置 <code style={{ color: "#a78bfa" }}>DEERAPI_KEY</code>，使用百炼时可配置 <code style={{ color: "#a78bfa" }}>DASHSCOPE_API_KEY</code>；如果你已在 API 面板里保存密钥，则会优先使用面板里的值。
            </>
          ) : (
            <>
              Deploy the Worker below. Use <code style={{ color: "#a78bfa" }}>DEERAPI_KEY</code> for DeerAPI or <code style={{ color: "#a78bfa" }}>DASHSCOPE_API_KEY</code> for Bailian. If you save a key in the API panel, that value takes precedence.
            </>
          )}
        </p>
        <button style={{ ...S.toggleCodeBtn, marginTop: 16 }} onClick={() => setShowWorkerCode(!showWorkerCode)}>
          {showWorkerCode ? t("settings.hideWorkerCode") : t("settings.showWorkerCode")}
        </button>
        {showWorkerCode && <pre style={S.codeBlock}>{CF_WORKER_CODE}</pre>}
      </div>
    </div>
  );
}

function ApiKeyModal({
  show,
  onClose,
  apiKeys,
  draftApiKeys,
  setDraftApiKeys,
  onSave,
  saveStateText,
}) {
  const { uiLanguage, t } = useI18n();
  if (!show) return null;
  const normalizedCurrentKeys = normalizeApiKeys(apiKeys);
  const normalizedDraftKeys = normalizeApiKeys(draftApiKeys);
  const isDirty =
    normalizedDraftKeys.deerapi !== normalizedCurrentKeys.deerapi ||
    normalizedDraftKeys.bailian !== normalizedCurrentKeys.bailian;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>🔑 {t("api.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("api.deerapiLabel")}</label>
        <input
          style={S.proxyInput}
          value={normalizedDraftKeys.deerapi}
          onChange={(e) => setDraftApiKeys((prev) => ({ ...normalizeApiKeys(prev), deerapi: e.target.value }))}
          placeholder="sk-..."
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("api.bailianLabel")}</label>
        <input
          style={S.proxyInput}
          value={normalizedDraftKeys.bailian}
          onChange={(e) => setDraftApiKeys((prev) => ({ ...normalizeApiKeys(prev), bailian: e.target.value }))}
          placeholder="sk-..."
        />
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty ? 1 : 0.5, cursor: isDirty ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty}
          >
            {t("common.save")}
          </button>
        </div>
        <p style={S.hint}>
          {uiLanguage === "zh"
            ? "保存后会按模型自动使用对应平台。留空的输入框会回退到 Worker 环境变量：DeerAPI 走 DEERAPI_KEY，百炼走 DASHSCOPE_API_KEY。"
            : "After saving, each model automatically uses its matching provider. Empty fields fall back to Worker env vars: DEERAPI_KEY for DeerAPI and DASHSCOPE_API_KEY for Bailian."}
        </p>
      </div>
    </div>
  );
}

function GptAssistModal({
  show,
  onClose,
  prompt,
  draftPrompt,
  setDraftPrompt,
  sendPromptText,
  draftSendPromptText,
  setDraftSendPromptText,
  sendPromptImage,
  draftSendPromptImage,
  setDraftSendPromptImage,
  styleThemePrompt,
  draftStyleThemePrompt,
  setDraftStyleThemePrompt,
  onSave,
  saveStateText,
  canSave,
}) {
  const { uiLanguage, t } = useI18n();
  if (!show) return null;
  const isDirty =
    normalizeGptAssistPrompt(draftPrompt) !== normalizeGptAssistPrompt(prompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemePrompt) !== normalizeStyleThemeAssistPrompt(styleThemePrompt) ||
    normalizeGptAssistFlag(draftSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) !== normalizeGptAssistFlag(sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) ||
    normalizeGptAssistFlag(draftSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE) !== normalizeGptAssistFlag(sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>👤 {t("gpt.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("gpt.rewriteLabel")}</label>
        <textarea
          style={S.textarea}
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
          placeholder={uiLanguage === "zh" ? "告诉 GPT 如何改写 {{ }} 内文字..." : "Tell GPT how to rewrite text inside {{ }}..."}
          rows={6}
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("gpt.themeLabel")}</label>
        <textarea
          style={S.textarea}
          value={draftStyleThemePrompt}
          onChange={(event) => setDraftStyleThemePrompt(event.target.value)}
          placeholder={uiLanguage === "zh" ? "告诉 GPT 如何联想 12 个主题元素..." : "Tell GPT how to expand one seed into 12 related themes..."}
          rows={5}
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("gpt.contextLabel")}</label>
        <div style={S.settingToggleList}>
          <div style={S.settingToggleRow}>
            <div style={S.settingToggleTextWrap}>
              <div style={S.settingToggleTitle}>{t("gpt.sendPromptTextLabel")}</div>
              <div style={S.settingToggleHint}>{t("gpt.sendPromptTextHint")}</div>
            </div>
            <button
              type="button"
              style={{ ...S.settingToggleBtn, ...(draftSendPromptText ? S.settingToggleBtnActive : null) }}
              onClick={() => setDraftSendPromptText((prev) => !prev)}
            >
              {draftSendPromptText ? t("common.on") : t("common.off")}
            </button>
          </div>
          <div style={S.settingToggleRow}>
            <div style={S.settingToggleTextWrap}>
              <div style={S.settingToggleTitle}>{t("gpt.sendPromptImageLabel")}</div>
              <div style={S.settingToggleHint}>{t("gpt.sendPromptImageHint")}</div>
            </div>
            <button
              type="button"
              style={{ ...S.settingToggleBtn, ...(draftSendPromptImage ? S.settingToggleBtnActive : null) }}
              onClick={() => setDraftSendPromptImage((prev) => !prev)}
            >
              {draftSendPromptImage ? t("common.on") : t("common.off")}
            </button>
          </div>
        </div>
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty && canSave ? 1 : 0.5, cursor: isDirty && canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty || !canSave}
          >
            {t("common.save")}
          </button>
        </div>
        <p style={S.hint}>
          {uiLanguage === "zh"
            ? "两套提示词都会存到历史文件夹（与模板相同），不会保存输入图。"
            : "Both prompts are stored in the selected history folder, while input images are not saved."}
        </p>
      </div>
    </div>
  );
}

function TemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const { t } = useI18n();
  const bodyEditorRef = useRef(null);
  const backupEditorRef = useRef(null);
  const memoEditorRef = useRef(null);

  const insertPlaceholderInTemplate = useCallback((field) => {
    if (field === "backup") {
      backupEditorRef.current?.insertPlaceholder?.();
      return;
    }
    if (field === "memo") {
      memoEditorRef.current?.insertPlaceholder?.();
      return;
    }
    bodyEditorRef.current?.insertPlaceholder?.();
  }, []);

  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("template.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("common.title")}</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t("template.titlePlaceholder")}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.body")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("body")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder={t("template.bodyPlaceholder")}
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.backup")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("backup")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.backup}
          onChange={(next) => setDraft((prev) => ({ ...prev, backup: next }))}
          editorRef={backupEditorRef}
          placeholder={t("template.backupPlaceholder")}
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.memo")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("memo")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.memo}
          onChange={(next) => setDraft((prev) => ({ ...prev, memo: next }))}
          editorRef={memoEditorRef}
          placeholder={t("template.memoPlaceholder")}
          rows={4}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ ...S.apiSaveBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!canSave}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StyleTemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const { t } = useI18n();
  const bodyEditorRef = useRef(null);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("template.styleTitle")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("common.title")}</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t("template.styleTitlePlaceholder")}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.body")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => bodyEditorRef.current?.insertPlaceholder?.()} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder={t("template.styleBodyPlaceholder")}
          rows={5}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ ...S.apiSaveBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!canSave}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputImagesModal({ show, onClose, title, images, maxCount, onUploadFiles, onRemoveAt }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  if (!show) return null;
  const safeImages = Array.isArray(images)
    ? images.filter((item) => typeof item === "string" && item).slice(0, Math.max(1, Number(maxCount) || 1))
    : [];
  const remainingCount = Math.max(0, (Math.max(1, Number(maxCount) || 1) - safeImages.length));

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.settingsModal, ...S.inputImagesModal }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{title || t("images.defaultTitle")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.modalInputImagesHint}>{t("images.modalHint")}</div>
        <div style={S.modalInputImagesGrid}>
          <button
            type="button"
            style={{ ...S.modalInputImageEmpty, ...(remainingCount <= 0 ? S.modalInputImageEmptyDisabled : null) }}
            onClick={() => fileInputRef.current?.click()}
            disabled={remainingCount <= 0}
          >
            <span style={S.modalInputImageUploadPlus}>+</span>
            <span style={S.modalInputImageUploadText}>{t("common.upload")}</span>
          </button>
          {safeImages.map((image, index) => (
            <div key={`modal-image-${index}`} style={S.modalInputImageCell}>
              <img src={image} alt={`Input ${index + 1}`} style={S.modalInputImageThumb} />
              <button type="button" style={S.modalInputImageRemoveBtn} onClick={() => onRemoveAt(index)}>✕</button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={async (event) => {
            const files = Array.from(event.target.files || []).slice(0, remainingCount);
            if (files.length) await onUploadFiles(files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function PromptImageEditorModal({ show, onClose, images, initialIndex = 0, onConfirm }) {
  const { t } = useI18n();
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasMetricsRef = useRef(null);
  const [draftImages, setDraftImages] = useState([]);
  const [undoStacks, setUndoStacks] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState("crop");
  const [strokeColor, setStrokeColor] = useState(INPUT_IMAGE_EDITOR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 720, height: 520 });
  const [currentImageInfo, setCurrentImageInfo] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [pendingCrop, setPendingCrop] = useState(null);

  useEffect(() => {
    if (!show) return;
    const safeImages = Array.isArray(images)
      ? images.filter((item) => typeof item === "string" && item).slice(0, MAX_INPUT_IMAGES_PER_BATCH)
      : [];
    setDraftImages(safeImages);
    setUndoStacks(safeImages.map(() => []));
    setActiveIndex(Math.max(0, Math.min(safeImages.length - 1, Number(initialIndex) || 0)));
    setTool("crop");
    setStrokeColor(INPUT_IMAGE_EDITOR_COLORS[0]);
    setBusy(false);
    setInteraction(null);
    setPendingCrop(null);
  }, [show, images, initialIndex]);

  const currentImage = draftImages[activeIndex] || "";
  const currentUndoCount = Array.isArray(undoStacks[activeIndex]) ? undoStacks[activeIndex].length : 0;
  const toolOptions = useMemo(() => ([
    { id: "crop", label: t("imageEditor.toolCrop") },
    { id: "rect", label: t("imageEditor.toolRect") },
    { id: "line", label: t("imageEditor.toolLine") },
    { id: "arrow", label: t("imageEditor.toolArrow") },
  ]), [t]);

  useEffect(() => {
    if (!show || !currentImage) {
      setCurrentImageInfo(null);
      return undefined;
    }
    let cancelled = false;
    loadImageElement(currentImage)
      .then((image) => {
        if (cancelled) return;
        setCurrentImageInfo({
          image,
          width: Math.max(1, image.naturalWidth || image.width || 1),
          height: Math.max(1, image.naturalHeight || image.height || 1),
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentImageInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [show, currentImage]);

  useEffect(() => {
    if (!show) return undefined;
    const updateViewportSize = () => {
      const node = viewportRef.current;
      if (!node) return;
      setViewportSize({
        width: Math.max(320, node.clientWidth || 320),
        height: Math.max(320, node.clientHeight || 320),
      });
    };

    updateViewportSize();
    let observer = null;
    if (typeof ResizeObserver !== "undefined" && viewportRef.current) {
      observer = new ResizeObserver(updateViewportSize);
      observer.observe(viewportRef.current);
    }
    window.addEventListener("resize", updateViewportSize);
    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [show]);

  useEffect(() => {
    setInteraction(null);
    setPendingCrop(null);
  }, [activeIndex, tool]);

  const getPointerData = useCallback((event) => {
    const canvas = canvasRef.current;
    const metrics = canvasMetricsRef.current;
    if (!canvas || !metrics) return null;
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const inside =
      rawX >= metrics.offsetX &&
      rawX <= metrics.offsetX + metrics.drawWidth &&
      rawY >= metrics.offsetY &&
      rawY <= metrics.offsetY + metrics.drawHeight;
    const clampedX = Math.max(metrics.offsetX, Math.min(metrics.offsetX + metrics.drawWidth, rawX));
    const clampedY = Math.max(metrics.offsetY, Math.min(metrics.offsetY + metrics.drawHeight, rawY));
    return {
      inside,
      image: {
        x: ((clampedX - metrics.offsetX) / metrics.drawWidth) * metrics.imageWidth,
        y: ((clampedY - metrics.offsetY) / metrics.drawHeight) * metrics.imageHeight,
      },
    };
  }, []);

  const commitCurrentImageChange = useCallback(async (resolver) => {
    const source = draftImages[activeIndex];
    if (busy || !source) return;
    setBusy(true);
    try {
      const nextImage = await resolver(source);
      if (typeof nextImage !== "string" || !nextImage.startsWith("data:image/") || nextImage === source) return;
      setDraftImages((prev) => {
        const next = [...prev];
        next[activeIndex] = nextImage;
        return next;
      });
      setUndoStacks((prev) => {
        const next = prev.map((stack) => (Array.isArray(stack) ? [...stack] : []));
        next[activeIndex] = [...(next[activeIndex] || []), source];
        return next;
      });
    } catch {
      // Ignore editor operation failures and keep the current draft intact.
    } finally {
      setBusy(false);
      setInteraction(null);
      setPendingCrop(null);
    }
  }, [activeIndex, busy, draftImages]);

  const handleUndo = useCallback(() => {
    if (busy || !currentUndoCount) return;
    setDraftImages((prev) => {
      const next = [...prev];
      const previousImage = undoStacks[activeIndex]?.[undoStacks[activeIndex].length - 1];
      if (typeof previousImage === "string" && previousImage) {
        next[activeIndex] = previousImage;
      }
      return next;
    });
    setUndoStacks((prev) => {
      const next = prev.map((stack) => (Array.isArray(stack) ? [...stack] : []));
      if (next[activeIndex]?.length) next[activeIndex].pop();
      return next;
    });
    setInteraction(null);
    setPendingCrop(null);
  }, [activeIndex, busy, currentUndoCount, undoStacks]);

  const applyPendingCrop = useCallback(async () => {
    if (!isEditorRectValid(pendingCrop, 8)) return;
    await commitCurrentImageChange((source) => cropInputImageDataUrl(source, pendingCrop));
  }, [commitCurrentImageChange, pendingCrop]);

  const handlePointerDown = useCallback((event) => {
    if (busy || !currentImageInfo || event.button !== 0) return;
    const point = getPointerData(event);
    if (!point?.inside) return;
    event.preventDefault();
    if (tool === "crop") setPendingCrop(null);
    setInteraction({
      start: point.image,
      end: point.image,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [busy, currentImageInfo, getPointerData, tool]);

  const handlePointerMove = useCallback((event) => {
    if (!interaction) return;
    const point = getPointerData(event);
    if (!point) return;
    setInteraction((prev) => (prev ? { ...prev, end: point.image } : prev));
  }, [getPointerData, interaction]);

  const handlePointerUp = useCallback(async (event) => {
    if (!interaction || !currentImageInfo) return;
    const point = getPointerData(event);
    const endPoint = point?.image || interaction.end;
    const nextRect = normalizeEditorRect(interaction.start, endPoint, currentImageInfo.width, currentImageInfo.height);
    setInteraction(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (tool === "crop") {
      setPendingCrop(isEditorRectValid(nextRect, 8) ? nextRect : null);
      return;
    }

    if (tool === "rect") {
      if (!isEditorRectValid(nextRect, 8)) return;
      await commitCurrentImageChange((source) =>
        applyInputImageEditorOperation(source, {
          type: "rect",
          rect: nextRect,
          color: strokeColor,
          strokeWidth: getInputImageEditorStrokeWidth(currentImageInfo.width, currentImageInfo.height),
        })
      );
      return;
    }

    const deltaX = (endPoint?.x ?? 0) - (interaction.start?.x ?? 0);
    const deltaY = (endPoint?.y ?? 0) - (interaction.start?.y ?? 0);
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 8) return;
    await commitCurrentImageChange((source) =>
      applyInputImageEditorOperation(source, {
        type: tool,
        start: interaction.start,
        end: endPoint,
        color: strokeColor,
        strokeWidth: getInputImageEditorStrokeWidth(currentImageInfo.width, currentImageInfo.height),
      })
    );
  }, [commitCurrentImageChange, currentImageInfo, getPointerData, interaction, strokeColor, tool]);

  useEffect(() => {
    if (!show) return undefined;
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, onClose, show]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const info = currentImageInfo;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(320, Math.round(viewportSize.width || 320));
    const height = Math.max(320, Math.round(viewportSize.height || 320));
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, width, height);

    if (!info) {
      canvasMetricsRef.current = null;
      ctx.fillStyle = "#71717a";
      ctx.font = '14px monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("imageEditor.noImage"), width / 2, height / 2);
      return;
    }

    const scale = Math.min(width / info.width, height / info.height);
    const drawWidth = Math.max(1, info.width * scale);
    const drawHeight = Math.max(1, info.height * scale);
    const offsetX = Math.round((width - drawWidth) / 2);
    const offsetY = Math.round((height - drawHeight) / 2);
    canvasMetricsRef.current = {
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
      imageWidth: info.width,
      imageHeight: info.height,
    };

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(offsetX - 1, offsetY - 1, drawWidth + 2, drawHeight + 2);
    ctx.drawImage(info.image, offsetX, offsetY, drawWidth, drawHeight);

    const toCanvasRect = (rect) => ({
      x: offsetX + (rect.x / info.width) * drawWidth,
      y: offsetY + (rect.y / info.height) * drawHeight,
      width: (rect.width / info.width) * drawWidth,
      height: (rect.height / info.height) * drawHeight,
    });
    const toCanvasPoint = (point) => ({
      x: offsetX + (point.x / info.width) * drawWidth,
      y: offsetY + (point.y / info.height) * drawHeight,
    });

    if (tool === "crop") {
      const cropRect = interaction
        ? normalizeEditorRect(interaction.start, interaction.end, info.width, info.height)
        : pendingCrop;
      if (isEditorRectValid(cropRect, 2)) {
        const previewRect = toCanvasRect(cropRect);
        ctx.save();
        ctx.fillStyle = "rgba(2,6,23,0.48)";
        ctx.fillRect(offsetX, offsetY, drawWidth, drawHeight);
        ctx.drawImage(
          info.image,
          cropRect.x,
          cropRect.y,
          cropRect.width,
          cropRect.height,
          previewRect.x,
          previewRect.y,
          previewRect.width,
          previewRect.height
        );
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(previewRect.x, previewRect.y, previewRect.width, previewRect.height);
        ctx.restore();
      }
      return;
    }

    if (!interaction) return;
    const previewStrokeWidth = Math.max(2, Math.round(Math.max(drawWidth, drawHeight) / 260));
    if (tool === "rect") {
      const rect = normalizeEditorRect(interaction.start, interaction.end, info.width, info.height);
      if (!isEditorRectValid(rect, 2)) return;
      drawInputImageEditorShape(ctx, {
        type: "rect",
        rect: toCanvasRect(rect),
        color: strokeColor,
        strokeWidth: previewStrokeWidth,
      });
      return;
    }

    drawInputImageEditorShape(ctx, {
      type: tool,
      start: toCanvasPoint(interaction.start),
      end: toCanvasPoint(interaction.end),
      color: strokeColor,
      strokeWidth: previewStrokeWidth,
    });
  }, [currentImageInfo, interaction, pendingCrop, strokeColor, t, tool, viewportSize.height, viewportSize.width]);

  if (!show) return null;

  const currentPage = draftImages.length ? activeIndex + 1 : 0;
  const activeHint = pendingCrop ? t("imageEditor.cropReady") : tool === "crop" ? t("imageEditor.cropHint") : t("imageEditor.drawHint");

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.inputImageEditorModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.inputImageEditorHeader}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("imageEditor.title")}</h2>
            <div style={S.inputImageEditorHeaderHint}>{t("imageEditor.hint")}</div>
          </div>
          <button onClick={onClose} style={S.closeBtn} disabled={busy}>✕</button>
        </div>

        <div style={S.inputImageEditorLayout}>
          <aside style={S.inputImageEditorSidebar}>
            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.tools")}</div>
              <div style={S.inputImageEditorToolGrid}>
                {toolOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    style={{ ...S.inputImageEditorToolBtn, ...(tool === option.id ? S.inputImageEditorToolBtnActive : null) }}
                    onClick={() => setTool(option.id)}
                    disabled={busy}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.colors")}</div>
              <div style={S.inputImageEditorColorRow}>
                {INPUT_IMAGE_EDITOR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    style={{
                      ...S.inputImageEditorColorBtn,
                      background: color,
                      ...(strokeColor === color ? S.inputImageEditorColorBtnActive : null),
                    }}
                    onClick={() => setStrokeColor(color)}
                    disabled={busy}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.page", { current: currentPage, total: draftImages.length })}</div>
              <div style={S.inputImageEditorNavRow}>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorMiniBtn, ...(activeIndex <= 0 ? S.inputImageEditorMiniBtnDisabled : null) }}
                  onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                  disabled={busy || activeIndex <= 0}
                >
                  {t("imageEditor.prev")}
                </button>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorMiniBtn, ...(activeIndex >= draftImages.length - 1 ? S.inputImageEditorMiniBtnDisabled : null) }}
                  onClick={() => setActiveIndex((prev) => Math.min(draftImages.length - 1, prev + 1))}
                  disabled={busy || activeIndex >= draftImages.length - 1}
                >
                  {t("imageEditor.next")}
                </button>
              </div>
              <div style={S.inputImageEditorStatus}>{activeHint}</div>
              {draftImages.length > 1 && <div style={S.inputImageEditorSubHint}>{t("imageEditor.multiHint")}</div>}
            </div>

            <div style={{ ...S.inputImageEditorBlock, marginTop: "auto" }}>
              <div style={S.inputImageEditorActionGrid}>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorActionBtn, ...(currentUndoCount ? null : S.inputImageEditorActionBtnDisabled) }}
                  onClick={handleUndo}
                  disabled={busy || !currentUndoCount}
                >
                  {t("imageEditor.undo")}
                </button>
                {tool === "crop" ? (
                  <>
                    <button
                      type="button"
                      style={{ ...S.inputImageEditorActionBtn, ...(isEditorRectValid(pendingCrop, 8) ? null : S.inputImageEditorActionBtnDisabled) }}
                      onClick={applyPendingCrop}
                      disabled={busy || !isEditorRectValid(pendingCrop, 8)}
                    >
                      {t("imageEditor.applyCrop")}
                    </button>
                    <button
                      type="button"
                      style={{ ...S.inputImageEditorGhostBtn, ...(pendingCrop ? null : S.inputImageEditorActionBtnDisabled) }}
                      onClick={() => setPendingCrop(null)}
                      disabled={busy || !pendingCrop}
                    >
                      {t("imageEditor.clearCrop")}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  style={S.inputImageEditorGhostBtn}
                  onClick={onClose}
                  disabled={busy}
                >
                  {t("imageEditor.cancel")}
                </button>
                <button
                  type="button"
                  style={S.inputImageEditorConfirmBtn}
                  onClick={() => onConfirm?.(draftImages)}
                  disabled={busy || !draftImages.length}
                >
                  {busy ? t("common.processing") : t("imageEditor.confirm")}
                </button>
              </div>
            </div>
          </aside>

          <div style={S.inputImageEditorMain}>
            <div ref={viewportRef} style={S.inputImageEditorViewport}>
              <canvas
                ref={canvasRef}
                style={{
                  ...S.inputImageEditorCanvas,
                  cursor: busy ? "wait" : "crosshair",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => setInteraction(null)}
              />
            </div>

            <div style={S.inputImageEditorThumbStrip}>
              {draftImages.map((image, index) => (
                <button
                  key={`prompt-editor-thumb-${index}`}
                  type="button"
                  style={{
                    ...S.inputImageEditorThumbBtn,
                    ...(activeIndex === index ? S.inputImageEditorThumbBtnActive : null),
                  }}
                  onClick={() => setActiveIndex(index)}
                  disabled={busy}
                >
                  <img src={image} alt={`Prompt ${index + 1}`} style={S.inputImageEditorThumbImg} />
                  <span style={S.inputImageEditorThumbIndex}>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectionLimitModal({ show, onClose, limit }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.selectionLimitModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.selectionLimitTitle}>{t("selectionLimit.title")}</div>
        <div style={S.selectionLimitText}>{t("selectionLimit.text", { limit })}</div>
      </div>
    </div>
  );
}

function ImageActionBar({ onSave, onRetry, onAppend, compact = false, busy = false, allowSave = true }) {
  const { t } = useI18n();
  const buttonStyle = compact ? S.imageActionBtnCompact : S.imageActionBtn;
  const iconStyle = compact ? S.imageActionIconCompact : S.imageActionIcon;
  const plusStyle = compact ? S.imageActionPlusCompact : S.imageActionPlus;
  return (
    <div style={{ ...S.imageActionBar, ...(compact ? S.imageActionBarCompact : null) }}>
      <button
        type="button"
        style={{ ...buttonStyle, ...(allowSave ? null : S.imageActionBtnDisabled) }}
        onClick={onSave}
        disabled={!allowSave}
        title={t("action.save")}
      >
        <span style={iconStyle}>↓</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onRetry}
        disabled={busy || typeof onRetry !== "function"}
        title={t("action.retry")}
      >
        <span style={iconStyle}>↻</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onAppend}
        disabled={busy || typeof onAppend !== "function"}
        title={t("action.addOne")}
      >
        <span style={plusStyle}>+1</span>
      </button>
    </div>
  );
}

function AtlasThumbnailModal({ show, onClose, items, onReorder, onGenerate, thumbnail, busy, onPreview }) {
  const { uiLanguage, t } = useI18n();
  const [dragKey, setDragKey] = useState(null);

  useEffect(() => {
    if (!show) setDragKey(null);
  }, [show]);

  if (!show) return null;

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.settingsModal, maxWidth: 880 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("atlas.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.atlasModalHint}>{t("atlas.hint")}</div>
        {items.length ? (
          <div style={S.atlasModalGrid}>
            {items.map((item, index) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDragKey(item.key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragKey || dragKey === item.key) return;
                  onReorder?.(dragKey, item.key);
                  setDragKey(null);
                }}
                onDragEnd={() => setDragKey(null)}
                style={{
                  ...S.atlasModalCard,
                  ...(dragKey === item.key ? S.atlasModalCardDragging : null),
                }}
              >
                <div style={S.atlasModalCardOrder}>{index + 1}</div>
                <img src={item.image} alt={item.theme || item.modelName || (uiLanguage === "zh" ? `已选图片 ${index + 1}` : `Selected ${index + 1}`)} style={S.atlasModalCardThumb} />
                <div style={S.atlasModalCardMeta}>
                  <div style={S.atlasModalCardTitle}>{item.theme || item.modelName || (uiLanguage === "zh" ? `图片 ${index + 1}` : `Image ${index + 1}`)}</div>
                  <div style={S.atlasModalCardSub}>{item.modelName || item.modelId || "-"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.turnStyleImageEmpty}>{t("atlas.empty")}</div>
        )}
        <div style={{ ...S.modalInputImagesActions, justifyContent: "space-between", marginTop: 16 }}>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: thumbnail ? 1 : 0.5, cursor: thumbnail ? "pointer" : "not-allowed" }}
            onClick={() => thumbnail && onPreview?.(thumbnail)}
            disabled={!thumbnail}
          >
            {uiLanguage === "zh" ? "预览" : "Preview"}
          </button>
          <button
            type="button"
            style={{ ...S.apiSaveBtn, opacity: items.length ? 1 : 0.5, cursor: items.length ? "pointer" : "not-allowed" }}
            onClick={onGenerate}
            disabled={!items.length || busy}
          >
            {busy ? t("common.processing") : thumbnail ? t("atlas.refresh") : t("atlas.generate")}
          </button>
        </div>
        {thumbnail && (
          <div style={S.atlasModalPreview}>
            <img src={thumbnail} alt={uiLanguage === "zh" ? "图集缩略图" : "Atlas thumbnail"} style={S.atlasModalPreviewImg} />
          </div>
        )}
      </div>
    </div>
  );
}

function SpriteSplitModal({
  show,
  onClose,
  sourceImage,
  processImage,
  splitItems,
  splitOnRemoved = false,
  selectedItemIds,
  enhanceEnabled = true,
  renderMode = DEFAULT_SPLIT_RENDER_MODE,
  shapeMode = DEFAULT_SPLIT_SHAPE_MODE,
  canUndo = false,
  busy,
  enhancing,
  exporting,
  statusText,
  statusTone = "info",
  onToggleSplitSource,
  onResplit,
  onSetRenderMode,
  onSetShapeMode,
  onSetEnhanceEnabled,
  onToggleSelectItem,
  onMergeSelectedItems,
  onDeleteItem,
  onUndoDelete,
  onExport,
  onPreview,
  onUploadImageDataUrl,
}) {
  const { uiLanguage, t } = useI18n();
  const uploadInputRef = useRef(null);
  const [inlineZoomSource, setInlineZoomSource] = useState(false);
  const [inlineZoomRemoved, setInlineZoomRemoved] = useState(false);

  useEffect(() => {
    if (!show) return undefined;
    const onKeyDown = (event) => {
      const key = String(event.key || "").toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        onUndoDelete?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, onUndoDelete]);

  useEffect(() => {
    if (!show) {
      setInlineZoomSource(false);
      setInlineZoomRemoved(false);
      return;
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;
    if (!sourceImage) setInlineZoomSource(false);
    if (!processImage) setInlineZoomRemoved(false);
  }, [show, sourceImage, processImage]);

  if (!show) return null;
  const items = Array.isArray(splitItems) ? splitItems : [];
  const selectedSet = selectedItemIds instanceof Set
    ? selectedItemIds
    : new Set(Array.isArray(selectedItemIds) ? selectedItemIds : []);
  const selectedCount = items.reduce((count, item) => (selectedSet.has(item.id) ? count + 1 : count), 0);
  const hasItems = items.length > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.splitModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.splitModalHeader}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("split.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.splitMainGrid}>
          <section style={S.splitLeftCol}>
            <div style={S.splitPane}>
              <div style={S.splitPaneTitle}>{t("split.original")}</div>
              <div style={S.splitOriginalWrap}>
                {sourceImage ? (
                  inlineZoomSource ? (
                    <InlineZoomViewer
                      src={sourceImage}
                      onCollapse={() => setInlineZoomSource(false)}
                      containerStyle={S.splitPaneInlineZoomViewer}
                      collapseButtonStyle={S.splitPaneInlineZoomCollapseBtn}
                    />
                  ) : (
                    <div style={S.splitImageWrap}>
                      <img
                        src={sourceImage}
                        alt={t("split.original")}
                        style={S.splitOriginalImg}
                        onClick={() => setInlineZoomSource(true)}
                      />
                      <button
                        type="button"
                        style={{
                          ...S.splitImageZoomBtn,
                          ...(inlineZoomSource ? S.splitImageZoomBtnActive : null),
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setInlineZoomSource((prev) => !prev);
                        }}
                        title={t("viewer.inlineViewer")}
                      >
                        🔍
                      </button>
                    </div>
                  )
                ) : (
                  <div style={S.turnStyleImageEmpty}>{busy ? t("split.detecting") : "-"}</div>
                )}
                <button
                  type="button"
                  style={{
                    ...S.splitImageUploadBtn,
                    opacity: busy || exporting || enhancing ? 0.55 : 1,
                    cursor: busy || exporting || enhancing ? "not-allowed" : "pointer",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    uploadInputRef.current?.click();
                  }}
                  disabled={busy || exporting || enhancing}
                >
                  {t("split.upload")}
                </button>
              </div>
            </div>
            <div style={S.splitMidActions}>
              <div style={S.splitMidActionRow}>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(splitOnRemoved ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => onToggleSplitSource?.(true)}
                  >
                    {t("split.sourceRemoved")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(!splitOnRemoved ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => onToggleSplitSource?.(false)}
                  >
                    {t("split.sourceOriginal")}
                  </button>
                </div>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(renderMode === "painted" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetRenderMode?.("painted");
                    }}
                  >
                    {t("split.renderPainted")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(renderMode === "direct" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetRenderMode?.("direct");
                    }}
                  >
                    {t("split.renderDirect")}
                  </button>
                </div>
              </div>
              <div style={S.splitMidActionRow}>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "edge" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("edge");
                    }}
                  >
                    {t("split.shapeEdge")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "polygon" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("polygon");
                    }}
                  >
                    {t("split.shapePolygon")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "rect" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("rect");
                    }}
                  >
                    {t("split.shapeRect")}
                  </button>
                </div>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(enhanceEnabled ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing || !hasItems}
                    onClick={() => {
                      onSetEnhanceEnabled?.(true);
                    }}
                  >
                    {t("split.qualityEnhanced")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(!enhanceEnabled ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing || !hasItems}
                    onClick={() => {
                      onSetEnhanceEnabled?.(false);
                    }}
                  >
                    {t("split.qualityOriginal")}
                  </button>
                </div>
              </div>
            </div>
            <div style={S.splitPane}>
              <div style={S.splitPaneTitle}>{t("split.process")}</div>
              <div style={S.splitOriginalWrap}>
                {processImage ? (
                  inlineZoomRemoved ? (
                    <InlineZoomViewer
                      src={processImage}
                      onCollapse={() => setInlineZoomRemoved(false)}
                      containerStyle={S.splitPaneInlineZoomViewer}
                      collapseButtonStyle={S.splitPaneInlineZoomCollapseBtn}
                    />
                  ) : (
                    <div style={S.splitImageWrap}>
                      <img
                        src={processImage}
                        alt={t("split.process")}
                        style={S.splitOriginalImg}
                        onClick={() => setInlineZoomRemoved(true)}
                      />
                      <button
                        type="button"
                        style={{
                          ...S.splitImageZoomBtn,
                          ...(inlineZoomRemoved ? S.splitImageZoomBtnActive : null),
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setInlineZoomRemoved((prev) => !prev);
                        }}
                        title={t("viewer.inlineViewer")}
                      >
                        🔍
                      </button>
                    </div>
                  )
                ) : (
                  <div style={S.turnStyleImageEmpty}>{busy ? t("split.detecting") : "-"}</div>
                )}
              </div>
            </div>
          </section>
          <section style={S.splitRightCol}>
            <div style={S.splitRightTop}>
              <div style={S.splitPaneTitle}>
                {t("split.results")}
                <span style={S.splitPaneCount}>{busy ? t("split.detecting") : t("split.count", { count: items.length })}</span>
              </div>
              <div style={S.splitTopActions}>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: sourceImage ? 1 : 0.5, cursor: sourceImage ? "pointer" : "not-allowed" }}
                  onClick={onResplit}
                  disabled={!sourceImage || busy || exporting || enhancing}
                >
                  {busy ? t("common.processing") : t("split.run")}
                </button>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: selectedCount >= 2 ? 1 : 0.5, cursor: selectedCount >= 2 ? "pointer" : "not-allowed" }}
                  onClick={onMergeSelectedItems}
                  disabled={selectedCount < 2 || busy || exporting || enhancing}
                >
                  {t("split.merge")}
                </button>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: canUndo ? 1 : 0.5, cursor: canUndo ? "pointer" : "not-allowed" }}
                  onClick={onUndoDelete}
                  disabled={!canUndo || busy || exporting || enhancing}
                >
                  {t("split.undo")}
                </button>
                <button
                  type="button"
                  style={{ ...S.apiSaveBtn, opacity: hasItems && !busy ? 1 : 0.5, cursor: hasItems && !busy ? "pointer" : "not-allowed" }}
                  onClick={onExport}
                  disabled={!hasItems || busy || exporting || enhancing}
                >
                  {exporting ? t("split.exporting") : t("split.export")}
                </button>
              </div>
            </div>
            <div style={S.splitRightBody}>
              {busy ? (
                <div style={S.turnStyleImageEmpty}>{t("split.detecting")}</div>
              ) : hasItems ? (
                <div style={S.splitGrid}>
                  {items.map((item, index) => (
                    <div key={item.id || `split-item-${index}`} style={S.splitItemCell}>
                      <button
                        type="button"
                        style={{
                          ...S.splitItemSelectBtn,
                          ...(selectedSet.has(item.id) ? S.splitItemSelectBtnActive : null),
                        }}
                        onClick={() => onToggleSelectItem?.(item.id)}
                        title={t("split.merge")}
                      >
                        {selectedSet.has(item.id) ? "✓" : "○"}
                      </button>
                      <button
                        type="button"
                        style={S.splitItemBtn}
                        onClick={() => onPreview?.(item.image)}
                        title={t("split.previewSplit", { index: index + 1 })}
                      >
                        <div style={S.splitItemOrder}>{index + 1}</div>
                        <img
                          src={item.image}
                          alt={`Split ${index + 1}`}
                          style={S.splitItemImg}
                        />
                      </button>
                      <button
                        type="button"
                        style={S.splitItemDeleteBtn}
                        onClick={() => onDeleteItem?.(item.id)}
                        title={t("split.delete")}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.turnStyleImageEmpty}>{t("split.noSubjects")}</div>
              )}
            </div>
          </section>
        </div>
        <div style={{ ...S.splitStatusText, ...(statusTone === "error" ? S.splitStatusTextError : null) }}>
          {statusText || t("split.undoHint")}
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = (event.target.files || [])[0];
            if (!file) {
              event.target.value = "";
              return;
            }
            const encoded = await fileToBase64(file);
            if (typeof encoded === "string" && encoded.startsWith("data:image/")) {
              await onUploadImageDataUrl?.(encoded, file);
            }
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function HelpRichText({ text, style }) {
  const source = typeof text === "string" ? text : "";
  const parts = source.split(/(`[^`]+`)/g).filter(Boolean);
  return (
    <p style={style}>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={`${part}-${index}`} style={S.helpInlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </p>
  );
}

function HelpParagraphs({ text, style }) {
  const lines = Array.isArray(text)
    ? text.filter((item) => typeof item === "string" && item.trim())
    : [typeof text === "string" ? text : ""].filter((item) => item.trim());
  return (
    <div style={S.helpParagraphGroup}>
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} style={S.helpParagraphItem}>
          <HelpRichText text={line} style={style} />
        </div>
      ))}
    </div>
  );
}

function HelpPage() {
  const { uiLanguage, t } = useI18n();
  const sections = uiLanguage === "zh"
    ? [
        {
          title: "开始使用",
          fullWidth: true,
          lines: [
            "这个工具本身没有内置账号登录页面。",
            "先去 DeerAPI 或百炼网页端创建并复制你的 API Key；回到本工具后点击 `API`，分别填入对应的密钥即可。",
            "如果你想保存本地历史和模板，再选择一个 `History Folder`；之后选择模式、勾选模型、填写提示词或上传图片，再点击 `开始任务` 即可开始。",
          ],
        },
        {
          title: "模式",
          lines: [
            "`单任务` 会把一个提示词发给多个已选模型。",
            "`提示词对比` 会用同一张输入图同时运行 A、B 两套提示词。",
            "`风格` 会用一个模型批量跑多个主题词，并可搭配风格参考图。",
          ],
        },
        {
          title: "图片操作",
          lines: [
            "每张图片下面都有三个操作：`下载` 下载当前图。",
            "`重试` 会替换当前这张图。",
            "`+1` 会保留原图并在同一任务里再追加一张新图。",
          ],
        },
        {
          title: "GPT 助手",
          lines: [
            "GPT 助手目前有两种用法。",
            "在 `单任务` 和 `提示词对比` 中，点击提示词输入框上方的人形按钮，它只会改写 `{{ }}` 内的内容，不会改动外部提示词。",
            "在 `风格` 中，使用主题联想输入框旁边的 `GPT 12`，把一个主题种子扩展成 12 个相关视觉元素。",
          ],
        },
        {
          title: "选图与图集",
          lines: [
            "选图功能在所有页面和模式之间共用。",
            "你最多可以同时保留 20 张选中图片，并统一清空或一起导出到同一个 atlas 文件夹。",
          ],
        },
        {
          title: "历史文件夹",
          lines: [
            "模板、API Key、GPT Prompt、atlas 导出和历史记录都会绑定到当前选中的历史文件夹。",
            "切换文件夹时，会直接替换当前历史，不会和旧内容混合。",
          ],
        },
        {
          title: "图片输入",
          lines: [
            "输入图支持一次多选上传。",
            "主输入框点击后会直接上传，`编辑` 会打开管理弹窗用于删除或新增图片。",
            "对于支持图像编辑的模型（如 Qwen 图像模型），上传输入图后会自动走图生或编辑；不上传则继续走文生图。",
            "在 `当前任务` 和 `历史记录` 中，点击输入图上的放大镜，可以在原位置展开大图。先点一下大图，再用滚轮缩放、拖拽平移，点击右上角缩小按钮即可恢复缩略图。",
            "在 `风格` 里，参考图使用独立的编辑弹窗。",
          ],
        },
        {
          title: "常见报错",
          lines: [
            "`Failed to fetch` 通常表示代理地址、网络，或者 API 端点不可达。",
            "`No images returned` 表示模型接收了请求，但没有返回可用图片，这时可以尝试 `重试` 或 `+1`。",
            "如果保存或导出按钮不能用，请先检查是否已经选择了 `History Folder`。",
          ],
        },
        {
          title: "缩略图",
          lines: [
            "在 `风格` 页面里，打开 `缩略图` 可以拖拽调整已选图片顺序。",
            "这个顺序会同时用于缩略图生成和 atlas 文件夹导出。",
          ],
        },
        {
          title: "自动切分弹窗",
          lines: [
            "历史记录里每张图右下角的圆形切分按钮会打开自动切分弹窗。",
            "会按照配置将资产表切分为独立资产。",
          ],
        },
      ]
    : [
        {
          title: "Getting Started",
          fullWidth: true,
          lines: [
            "There is no built-in account login inside this app.",
            "Create or copy your API key from DeerAPI or Bailian, open this app, click `API`, and fill the matching key fields.",
            "Then choose a `History Folder` if you want local history and templates, select a mode, pick models, fill prompt or images, and click `Enqueue Task`.",
          ],
        },
        {
          title: "Modes",
          lines: [
            "`Single` runs one prompt across selected models.",
            "`Prompt Compare` runs prompt A and B with the same input image.",
            "`Style` runs one model across many themes with optional reference images.",
          ],
        },
        {
          title: "Image Actions",
          lines: [
            "Each image has three actions: `Save` downloads it.",
            "`Retry` replaces that image with a new render.",
            "`+1` keeps the current images and adds one more render to the same task.",
          ],
        },
        {
          title: "GPT Assistant",
          lines: [
            "The GPT assistant currently has two uses.",
            "In `Single` and `Prompt Compare`, click the small human button above the prompt box to rewrite only the text inside `{{ }}` while keeping the outer prompt unchanged.",
            "In `Style`, use the `GPT 12` assistant next to the theme seed input to expand one seed idea into 12 related visual themes.",
          ],
        },
        {
          title: "Selections",
          lines: [
            "Selections work across all pages and modes.",
            "You can keep up to 20 images selected at once, clear them together, and export them into one atlas folder.",
          ],
        },
        {
          title: "History Folder",
          lines: [
            "Templates, API key, GPT prompt, atlas exports, and history are tied to the selected history folder.",
            "Switching folders replaces the current loaded history instead of merging it.",
          ],
        },
        {
          title: "Inputs",
          lines: [
            "Input images support multi-select uploads.",
            "The main input box uploads directly, while `Edit` opens a manager to add or remove images.",
            "For models that support image editing, such as Qwen image models, uploading an input image automatically switches the request to image-to-image or edit mode; without an upload it stays text-to-image.",
            "In `Current Dialog` and `History Dialogs`, click the magnifier on the input image to expand it in place. Click the enlarged image first, then use the wheel to zoom, drag to pan, and click the corner collapse button to restore the thumbnail.",
            "In `Style`, reference images open their own editor modal.",
          ],
        },
        {
          title: "Common Errors",
          lines: [
            "`Failed to fetch` usually means the proxy URL, network, or API endpoint is unreachable.",
            "`No images returned` means the model accepted the request but did not return usable images, so you can try `Retry` or `+1`.",
            "If saving or export buttons do not work, first check whether a `History Folder` has been selected.",
          ],
        },
        {
          title: "Thumbnail",
          lines: [
            "In `Style`, open `Thumbnail` to drag selected images into the order you want.",
            "That order is used for both the generated thumbnail and atlas export.",
          ],
        },
        {
          title: "Auto Split Modal",
          lines: [
            "In history, the round split button at the bottom-right of each image opens the auto split modal.",
            "It splits the asset sheet into separate assets based on the current configuration.",
          ],
        },
      ];

  return (
    <section style={S.helpWrap}>
      <div style={S.helpHero}>
        <h2 style={S.helpTitle}>{t("help.title")}</h2>
        <div style={S.helpTextBlock}>
          <HelpRichText style={uiLanguage === "zh" ? S.helpIntroCn : S.helpIntro} text={t("help.hero")} />
        </div>
      </div>
      <div style={S.helpGrid}>
        {sections.map((section) => (
          <article key={section.title} style={{ ...S.helpCard, ...(section.fullWidth ? S.helpCardFull : null) }}>
            <h3 style={S.helpCardTitle}>{section.title}</h3>
            <div style={S.helpTextBlock}>
              <HelpParagraphs text={section.lines} style={uiLanguage === "zh" ? S.helpCardTextCn : S.helpCardText} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelChip({ model, selected, onToggle, disabled, count, onCountChange, styleMode = false }) {
  const displayName = model.shortName || model.name;
  return (
    <div style={{ ...S.modelChipWrap, opacity: disabled && !selected ? 0.35 : 1 }}>
      <div style={S.modelRow}>
        <button
          onClick={() => onToggle(model.id)}
          disabled={disabled && !selected}
          style={{
            ...S.modelChip,
            background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
            borderColor: selected ? "#facc15" : "rgba(255,255,255,0.08)",
            cursor: disabled && !selected ? "not-allowed" : "pointer",
          }}
        >
          <span style={styleMode ? S.chipNameStyleMode : S.chipName} title={model.name}>{displayName}</span>
          {selected && <span style={S.check}>✓</span>}
        </button>
        <label style={S.countRow}>
          <span style={S.countLabel}>x</span>
          <select
            value={count}
            onChange={(e) => onCountChange(model.id, e.target.value)}
            style={S.countSelect}
            disabled={!selected}
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function normalizePreviewTokens(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizePreviewItem(value) {
  if (!value) {
    return {
      outputSrc: "",
      inputSrc: "",
      inputTokens: [],
      imageKey: "",
    };
  }
  if (typeof value === "string") {
    return {
      outputSrc: normalizeImageValue(value),
      inputSrc: "",
      inputTokens: [],
      imageKey: "",
    };
  }
  const outputSrc = normalizeImageValue(value?.outputSrc ?? value?.src ?? value?.image ?? "");
  const inputSrc = normalizeImageValue(value?.inputSrc ?? value?.referenceImage ?? "");
  return {
    outputSrc,
    inputSrc: inputSrc && inputSrc !== outputSrc ? inputSrc : "",
    inputTokens: normalizePreviewTokens(value?.inputTokens ?? value?.promptTokens),
    imageKey: typeof value?.imageKey === "string" ? value.imageKey : "",
  };
}

function normalizePreviewPayload(value) {
  const base = normalizePreviewItem(value);
  const galleryItems = Array.isArray(value?.galleryItems)
    ? value.galleryItems.map((item) => normalizePreviewItem(item)).filter((item) => item.outputSrc)
    : [];
  const fallbackIndex = base.imageKey ? galleryItems.findIndex((item) => item.imageKey === base.imageKey) : -1;
  const requestedIndex = Number(value?.currentIndex);
  const currentIndex = galleryItems.length
    ? Math.max(
        0,
        Math.min(
          galleryItems.length - 1,
          Number.isFinite(requestedIndex)
            ? requestedIndex
            : fallbackIndex >= 0
            ? fallbackIndex
            : 0
        )
      )
    : 0;
  return {
    ...base,
    galleryItems,
    currentIndex,
  };
}

function buildTurnPreviewItems(turn) {
  if (!turn) return [];
  const promptVariants = getTurnPromptVariants(turn);
  const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
  const selectedModelIds = Array.isArray(turn?.selectedModelIds) ? turn.selectedModelIds : [];
  const modelOrder = new Map(selectedModelIds.map((id, index) => [id, index]));
  const promptVariantOrder = new Map(promptVariants.map((variant, index) => [variant.key, index]));
  const previewInputImage =
    normalizeImageValue(turn?.referenceImage) ||
    normalizeImageValue(Array.isArray(turn?.styleReferenceImages) ? turn.styleReferenceImages[0] : "");
  const mode = getTurnMode(turn);

  if (mode === "style") {
    return (Array.isArray(turn?.results) ? turn.results : [])
      .slice()
      .sort((a, b) => {
        const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
        const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        const ak = promptVariantOrder.has(getResultPromptKey(a))
          ? promptVariantOrder.get(getResultPromptKey(a))
          : Number.MAX_SAFE_INTEGER;
        const bk = promptVariantOrder.has(getResultPromptKey(b))
          ? promptVariantOrder.get(getResultPromptKey(b))
          : Number.MAX_SAFE_INTEGER;
        if (ak !== bk) return ak - bk;
        return String(a.modelId).localeCompare(String(b.modelId));
      })
      .flatMap((result) => {
        const promptKey = getResultPromptKey(result);
        const promptText =
          typeof result?.promptText === "string"
            ? result.promptText
            : promptLookup.get(promptKey)?.prompt || turn?.prompt || "";
        const inputTokens = getFilledPlaceholderTokens(promptText);
        const images = Array.isArray(result?.images) ? result.images : [];
        return images.map((image, index) => ({
          imageKey: buildTurnImageKey(turn.id, result.modelId, promptKey, index + 1),
          outputSrc: normalizeImageValue(image),
          inputSrc: previewInputImage,
          inputTokens,
        }));
      })
      .filter((item) => item.outputSrc);
  }

  return promptVariants
    .flatMap((variant) =>
      (Array.isArray(turn?.results) ? turn.results : [])
        .filter((result) => getResultPromptKey(result) === variant.key)
        .slice()
        .sort((a, b) => {
          const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
          const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return String(a.modelId).localeCompare(String(b.modelId));
        })
        .flatMap((result) => {
          const promptText =
            typeof result?.promptText === "string"
              ? result.promptText
              : promptLookup.get(variant.key)?.prompt || turn?.prompt || "";
          const inputTokens = getFilledPlaceholderTokens(promptText);
          const images = Array.isArray(result?.images) ? result.images : [];
          return images.map((image, index) => ({
            imageKey: buildTurnImageKey(turn.id, result.modelId, variant.key, index + 1),
            outputSrc: normalizeImageValue(image),
            inputSrc: previewInputImage,
            inputTokens,
          }));
        })
    )
    .filter((item) => item.outputSrc);
}

function ImagePreviewModal({ src, onClose }) {
  const { t } = useI18n();
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const swipeRef = useRef({ active: false, startX: 0, startY: 0 });
  const preview = useMemo(() => normalizePreviewPayload(src), [src]);
  const [currentIndex, setCurrentIndex] = useState(preview.currentIndex || 0);
  const galleryItems = preview.galleryItems;
  const activePreview = galleryItems[currentIndex] || preview;
  const outputSrc = activePreview.outputSrc;
  const inputSrc = activePreview.inputSrc;
  const inputTokens = activePreview.inputTokens;
  const isComparePreview = !!inputSrc && !!outputSrc;
  const hasGallery = galleryItems.length > 1;
  const canGoPrev = hasGallery && currentIndex > 0;
  const canGoNext = hasGallery && currentIndex < galleryItems.length - 1;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [wheelActive, setWheelActive] = useState(false);

  const clampScale = useCallback((value) => Math.max(1, Math.min(8, Number(value) || 1)), []);

  const goPrev = useCallback(() => {
    if (galleryItems.length <= 1) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [galleryItems.length]);

  const goNext = useCallback(() => {
    if (galleryItems.length <= 1) return;
    setCurrentIndex((prev) => Math.min(galleryItems.length - 1, prev + 1));
  }, [galleryItems.length]);

  useEffect(() => {
    setCurrentIndex(preview.currentIndex || 0);
  }, [preview.currentIndex, preview.outputSrc, preview.imageKey, galleryItems.length]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    setWheelActive(false);
    dragRef.current = null;
  }, [inputSrc, outputSrc]);

  useEffect(() => {
    if (!hasGallery) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, hasGallery]);

  const handleWheel = useCallback((event) => {
    if (!wheelActive) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.18 : -0.18;
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= 1.02) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, [clampScale, wheelActive]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const onWheel = (event) => handleWheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setOffset({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    setWheelActive(true);
    if (scale <= 1.02) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }, [offset.x, offset.y, scale]);

  if (!outputSrc) return null;
  const sharedPreviewImageStyle = {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: dragging ? "none" : "transform 0.08s ease-out",
    cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
    userSelect: "none",
  };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ position: "relative", width: "94vw", height: "90vh", maxWidth: isComparePreview ? 1480 : 1360 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ ...S.closeBtn, position: "absolute", top: 12, right: 12, zIndex: 10 }}>✕</button>
        {hasGallery && (
          <>
            <button
              type="button"
              style={{
                ...S.previewNavBtn,
                left: 14,
                opacity: canGoPrev ? 1 : 0.35,
                cursor: canGoPrev ? "pointer" : "not-allowed",
              }}
              onClick={goPrev}
              disabled={!canGoPrev}
            >
              ‹
            </button>
            <button
              type="button"
              style={{
                ...S.previewNavBtn,
                right: 14,
                opacity: canGoNext ? 1 : 0.35,
                cursor: canGoNext ? "pointer" : "not-allowed",
              }}
              onClick={goNext}
              disabled={!canGoNext}
            >
              ›
            </button>
            <div style={S.previewCounter}>
              {currentIndex + 1} / {galleryItems.length}
            </div>
          </>
        )}
        <div
          ref={viewportRef}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#0b0b0d",
            overflow: "hidden",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            userSelect: "none",
          }}
          onMouseDown={handleMouseDown}
          onClick={() => setWheelActive(true)}
          onTouchStart={(event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            swipeRef.current = {
              active: true,
              startX: touch.clientX,
              startY: touch.clientY,
            };
          }}
          onTouchEnd={(event) => {
            if (!swipeRef.current.active) return;
            const touch = event.changedTouches?.[0];
            swipeRef.current.active = false;
            if (!touch) return;
            const dx = touch.clientX - swipeRef.current.startX;
            const dy = touch.clientY - swipeRef.current.startY;
            if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy)) return;
            if (dx > 0) {
              goPrev();
            } else {
              goNext();
            }
          }}
          onDoubleClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          {isComparePreview ? (
            <div style={S.previewCompareGrid}>
              <div style={S.previewComparePane}>
                <div style={S.previewCompareLabel}>
                  <span>{t("viewer.compareInput")}</span>
                  {inputTokens.length > 0 && (
                    <span style={S.previewCompareTokens}>
                      {inputTokens.map((token, index) => (
                        <span key={`${token}-${index}`} style={S.previewCompareToken}>
                          {token}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div style={S.previewCompareImageWrap}>
                  <img
                    src={inputSrc}
                    alt={t("viewer.compareInput")}
                    draggable={false}
                    style={{ ...S.previewCompareImage, ...sharedPreviewImageStyle }}
                  />
                </div>
              </div>
              <div style={{ ...S.previewComparePane, borderRight: "none" }}>
                <div style={S.previewCompareLabel}>{t("viewer.compareOutput")}</div>
                <div style={S.previewCompareImageWrap}>
                  <img
                    src={outputSrc}
                    alt={t("viewer.compareOutput")}
                    draggable={false}
                    style={{ ...S.previewCompareImage, ...sharedPreviewImageStyle }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={S.previewSingleWrap}>
              <img
                src={outputSrc}
                alt={t("viewer.fullImage")}
                draggable={false}
                style={sharedPreviewImageStyle}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineZoomViewer({ src, onCollapse, containerStyle = null, collapseButtonStyle = null, viewportStyle = null, imageStyle = null }) {
  const { t } = useI18n();
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const clampScale = useCallback((value) => Math.max(1, Math.min(6, Number(value) || 1)), []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [src]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= 1.02) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, [clampScale]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const onWheel = (event) => handleWheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setOffset({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (scale <= 1.02) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }, [offset.x, offset.y, scale]);

  if (!src) return null;

  return (
    <div style={{ ...S.inlineZoomViewer, ...(containerStyle || null) }}>
      <button
        type="button"
        style={{ ...S.inlineZoomViewerCollapseBtn, ...(collapseButtonStyle || null) }}
        onClick={onCollapse}
        title={t("viewer.collapse")}
      >
        ↙
      </button>
      <div
        ref={viewportRef}
        style={{ ...S.inlineZoomViewerViewport, ...(viewportStyle || null) }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setScale(1);
          setOffset({ x: 0, y: 0 });
        }}
      >
        <img
          src={src}
          alt={t("viewer.inputImageAlt")}
          draggable={false}
          style={{
            ...S.inlineZoomViewerImage,
            ...(imageStyle || null),
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.08s ease-out",
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          }}
        />
      </div>
    </div>
  );
}

function ResultColumn({
  result,
  onPreview,
  onCancel,
  turnId,
  turnSeq,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  onSplitImage,
  retryingImageKeys,
  splittingImageKeys,
  enableSelect = false,
  showImageLabel = false,
  selectPosition = "top-right",
  compactImages = false,
  showPromptBadge = true,
}) {
  const { uiLanguage, t } = useI18n();
  const model = IMAGE_MODELS.find((m) => m.id === result.modelId);
  const visibleImages = Array.isArray(result.images) ? result.images : [];
  const generatedCount = visibleImages.length;
  const requestedCount = Math.max(1, Number(result?.requestedCount) || 1);
  const resultTaskKey = buildTurnTaskKey(turnId, result.modelId, getResultPromptKey(result));
  const prov = PROVIDER_COLORS[model?.provider] || { bg: "#666" };
  const sc =
    result.status === "success"
      ? "#22c55e"
      : result.status === "loading"
      ? "#eab308"
      : result.status === "cancelled"
      ? "#9ca3af"
      : "#ef4444";
  return (
    <div style={S.resultCol}>
      <div style={S.resultHeader}>
        <span style={{ ...S.dot, background: prov.bg, width: 8, height: 8 }} />
        <span style={S.resultName}>{model?.name || result.modelId}</span>
        {showPromptBadge && getResultPromptKey(result) !== "single" && (
          <span style={{ ...S.statusBadge, background: "rgba(59,130,246,0.14)", color: "#93c5fd" }}>
            {getLocalizedPromptLabel(result.promptLabel || getResultPromptKey(result), getResultPromptKey(result), uiLanguage)}
          </span>
        )}
        {!!result.requestedCount && <span style={{ ...S.statusBadge, background: "rgba(250,204,21,0.14)", color: "#facc15" }}>x{result.requestedCount}</span>}
        <span style={{ ...S.statusBadge, background: sc + "22", color: sc }}>
          {result.status === "loading" ? "⏳" : result.status === "success" ? "✓" : "✗"} {getLocalizedStatusLabel(result.status, t)}
        </span>
      </div>
      {result.status === "loading" && (
        <div style={S.loadingArea}>
          <div style={S.spinner} />
          <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
            {t("status.generating", { generated: generatedCount, requested: requestedCount })}
          </p>
          <button style={{ ...S.dlBtn, marginTop: 10, borderRadius: 8, width: 120 }} onClick={onCancel}>{t("status.stop")}</button>
        </div>
      )}
      {(result.status === "success" || result.status === "loading") && visibleImages.length > 0 && (
        <div style={compactImages ? S.imgGridCompact : S.imgGrid}>
          {visibleImages.map((img, i) => {
            const imageIndex = i + 1;
            const promptKey = getResultPromptKey(result);
            const imageKey = buildTurnImageKey(turnId, result.modelId, promptKey, imageIndex);
            const isSelected = enableSelect ? !!selectedImageKeys?.has?.(imageKey) : false;
            return (
              <ImageCard
                key={`${imageKey}:${isSelected ? "selected" : "idle"}`}
                img={img}
                fileStem={buildResultFileStem(result)}
                index={imageIndex}
                onPreview={onPreview}
                previewPayload={{
                  imageKey,
                  promptText: typeof result?.promptText === "string" ? result.promptText : "",
                }}
                label={showImageLabel ? (result.promptLabel || "") : ""}
                compact={compactImages}
                showSelect={enableSelect}
                selectPosition={selectPosition}
                selected={isSelected}
                replacing={retryingImageKeys?.has?.(imageKey)}
                busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(resultTaskKey)}
                splitBusy={splittingImageKeys?.has?.(imageKey)}
                onRetry={() =>
                  onRetryImage?.({
                    key: imageKey,
                    turnId,
                    modelId: result.modelId,
                    promptKey,
                    index: imageIndex,
                  })
                }
                onAppend={() =>
                  onAppendImage?.({
                    key: resultTaskKey,
                    turnId,
                    modelId: result.modelId,
                    promptKey,
                  })
                }
                onToggleSelect={() =>
                  enableSelect && onToggleImageSelect?.({
                    key: imageKey,
                    image: img,
                    turnId,
                    turnSeq,
                    modelId: result.modelId,
                    modelName: result.modelName || model?.name || result.modelId,
                    promptKey,
                    theme: result.promptLabel || "",
                    fileStem: buildResultFileStem(result),
                    index: imageIndex,
                  })
                }
                onSplit={(resolvedImage) =>
                  onSplitImage?.({
                    key: imageKey,
                    image: resolvedImage || img,
                    turnId,
                    turnSeq,
                    modelId: result.modelId,
                    modelName: result.modelName || model?.name || result.modelId,
                    promptKey,
                    theme: result.promptLabel || "",
                    fileStem: buildResultFileStem(result),
                    index: imageIndex,
                  })
                }
              />
            );
          })}
        </div>
      )}
      {(result.status === "error" || result.status === "cancelled" || (result.status === "success" && !visibleImages.length)) && (
        <div style={S.errArea}>
          {result.status === "error" ? (
            <p style={{ color: "#ef4444", fontSize: 13, wordBreak: "break-word" }}>{localizeRuntimeMessage(result.error, t)}</p>
          ) : null}
          {result.status === "cancelled" ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>{t("status.cancelledByUser")}</p>
          ) : null}
          {result.status === "success" && !visibleImages.length ? (
            <p style={{ color: "#f59e0b", fontSize: 13 }}>{t("turn.noImagesReturned")}</p>
          ) : null}
          <ImageActionBar
            allowSave={false}
            compact
            busy={retryingImageKeys?.has?.(resultTaskKey)}
            onRetry={() =>
              onRetryImage?.({
                key: resultTaskKey,
                turnId,
                modelId: result.modelId,
                promptKey: getResultPromptKey(result),
              })
            }
            onAppend={() =>
              onAppendImage?.({
                key: resultTaskKey,
                turnId,
                modelId: result.modelId,
                promptKey: getResultPromptKey(result),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ImageCard({
  img,
  fileStem,
  index,
  onPreview,
  previewPayload = null,
  label,
  selected,
  onToggleSelect,
  onRetry,
  onAppend,
  replacing = false,
  busy = false,
  onSplit,
  splitBusy = false,
  showSelect = true,
  selectPosition = "top-right",
  compact = false,
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState(img);
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    setSrc(img);
    setTriedProxy(false);
  }, [img]);

  const onImgError = useCallback(() => {
    if (triedProxy) return;
    const proxyFromGlobal = typeof window !== "undefined" ? window.__proxyUrl : "";
    const proxied = buildWorkerImageProxyUrl(proxyFromGlobal, src);
    if (proxied && proxied !== src) {
      setTriedProxy(true);
      setSrc(proxied);
    }
  }, [src, triedProxy]);

  return (
    <div style={{ ...S.imgCard, ...(compact ? S.imgCardCompact : null), ...(selected ? S.imgCardSelected : null) }}>
      {showSelect && (
        <button
          type="button"
          style={{
            ...S.imageSelectBtn,
            ...(compact ? S.imageSelectBtnCompact : null),
            ...(selectPosition === "bottom-right" ? S.imageSelectBtnBottom : null),
            ...(selected ? S.imageSelectBtnActive : null),
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleSelect}
          title={selected ? t("select.unselect") : t("select.select")}
        >
          {selected ? "●" : "○"}
        </button>
      )}
      {!!label && <div style={{ ...S.imageThemeTag, ...(compact ? S.imageThemeTagCompact : null) }}>{label}</div>}
      {typeof onSplit === "function" && (
        <button
          type="button"
          style={{
            ...S.imageSplitBtn,
            ...(compact ? S.imageSplitBtnCompact : null),
            ...(splitBusy ? S.imageSplitBtnBusy : null),
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onSplit(src);
          }}
          disabled={splitBusy}
          title={t("split.open")}
        >
          {splitBusy ? "…" : "✂"}
        </button>
      )}
      {!replacing ? (
        <img
          src={src}
          alt={`Gen ${index}`}
          style={compact ? S.thumbCompact : S.thumb}
          onClick={() =>
            onPreview(
              previewPayload && typeof previewPayload === "object"
                ? { ...previewPayload, outputSrc: src }
                : src
            )
          }
          onError={onImgError}
        />
      ) : (
        <div style={compact ? S.thumbRetryingCompact : S.thumbRetrying}>{t("action.retry")}…</div>
      )}
      <ImageActionBar
        compact={compact}
        busy={busy}
        onSave={() =>
          src.startsWith("data:image/")
            ? downloadDataUrl(src, `${fileStem}_${index}.png`)
            : downloadImageUrl(src, `${fileStem}_${index}.png`)
        }
        onRetry={onRetry}
        onAppend={onAppend}
      />
    </div>
  );
}

function TurnPanel({
  turn,
  onPreview,
  onCancelModel,
  onDelete,
  onReuse,
  onHide,
  onSyncTemplate,
  canSyncTemplate,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  onSplitImage,
  retryingImageKeys,
  splittingImageKeys,
  compactStyleHistory = false,
  truncatePromptText = false,
  showModelSummary = true,
  enableInlineReferenceViewer = false,
}) {
  const { uiLanguage, t } = useI18n();
  const [inlineViewerSrc, setInlineViewerSrc] = useState(null);
  const expandPromptPreview = !!inlineViewerSrc;
  const promptVariants = getTurnPromptVariants(turn);
  const turnMode = getTurnMode(turn);
  const isCompareMode = turnMode === "compare";
  const isStyleMode = turnMode === "style";
  const isMultiPromptMode = promptVariants.length > 1;
  const styleBasePrompt =
    typeof turn?.styleBasePrompt === "string"
      ? turn.styleBasePrompt
      : turn?.prompt || promptVariants[0]?.prompt || "";
  const selectedModelIds = Array.isArray(turn?.selectedModelIds) ? turn.selectedModelIds : [];
  const styleReferenceImages = Array.isArray(turn?.styleReferenceImages) ? turn.styleReferenceImages : [];
  const previewInputImage = normalizeImageValue(turn.referenceImage) || normalizeImageValue(styleReferenceImages[0] || "");
  const handleGeneratedImagePreview = useCallback((payload) => {
    const previewPayload = normalizePreviewPayload(payload);
    const normalizedImage = previewPayload.outputSrc;
    if (!normalizedImage) return;
    const promptText = typeof payload?.promptText === "string" ? payload.promptText : "";
    const inputTokens = getFilledPlaceholderTokens(promptText);
    onPreview?.({
      ...previewPayload,
      inputSrc: previewInputImage && previewInputImage !== normalizedImage ? previewInputImage : previewPayload.inputSrc,
      inputTokens,
    });
  }, [onPreview, previewInputImage]);
  const formatPromptPreviewText = useCallback((text) => {
    const source = typeof text === "string" ? text : "";
    if (!truncatePromptText) return source;
    return getPromptPreviewText(source, expandPromptPreview ? 960 : 220);
  }, [expandPromptPreview, truncatePromptText]);

  useEffect(() => {
    if (!turn.referenceImage && inlineViewerSrc) {
      setInlineViewerSrc(null);
    }
  }, [turn.referenceImage, inlineViewerSrc]);

  const modelOrder = new Map(selectedModelIds.map((id, index) => [id, index]));
  const promptVariantOrder = new Map(promptVariants.map((variant, index) => [variant.key, index]));
  const styleResults = isStyleMode
    ? (turn.results || [])
        .slice()
        .sort((a, b) => {
          const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
          const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          const ak = promptVariantOrder.has(getResultPromptKey(a))
            ? promptVariantOrder.get(getResultPromptKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bk = promptVariantOrder.has(getResultPromptKey(b))
            ? promptVariantOrder.get(getResultPromptKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (ak !== bk) return ak - bk;
          return String(a.modelId).localeCompare(String(b.modelId));
        })
    : [];
  const styleModelId = selectedModelIds[0] || styleResults[0]?.modelId || "";
  const styleModelName = IMAGE_MODELS.find((model) => model.id === styleModelId)?.name || styleModelId || "-";
  const styleRequestedCount = styleResults[0]?.requestedCount || (styleModelId ? Number(turn?.modelCounts?.[styleModelId]) || 1 : 0);
  const styleExpectedCount = styleResults.reduce(
    (sum, result) => sum + Math.max(1, Number(result?.requestedCount) || 1),
    0
  );
  const styleGeneratedCount = styleResults.reduce(
    (sum, result) => sum + (Array.isArray(result?.images) ? result.images.length : 0),
    0
  );
  const styleSuccessCount = styleResults.filter((result) => result.status === "success").length;
  const styleErrorCount = styleResults.filter((result) => result.status === "error").length;
  const styleCancelledCount = styleResults.filter((result) => result.status === "cancelled").length;
  const styleLoadingCount = styleResults.filter((result) => result.status === "loading").length;
  const styleFailedCount = styleErrorCount + styleCancelledCount;
  const styleTurnFinished = turn.status === "done";
  const styleStillRunning = !styleTurnFinished && (turn.status === "queued" || turn.status === "running" || styleLoadingCount > 0);
  const styleImageItems = styleResults.flatMap((result) => {
    const promptKey = getResultPromptKey(result);
    const promptLabel = result.promptLabel || promptKey;
    const modelName = result.modelName || styleModelName;
    const images = Array.isArray(result.images) ? result.images : [];
    return images.map((image, index) => ({
      image,
      index: index + 1,
      modelId: result.modelId,
      modelName,
      promptKey,
      promptLabel,
      promptText: typeof result.promptText === "string" ? result.promptText : "",
      fileStem: buildResultFileStem(result),
    }));
  });
  const styleFailedThemes = Array.from(
    new Set(
      styleResults
        .filter((result) => result.status === "error" || result.status === "cancelled")
        .map((result) => result.promptLabel || getResultPromptKey(result))
        .filter(Boolean)
    )
  );
  const resultsByVariant = promptVariants.map((variant) => ({
    variant,
    groupResults: (turn.results || [])
      .filter((result) => getResultPromptKey(result) === variant.key)
      .sort((a, b) => {
        const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
        const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return String(a.modelId).localeCompare(String(b.modelId));
      }),
  })).filter((item) => item.groupResults.length > 0);
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: mono }}>
          #{turn.seq} · {formatUiDateTime(turn.createdAt, uiLanguage)} · {getLocalizedStatusLabel(turn.status, t)}
          {isCompareMode && <span style={S.turnModeBadge}>{t("turn.compare")}</span>}
          {isStyleMode && <span style={S.turnModeBadge}>{t("turn.style")}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showModelSummary && (
            <div style={{ fontSize: 12, color: "#71717a", fontFamily: mono }}>
              {selectedModelIds.length ? selectedModelIds.join(" · ") : "-"}
            </div>
          )}
          {onSyncTemplate && (
            <button
              style={{ ...S.turnActionBtn, opacity: canSyncTemplate ? 1 : 0.45, cursor: canSyncTemplate ? "pointer" : "not-allowed" }}
              onClick={() => onSyncTemplate(turn)}
              disabled={!canSyncTemplate}
            >
              {t("turn.syncTemplate")}
            </button>
          )}
          {onReuse && <button style={S.turnActionBtn} onClick={() => onReuse(turn)}>{t("turn.reuse")}</button>}
          {onHide && <button style={{ ...S.turnActionBtn, width: 28, padding: 0 }} onClick={() => onHide(turn.id)}>x</button>}
          {onDelete && <button style={{ ...S.turnActionBtn, color: "#fca5a5", borderColor: "rgba(252,165,165,0.4)" }} onClick={() => onDelete(turn.id)}>{t("turn.delete")}</button>}
        </div>
      </div>
      {isStyleMode && compactStyleHistory ? (
        <div style={S.styleHistorySummary}>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryModel")}</span>
            <span style={S.styleSummaryVal}>{styleModelName}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryPerTask")}</span>
            <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryGenerated")}</span>
            <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summarySuccess")}</span>
            <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryFailed")}</span>
            <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryRunning")}</span>
            <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...S.turnPromptRow, ...(expandPromptPreview ? S.turnPromptRowExpanded : null) }}>
            <div
              style={{
                ...S.turnPromptCards,
                gridTemplateColumns: isCompareMode ? "repeat(2, minmax(0, 1fr))" : "1fr",
                ...(expandPromptPreview ? S.turnPromptCardsExpanded : null),
              }}
            >
              {isStyleMode ? (
                <div
                  style={{
                    ...S.turnPromptCard,
                    ...(truncatePromptText ? S.turnPromptCardCompact : null),
                    ...(expandPromptPreview ? S.turnPromptCardExpanded : null),
                  }}
                >
                  <div
                    style={{
                      ...S.turnPromptText,
                      ...(truncatePromptText ? S.turnPromptTextCompact : null),
                      ...(expandPromptPreview ? S.turnPromptTextExpanded : null),
                    }}
                    >
                    {styleBasePrompt ? <PromptTextWithChips text={formatPromptPreviewText(styleBasePrompt)} /> : t("status.noPrompt")}
                  </div>
                </div>
              ) : (
                promptVariants.map((variant) => (
                  <div
                    key={variant.key}
                    style={{
                      ...S.turnPromptCard,
                      ...(truncatePromptText ? S.turnPromptCardCompact : null),
                      ...(expandPromptPreview ? S.turnPromptCardExpanded : null),
                    }}
                    >
                    {isCompareMode && <div style={S.turnPromptBadge}>{getLocalizedPromptLabel(variant.label, variant.key, uiLanguage)}</div>}
                    <div
                      style={{
                        ...S.turnPromptText,
                        ...(truncatePromptText ? S.turnPromptTextCompact : null),
                        ...(expandPromptPreview ? S.turnPromptTextExpanded : null),
                      }}
                    >
                      {variant.prompt ? <PromptTextWithChips text={formatPromptPreviewText(variant.prompt)} /> : t("status.noPrompt")}
                    </div>
                  </div>
                ))
              )}
            </div>
            {(turn.referenceImage || styleReferenceImages.length > 0) && (
              <div style={{ ...S.turnRefViewerCol, ...(expandPromptPreview ? S.turnRefViewerColExpanded : null) }}>
                <div style={S.turnRefImageStack}>
                  {turn.referenceImage && (
                    inlineViewerSrc ? (
                      <InlineZoomViewer
                        src={inlineViewerSrc}
                        onCollapse={() => {
                          setInlineViewerSrc(null);
                        }}
                      />
                    ) : (
                      <div style={S.turnRefImageWrap}>
                        <button
                          type="button"
                          style={S.turnRefImageBtn}
                          onClick={() => onPreview?.(turn.referenceImage)}
                          title={t("viewer.previewReference")}
                        >
                          <img src={turn.referenceImage} alt="Reference" style={S.turnRefImage} />
                        </button>
                        {enableInlineReferenceViewer && (
                          <button
                            type="button"
                            style={S.turnRefImageZoomBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              setInlineViewerSrc(turn.referenceImage);
                            }}
                            title={t("viewer.inlineViewer")}
                          >
                            🔍
                          </button>
                        )}
                      </div>
                    )
                  )}
                  {styleReferenceImages.map((image, index) => (
                    <button
                      key={`style-ref-${turn.id}-${index}`}
                      type="button"
                      style={S.turnRefImageBtn}
                      onClick={() => onPreview?.(image)}
                      title={t("viewer.previewStyleImage", { index: index + 1 })}
                    >
                      <img src={image} alt={`Style ${index + 1}`} style={S.turnRefImage} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {isStyleMode ? (
            <div style={S.turnStyleUnifiedWrap}>
              <div style={S.styleHistorySummary}>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryModel")}</span>
                  <span style={S.styleSummaryVal}>{styleModelName}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryPerTask")}</span>
                  <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryGenerated")}</span>
                  <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summarySuccess")}</span>
                  <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryFailed")}</span>
                  <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryRunning")}</span>
                  <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
                </div>
              </div>

              {styleTurnFinished && styleFailedThemes.length > 0 && (
                <div style={S.turnStyleFailedLine}>
                  {t("turn.failedThemes", { themes: styleFailedThemes.join(" · ") })}
                </div>
              )}

              <div style={S.turnStyleImageBox}>
                <div style={S.turnStyleImageHead}>
                  <span style={S.turnResultMeta}>{t("turn.styleResults")}</span>
                  {styleLoadingCount > 0 && (
                    <span style={S.turnResultMeta}>
                      {t("turn.generatingCount", { generated: styleGeneratedCount, expected: styleExpectedCount || 0 })}
                    </span>
                  )}
                </div>

                {styleImageItems.length > 0 ? (
                  <div style={S.imgGridCompact}>
                    {styleImageItems.map((item) => {
                      const imageKey = buildTurnImageKey(turn.id, item.modelId, item.promptKey, item.index);
                      return (
                        <ImageCard
                          key={imageKey}
                          img={item.image}
                          fileStem={item.fileStem}
                          index={item.index}
                          onPreview={handleGeneratedImagePreview}
                          previewPayload={{
                            imageKey,
                            promptText: item.promptText,
                          }}
                          label={getLocalizedPromptLabel(item.promptLabel, item.promptKey, uiLanguage)}
                          compact
                          showSelect
                          selected={selectedImageKeys?.has?.(imageKey)}
                          replacing={retryingImageKeys?.has?.(imageKey)}
                          busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(buildTurnTaskKey(turn.id, item.modelId, item.promptKey))}
                          splitBusy={splittingImageKeys?.has?.(imageKey)}
                          onRetry={() =>
                            onRetryImage?.({
                              key: imageKey,
                              turnId: turn.id,
                              modelId: item.modelId,
                              promptKey: item.promptKey,
                              index: item.index,
                            })
                          }
                          onAppend={() =>
                            onAppendImage?.({
                              key: buildTurnTaskKey(turn.id, item.modelId, item.promptKey),
                              turnId: turn.id,
                              modelId: item.modelId,
                              promptKey: item.promptKey,
                            })
                          }
                          onToggleSelect={() =>
                            onToggleImageSelect?.({
                              key: imageKey,
                              image: item.image,
                              turnId: turn.id,
                              turnSeq: turn.seq,
                              modelId: item.modelId,
                              modelName: item.modelName,
                              promptKey: item.promptKey,
                              theme: item.promptLabel || "",
                              fileStem: item.fileStem,
                              index: item.index,
                            })
                          }
                          onSplit={(resolvedImage) =>
                            onSplitImage?.({
                              key: imageKey,
                              image: resolvedImage || item.image,
                              turnId: turn.id,
                              turnSeq: turn.seq,
                              modelId: item.modelId,
                              modelName: item.modelName,
                              promptKey: item.promptKey,
                              theme: item.promptLabel || "",
                              fileStem: item.fileStem,
                              index: item.index,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div style={S.turnStyleImageEmpty}>
                    {styleStillRunning
                      ? t("turn.generatingImages")
                      : styleFailedCount > 0
                      ? t("turn.noSuccessfulImages")
                      : styleResults.length
                      ? t("turn.noImagesReturned")
                      : t("turn.noStyleResults")}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={
                isCompareMode
                  ? { ...S.turnCompareResultsGrid, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
                  : undefined
              }
            >
              {resultsByVariant.map(({ variant, groupResults }) => {
              return (
                <div key={variant.key} style={isMultiPromptMode ? S.turnResultGroup : undefined}>
                  {isCompareMode && (
                    <div style={S.turnResultGroupHead}>
                      <span style={S.turnPromptBadge}>{getLocalizedPromptLabel(variant.label, variant.key, uiLanguage)}</span>
                      <span style={S.turnResultMeta}>{t("turn.modelTasks", { count: groupResults.length })}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: "grid",
                      gap: 16,
                      gridTemplateColumns: isCompareMode
                        ? `repeat(${Math.min(2, Math.max(1, groupResults.length))}, minmax(0, 1fr))`
                        : `repeat(${Math.min(4, Math.max(1, groupResults.length))}, minmax(0, 1fr))`,
                    }}
                  >
                    {groupResults.map((r, i) => (
                      <ResultColumn
                        key={`${turn.id}-${r.modelId}-${getResultPromptKey(r)}-${i}`}
                        result={r}
                        onPreview={handleGeneratedImagePreview}
                        onCancel={() => onCancelModel?.(turn.id, r.modelId, getResultPromptKey(r))}
                        turnId={turn.id}
                        turnSeq={turn.seq}
                        selectedImageKeys={selectedImageKeys}
                        onToggleImageSelect={onToggleImageSelect}
                        onRetryImage={onRetryImage}
                        onAppendImage={onAppendImage}
                        onSplitImage={onSplitImage}
                        retryingImageKeys={retryingImageKeys}
                        splittingImageKeys={splittingImageKeys}
                        enableSelect
                        showImageLabel={false}
                      />
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Main App ───
export default function App() {
  const promptEditor = useUndoRedoText("");
  const compareAEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS.a);
  const compareBEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS.b);
  const prompt = promptEditor.value;
  const comparePrompts = useMemo(
    () => ({ a: compareAEditor.value, b: compareBEditor.value }),
    [compareAEditor.value, compareBEditor.value]
  );
  const [activePage, setActivePage] = useState("workspace");
  const [uiLanguage, setUiLanguage] = useState(DEFAULT_UI_LANGUAGE);
  const [taskMode, setTaskMode] = useState(DEFAULT_TASK_MODE);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [apiKeys, setApiKeys] = useState(DEFAULT_API_KEYS);
  const [draftApiKeys, setDraftApiKeys] = useState(DEFAULT_API_KEYS);
  const [apiKeySavedAt, setApiKeySavedAt] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [gptAssistPrompt, setGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [draftGptAssistPrompt, setDraftGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [gptAssistSendPromptText, setGptAssistSendPromptText] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const [draftGptAssistSendPromptText, setDraftGptAssistSendPromptText] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const [gptAssistSendPromptImage, setGptAssistSendPromptImage] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const [draftGptAssistSendPromptImage, setDraftGptAssistSendPromptImage] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const [styleThemeAssistPrompt, setStyleThemeAssistPrompt] = useState(DEFAULT_STYLE_THEME_ASSIST_PROMPT);
  const [draftStyleThemeAssistPrompt, setDraftStyleThemeAssistPrompt] = useState(DEFAULT_STYLE_THEME_ASSIST_PROMPT);
  const [gptAssistSavedAt, setGptAssistSavedAt] = useState(null);
  const [showGptAssistModal, setShowGptAssistModal] = useState(false);
  const [gptAssistBusy, setGptAssistBusy] = useState(false);
  const [styleThemeAssistBusy, setStyleThemeAssistBusy] = useState(false);
  const [styleThemeSeedInput, setStyleThemeSeedInput] = useState("");
  const [templates, setTemplates] = useState(normalizeTemplates(DEFAULT_TEMPLATES));
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ title: "", body: "", backup: "", memo: "" });
  const [styleTemplates, setStyleTemplates] = useState(normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES));
  const [activeStyleTemplateId, setActiveStyleTemplateId] = useState(DEFAULT_STYLE_TEMPLATES[0]?.id || null);
  const [showStyleTemplateModal, setShowStyleTemplateModal] = useState(false);
  const [editingStyleTemplateId, setEditingStyleTemplateId] = useState(null);
  const [styleTemplateDraft, setStyleTemplateDraft] = useState({ title: "", body: "" });
  const [styleThemes, setStyleThemes] = useState(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
  const [uploadedInputImages, setUploadedInputImages] = useState([]);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [styleReferenceImages, setStyleReferenceImages] = useState([]);
  const [showInputImageModal, setShowInputImageModal] = useState(false);
  const [showInputImageEditor, setShowInputImageEditor] = useState(false);
  const [inputImageEditorIndex, setInputImageEditorIndex] = useState(0);
  const [showStyleReferenceModal, setShowStyleReferenceModal] = useState(false);
  const [selectedModels, setSelectedModels] = useState(DEFAULT_SELECTED_MODELS);
  const [modelCounts, setModelCounts] = useState(DEFAULT_MODEL_COUNTS);
  const [lastEditedCount, setLastEditedCount] = useState(DEFAULT_LAST_EDITED_COUNT);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [turns, setTurns] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(4);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("https://img-proxy.adelineazures.workers.dev");
  const [historyDirHandle, setHistoryDirHandle] = useState(null);
  const [historyDirName, setHistoryDirName] = useState("");
  const [historyFolderMsg, setHistoryFolderMsg] = useState("");
  const [isPickingHistoryFolder, setIsPickingHistoryFolder] = useState(false);
  const [hiddenTurnIds, setHiddenTurnIds] = useState([]);
  const [selectedAtlasItems, setSelectedAtlasItems] = useState([]);
  const [atlasThumbnail, setAtlasThumbnail] = useState(null);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const [showSelectionLimitModal, setShowSelectionLimitModal] = useState(false);
  const [showAtlasThumbnailModal, setShowAtlasThumbnailModal] = useState(false);
  const [retryingImageKeys, setRetryingImageKeys] = useState(new Set());
  const [splittingImageKeys, setSplittingImageKeys] = useState(new Set());
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitExporting, setSplitExporting] = useState(false);
  const [splitEnhancing, setSplitEnhancing] = useState(false);
  const [splitEnhanceEnabled, setSplitEnhanceEnabled] = useState(true);
  const [splitUseRemovedSource, setSplitUseRemovedSource] = useState(false);
  const [splitRenderMode, setSplitRenderMode] = useState(DEFAULT_SPLIT_RENDER_MODE);
  const [splitShapeMode, setSplitShapeMode] = useState(DEFAULT_SPLIT_SHAPE_MODE);
  const [splitBackgroundColor, setSplitBackgroundColor] = useState(DEFAULT_SPLIT_BG_COLOR);
  const [splitSelectedItemIds, setSplitSelectedItemIds] = useState(new Set());
  const [splitUndoStack, setSplitUndoStack] = useState([]);
  const [splitStatusText, setSplitStatusText] = useState("");
  const [splitStatusTone, setSplitStatusTone] = useState("info");
  const [splitContext, setSplitContext] = useState({
    key: "",
    image: "",
    originalImage: "",
    sourceImage: "",
    processBaseImage: "",
    processImage: "",
    removedBaseImage: "",
    removedEnhancedImage: "",
    removedImage: "",
    items: [],
    fileStem: "image",
    turnId: "",
    turnSeq: 0,
    modelId: "",
    modelName: "",
    promptKey: "single",
    theme: "",
    index: 1,
    width: 0,
    height: 0,
  });
  const fileRef = useRef(null);
  const activePromptFieldRef = useRef("single");
  const promptInputRef = useRef(null);
  const compareAInputRef = useRef(null);
  const compareBInputRef = useRef(null);
  const seqRef = useRef(1);
  const controllersRef = useRef({});
  const savingToFolderRef = useRef(new Set());
  const isPickingHistoryFolderRef = useRef(false);
  const hasAutoPromptedHistoryFolderRef = useRef(false);
  const t = useCallback((key, params) => translateUiText(uiLanguage, key, params), [uiLanguage]);

  const insertPlaceholderChip = useCallback(() => {
    if (taskMode === "compare") {
      if (activePromptFieldRef.current === "b") {
        compareBInputRef.current?.insertPlaceholder?.();
        return;
      }
      compareAInputRef.current?.insertPlaceholder?.();
      return;
    }
    promptInputRef.current?.insertPlaceholder?.();
  }, [taskMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.historyLimit === "number") setHistoryLimit(saved.historyLimit);
        if (Array.isArray(saved.selectedModels) && saved.selectedModels.length) {
          const migrated = saved.selectedModels.map((id) => normalizeModelId(id));
          setSelectedModels(migrated);
        }
        if (saved.modelCounts && typeof saved.modelCounts === "object") {
          const migratedCounts = { ...saved.modelCounts };
          if (typeof migratedCounts["nano-banana-pro-all"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["nano-banana-pro-all"];
          }
          if (typeof migratedCounts["gemini-3-pro-preview"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["gemini-3-pro-preview"];
          }
          setModelCounts((prev) => ({ ...prev, ...migratedCounts }));
        }
        if (saved.taskMode === "single" || saved.taskMode === "compare" || saved.taskMode === "style") setTaskMode(saved.taskMode);
        if (saved.comparePrompts && typeof saved.comparePrompts === "object") {
          compareAEditor.resetText(typeof saved.comparePrompts.a === "string" ? saved.comparePrompts.a : DEFAULT_COMPARE_PROMPTS.a);
          compareBEditor.resetText(typeof saved.comparePrompts.b === "string" ? saved.comparePrompts.b : DEFAULT_COMPARE_PROMPTS.b);
        }
        if (typeof saved.prompt === "string") promptEditor.resetText(saved.prompt);
        if (Array.isArray(saved.styleThemes)) {
          setStyleThemes(normalizeStyleThemes(saved.styleThemes));
        }
        if (Array.isArray(saved.styleReferenceImages)) {
          setStyleReferenceImages(
            saved.styleReferenceImages
              .map((item) => (typeof item === "string" ? item : ""))
              .filter(Boolean)
              .slice(0, MAX_STYLE_REFERENCE_IMAGES)
          );
        }
        if (typeof saved.apiBaseUrl === "string" && saved.apiBaseUrl.trim()) {
          setApiBaseUrl(resolveApiBaseUrl(saved.apiBaseUrl));
        } else {
          setApiBaseUrl(DEFAULT_API_BASE_URL);
        }
        if (typeof saved.lastEditedCount === "number") {
          setLastEditedCount(Math.max(1, Math.min(8, Number(saved.lastEditedCount) || 1)));
        }
        if (typeof saved.aspectRatio === "string" || typeof saved.geminiAspectRatio === "string") {
          setAspectRatio(normalizeAspectRatio(saved.aspectRatio ?? saved.geminiAspectRatio));
        }
        if (typeof saved.proxyUrl === "string" && saved.proxyUrl.trim()) setProxyUrl(saved.proxyUrl);
        if (typeof saved.uiLanguage === "string") setUiLanguage(normalizeUiLanguage(saved.uiLanguage));
        if (typeof saved.nextSeq === "number" && Number.isFinite(saved.nextSeq)) seqRef.current = saved.nextSeq;
      } else {
        const s = window.__proxyUrl;
        if (s) setProxyUrl(s);
      }
    } catch {}
  }, []);
  useEffect(() => { window.__proxyUrl = proxyUrl; }, [proxyUrl]);
  useEffect(() => { window.__apiBaseUrl = apiBaseUrl; }, [apiBaseUrl]);
  useEffect(() => { window.__apiPlatform = DEFAULT_API_PLATFORM; }, []);
  useEffect(() => { window.__apiKeys = apiKeys; }, [apiKeys]);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = uiLanguage === "zh" ? "zh-CN" : "en";
    }
  }, [uiLanguage]);
  useEffect(() => {
    const state = {
      historyLimit,
      selectedModels,
      modelCounts,
      prompt,
      taskMode,
      comparePrompts,
      styleThemes,
      styleReferenceImages,
      apiBaseUrl,
      lastEditedCount,
      aspectRatio,
      proxyUrl,
      uiLanguage,
      nextSeq: seqRef.current,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch {}
  }, [historyLimit, selectedModels, modelCounts, prompt, taskMode, comparePrompts, styleThemes, styleReferenceImages, apiBaseUrl, lastEditedCount, aspectRatio, proxyUrl, uiLanguage]);

  useEffect(() => {
    if (selectedAtlasItems.length > 0) return;
    setAtlasThumbnail(null);
  }, [selectedAtlasItems.length]);

  const handleSaveApiKey = useCallback(() => {
    const nextKeys = normalizeApiKeys(draftApiKeys);
    setApiKeys(nextKeys);
    setDraftApiKeys(nextKeys);
    setApiKeySavedAt(Date.now());
  }, [draftApiKeys]);

  const handleSaveGptAssistPrompt = useCallback(() => {
    if (!historyDirHandle) {
      setHistoryFolderMsg(t("history.needFolderForGpt"));
      return;
    }
    const nextPrompt = normalizeGptAssistPrompt(draftGptAssistPrompt);
    const nextStyleThemePrompt = normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt);
    const nextSendPromptText = normalizeGptAssistFlag(draftGptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
    const nextSendPromptImage = normalizeGptAssistFlag(draftGptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
    setGptAssistPrompt(nextPrompt);
    setStyleThemeAssistPrompt(nextStyleThemePrompt);
    setGptAssistSendPromptText(nextSendPromptText);
    setGptAssistSendPromptImage(nextSendPromptImage);
    setDraftGptAssistPrompt(nextPrompt);
    setDraftStyleThemeAssistPrompt(nextStyleThemePrompt);
    setDraftGptAssistSendPromptText(nextSendPromptText);
    setDraftGptAssistSendPromptImage(nextSendPromptImage);
    setGptAssistSavedAt(Date.now());
    setShowGptAssistModal(false);
  }, [draftGptAssistPrompt, draftGptAssistSendPromptImage, draftGptAssistSendPromptText, draftStyleThemeAssistPrompt, historyDirHandle, t]);

  const openTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(template.id);
    setTemplateDraft({
      title: getLocalizedTemplateTitle(template.title, template.id, uiLanguage, false),
      body: template.body || "",
      backup: template.backup || "",
      memo: template.memo || "",
    });
    setShowTemplateModal(true);
  }, [templates, historyDirHandle, uiLanguage]);

  const saveTemplateDraft = useCallback(() => {
    if (!editingTemplateId || !historyDirHandle) return;
    const title = templateDraft.title.trim() || getDefaultTemplateTitle(editingTemplateId, uiLanguage);
    const body = templateDraft.body || "";
    const backup = templateDraft.backup || "";
    const memo = templateDraft.memo || "";
    setTemplates((prev) => {
      return prev.map((item) => (item.id === editingTemplateId ? { ...item, title, body, backup, memo } : item));
    });
    if (activeTemplateId === editingTemplateId) {
      const promptA = body;
      const promptB = backup.trim() ? backup : promptA;
      if (taskMode === "compare") {
        if (comparePrompts.a !== promptA) compareAEditor.setText(promptA, { record: false });
        if (comparePrompts.b !== promptB) compareBEditor.setText(promptB, { record: false });
      } else if (prompt !== promptA) {
        promptEditor.setText(promptA, { record: false });
      }
    }
    setShowTemplateModal(false);
  }, [templateDraft, editingTemplateId, historyDirHandle, activeTemplateId, taskMode, comparePrompts.a, comparePrompts.b, prompt, compareAEditor, compareBEditor, promptEditor, uiLanguage]);

  const openStyleTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = styleTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingStyleTemplateId(template.id);
    setStyleTemplateDraft({
      title: getLocalizedTemplateTitle(template.title, template.id, uiLanguage, true),
      body: template.body || "",
    });
    setShowStyleTemplateModal(true);
  }, [styleTemplates, historyDirHandle, uiLanguage]);

  const saveStyleTemplateDraft = useCallback(() => {
    if (!editingStyleTemplateId || !historyDirHandle) return;
    const title = styleTemplateDraft.title.trim() || getDefaultStyleTemplateTitle(editingStyleTemplateId, uiLanguage);
    const body = styleTemplateDraft.body || "";
    setStyleTemplates((prev) => prev.map((item) => (item.id === editingStyleTemplateId ? { ...item, title, body } : item)));
    if (activeStyleTemplateId === editingStyleTemplateId && prompt !== body) {
      promptEditor.setText(body, { record: false });
    }
    setShowStyleTemplateModal(false);
  }, [styleTemplateDraft, editingStyleTemplateId, historyDirHandle, activeStyleTemplateId, prompt, promptEditor, uiLanguage]);

  const selectTemplateUsage = useCallback((templateId) => {
    if (!historyDirHandle) return;
    if (activeTemplateId === templateId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveTemplateId(template.id);
    const promptA = template.body || "";
    const promptB = template.backup?.trim() ? template.backup : promptA;
    if (taskMode === "compare") {
      if (comparePrompts.a !== promptA) compareAEditor.setText(promptA, { record: false });
      if (comparePrompts.b !== promptB) compareBEditor.setText(promptB, { record: false });
      return;
    }
    if (prompt !== promptA) promptEditor.setText(promptA, { record: false });
  }, [templates, taskMode, compareAEditor, compareBEditor, promptEditor, activeTemplateId, comparePrompts.a, comparePrompts.b, prompt, historyDirHandle]);

  const selectStyleTemplateUsage = useCallback((templateId) => {
    if (!historyDirHandle) return;
    if (activeStyleTemplateId === templateId) {
      setActiveStyleTemplateId(null);
      return;
    }
    const template = styleTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveStyleTemplateId(template.id);
    const nextPrompt = template.body || "";
    if (prompt !== nextPrompt) promptEditor.setText(nextPrompt, { record: false });
  }, [historyDirHandle, activeStyleTemplateId, styleTemplates, prompt, promptEditor]);

  const syncTurnToTemplate = useCallback((turn) => {
    if (!historyDirHandle) return;
    if (getTurnMode(turn) === "style") {
      if (!activeStyleTemplateId) return;
      const basePrompt = typeof turn.styleBasePrompt === "string"
        ? turn.styleBasePrompt
        : getTurnPromptVariants(turn)[0]?.prompt || "";
      setStyleTemplates((prev) =>
        prev.map((item) =>
          item.id === activeStyleTemplateId
            ? { ...item, body: basePrompt }
            : item
        )
      );
      return;
    }
    if (!activeTemplateId) return;
    const variants = getTurnPromptVariants(turn);
    const primary = variants[0]?.prompt || "";
    const backup = variants[1]?.prompt || "";
    setTemplates((prev) =>
      prev.map((item) =>
        item.id === activeTemplateId
          ? { ...item, body: primary, backup }
          : item
      )
    );
  }, [activeTemplateId, activeStyleTemplateId, historyDirHandle]);

  const runGptAssist = useCallback(async () => {
    if (gptAssistBusy) return;
    if (!proxyUrl.trim()) {
      setShowSettings(true);
      return;
    }

    const items = taskMode === "compare"
      ? [
          { key: "a", prompt: comparePrompts.a, clearedPrompt: clearPlaceholderValues(comparePrompts.a) },
          { key: "b", prompt: comparePrompts.b, clearedPrompt: clearPlaceholderValues(comparePrompts.b) },
        ]
      : [{ key: "single", prompt, clearedPrompt: clearPlaceholderValues(prompt) }];
    const targetItems = items.filter((item) => extractPlaceholderTokens(item.prompt).length > 0);
    if (!targetItems.length) {
      setHistoryFolderMsg(t("history.noPlaceholder"));
      return;
    }

    if (taskMode === "compare") {
      compareAEditor.setText(items[0].clearedPrompt, { record: false });
      compareBEditor.setText(items[1].clearedPrompt, { record: false });
    } else {
      promptEditor.setText(items[0].clearedPrompt, { record: false });
    }

    setGptAssistBusy(true);
    try {
      const rewritten = {};
      if (taskMode === "compare") {
        const sourceKey = activePromptFieldRef.current === "b" ? "b" : "a";
        const sourceItem = targetItems.find((item) => item.key === sourceKey) || targetItems[0];
        const sourceRewritten = await callTextAssistWithFallback(
          proxyUrl,
          sourceItem.clearedPrompt,
          uploadedImage,
          gptAssistPrompt,
          {
            apiKeys,
            sendPromptText: gptAssistSendPromptText,
            sendPromptImage: gptAssistSendPromptImage,
          }
        );
        const syncedReplacements = extractPlaceholderTokens(sourceRewritten);
        rewritten.a = applyPlaceholderReplacements(items[0].clearedPrompt, syncedReplacements);
        rewritten.b = applyPlaceholderReplacements(items[1].clearedPrompt, syncedReplacements);
      } else {
        const item = targetItems[0];
        rewritten[item.key] = await callTextAssistWithFallback(
          proxyUrl,
          item.clearedPrompt,
          uploadedImage,
          gptAssistPrompt,
          {
            apiKeys,
            sendPromptText: gptAssistSendPromptText,
            sendPromptImage: gptAssistSendPromptImage,
          }
        );
      }

      if (taskMode === "compare") {
        if (typeof rewritten.a === "string" && rewritten.a !== comparePrompts.a) {
          compareAEditor.setText(rewritten.a, { record: false });
        }
        if (typeof rewritten.b === "string" && rewritten.b !== comparePrompts.b) {
          compareBEditor.setText(rewritten.b, { record: false });
        }
      } else if (typeof rewritten.single === "string" && rewritten.single !== prompt) {
        promptEditor.setText(rewritten.single, { record: false });
      }

      setHistoryFolderMsg(t("history.gptRewrote", { count: Object.keys(rewritten).length }));
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(t("history.gptRewriteFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
      }
    } finally {
      setGptAssistBusy(false);
    }
  }, [gptAssistBusy, proxyUrl, taskMode, comparePrompts.a, comparePrompts.b, prompt, uploadedImage, gptAssistPrompt, gptAssistSendPromptImage, gptAssistSendPromptText, apiKeys, compareAEditor, compareBEditor, promptEditor, t]);

  const clearAllStyleThemes = useCallback(() => {
    setStyleThemes(Array.from({ length: STYLE_THEME_SLOTS }, () => ""));
  }, []);

  const runStyleThemeAssist = useCallback(async () => {
    if (styleThemeAssistBusy) return;
    if (taskMode !== "style") return;
    if (!proxyUrl.trim()) {
      setShowSettings(true);
      return;
    }
    const seed = styleThemeSeedInput.trim();
    if (!seed) {
      setHistoryFolderMsg(t("history.enterThemeSeed"));
      return;
    }

    setStyleThemeAssistBusy(true);
    try {
      const generated = await callThemeAssistWithFallback(
        proxyUrl,
        seed,
        styleThemeAssistPrompt,
        { apiKeys, sendPromptText: gptAssistSendPromptText }
      );
      if (!generated.length) {
        setHistoryFolderMsg(t("history.themeAssistInvalid"));
        return;
      }
      setStyleThemes((prev) => {
        const next = normalizeStyleThemes(prev);
        for (let index = 0; index < STYLE_THEME_SLOTS; index += 1) {
          next[index] = generated[index] || "";
        }
        return next;
      });
      setHistoryFolderMsg(t("history.generatedThemes", { count: Math.min(generated.length, STYLE_THEME_SLOTS) }));
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(t("history.themeAssistFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
      }
    } finally {
      setStyleThemeAssistBusy(false);
    }
  }, [styleThemeAssistBusy, taskMode, proxyUrl, styleThemeSeedInput, styleThemeAssistPrompt, gptAssistSendPromptText, apiKeys, t]);

  const toggleModel = useCallback((id) => {
    setSelectedModels((prev) => {
      if (taskMode === "style") {
        return prev.includes(id) ? prev.filter((m) => m !== id) : [id];
      }
      return prev.includes(id)
        ? prev.filter((m) => m !== id)
        : prev.length >= 6
        ? prev
        : [...prev, id];
    });
  }, [taskMode]);

  useEffect(() => {
    if (taskMode !== "style") return;
    if (selectedModels.length <= 1) return;
    setSelectedModels((prev) => prev.slice(0, 1));
  }, [taskMode, selectedModels.length]);

  useEffect(() => {
    if (taskMode === "style") return;
    setShowInputImageModal(false);
    setShowInputImageEditor(false);
    setShowStyleReferenceModal(false);
  }, [taskMode]);

  const setModelCount = useCallback((id, value) => {
    const n = Math.max(1, Math.min(8, Number(value) || 1));
    setModelCounts((prev) => ({ ...prev, [id]: n }));
    setLastEditedCount(n);
  }, []);

  const syncSelectedCounts = useCallback(() => {
    if (!selectedModels.length) return;
    const targetCount = Math.max(1, Math.min(8, Number(lastEditedCount) || 1));
    setModelCounts((prev) => {
      const next = { ...prev };
      selectedModels.forEach((id) => {
        next[id] = targetCount;
      });
      return next;
    });
  }, [selectedModels, lastEditedCount]);

  const handleFileChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    if (!files.length) return;
    const encoded = await Promise.all(files.map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    setUploadedInputImages(safeEncoded);
    setUploadedImage(safeEncoded[0]);
    setUploadedPreview(safeEncoded[0]);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const removeImage = useCallback(() => {
    setUploadedInputImages([]);
    setUploadedImage(null);
    setUploadedPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const inputImageList = useMemo(() => {
    const list = Array.isArray(uploadedInputImages)
      ? uploadedInputImages.filter((item) => typeof item === "string" && item)
      : [];
    if (list.length) return list.slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    if (typeof uploadedImage === "string" && uploadedImage) return [uploadedImage];
    return [];
  }, [uploadedInputImages, uploadedImage]);

  const openInputImageEditor = useCallback((index = 0) => {
    if (!inputImageList.length) return;
    const safeIndex = Math.max(0, Math.min(inputImageList.length - 1, Number(index) || 0));
    setInputImageEditorIndex(safeIndex);
    setShowInputImageEditor(true);
  }, [inputImageList]);

  const styleImageList = useMemo(
    () =>
      (Array.isArray(styleReferenceImages) ? styleReferenceImages : [])
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean)
        .slice(0, MAX_STYLE_REFERENCE_IMAGES),
    [styleReferenceImages]
  );

  const appendInputImageFiles = useCallback(async (files) => {
    const incoming = Array.isArray(files) ? files : [];
    if (!incoming.length) return;
    const encoded = await Promise.all(incoming.slice(0, MAX_INPUT_IMAGES_PER_BATCH).map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    const base = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .filter((item) => typeof item === "string" && item);
    const next = [...base, ...safeEncoded].slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    setUploadedInputImages(next);
    setUploadedImage(next[0] || null);
    setUploadedPreview(next[0] || null);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadedInputImages]);

  const removeInputImageAt = useCallback((index = 0) => {
    const base = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .filter((item) => typeof item === "string" && item);
    if (!base.length) {
      setUploadedInputImages([]);
      setUploadedImage(null);
      setUploadedPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const safeIndex = Math.max(0, Math.min(base.length - 1, Number(index) || 0));
    const next = base.filter((_, idx) => idx !== safeIndex);
    setUploadedInputImages(next);
    setUploadedImage(next[0] || null);
    setUploadedPreview(next[0] || null);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadedInputImages]);

  const confirmInputImageEditor = useCallback((nextImages) => {
    const safeImages = (Array.isArray(nextImages) ? nextImages : [])
      .filter((item) => typeof item === "string" && item.startsWith("data:image/"))
      .slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    setUploadedInputImages(safeImages);
    setUploadedImage(safeImages[0] || null);
    setUploadedPreview(safeImages[0] || null);
    setShowInputImageEditor(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const appendStyleReferenceFiles = useCallback(async (files) => {
    const incoming = Array.isArray(files) ? files : [];
    if (!incoming.length) return;
    const remaining = Math.max(0, MAX_STYLE_REFERENCE_IMAGES - styleImageList.length);
    if (!remaining) return;
    const picked = incoming.slice(0, remaining);
    const encoded = await Promise.all(picked.map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    setStyleReferenceImages((prev) => {
      const base = (Array.isArray(prev) ? prev : [])
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean);
      return [...base, ...safeEncoded].slice(0, MAX_STYLE_REFERENCE_IMAGES);
    });
  }, [styleImageList.length]);

  const removeStyleReferenceAt = useCallback((index) => {
    setStyleReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const updateStyleTheme = useCallback((index, value) => {
    setStyleThemes((prev) => {
      const next = normalizeStyleThemes(prev);
      next[index] = typeof value === "string" ? value : String(value ?? "");
      return next;
    });
  }, []);

  const updateComparePrompt = useCallback((key, value) => {
    const nextValue = typeof value === "string" ? value : String(value ?? "");
    if (key === "a") {
      const prevTokens = extractPlaceholderTokens(comparePrompts.a);
      const nextTokens = extractPlaceholderTokens(nextValue);
      compareAEditor.setText(nextValue);
      const changed = prevTokens.length !== nextTokens.length || prevTokens.some((v, index) => v !== nextTokens[index]);
      if (changed) {
        const synced = applyPlaceholderReplacements(comparePrompts.b, nextTokens);
        if (synced !== comparePrompts.b) compareBEditor.setText(synced, { record: false });
      }
      return;
    }
    if (key === "b") {
      const prevTokens = extractPlaceholderTokens(comparePrompts.b);
      const nextTokens = extractPlaceholderTokens(nextValue);
      compareBEditor.setText(nextValue);
      const changed = prevTokens.length !== nextTokens.length || prevTokens.some((v, index) => v !== nextTokens[index]);
      if (changed) {
        const synced = applyPlaceholderReplacements(comparePrompts.a, nextTokens);
        if (synced !== comparePrompts.a) compareAEditor.setText(synced, { record: false });
      }
    }
  }, [compareAEditor, compareBEditor, comparePrompts.a, comparePrompts.b]);

  const selectedImageKeys = useMemo(
    () => new Set(selectedAtlasItems.map((item) => item.key)),
    [selectedAtlasItems]
  );

  const toggleImageSelection = useCallback((payload) => {
    if (!payload?.key) return;
    setAtlasThumbnail(null);
    setSelectedAtlasItems((prev) => {
      const existing = prev.find((item) => item.key === payload.key);
      if (existing) {
        return prev.filter((item) => item.key !== payload.key);
      }
      if (prev.length >= MAX_ATLAS_SELECTED_IMAGES) {
        setShowSelectionLimitModal(true);
        return prev;
      }
      return [
        ...prev,
        {
          ...payload,
          selectedAt: Date.now(),
        },
      ];
    });
  }, []);

  const runResultImageAction = useCallback(async (payload, mode = "replace") => {
    const key = payload?.key;
    const turnId = payload?.turnId;
    const modelId = payload?.modelId;
    const promptKey = payload?.promptKey || "single";
    const imageIndex = Math.max(1, Number(payload?.index) || 1);
    if (!key || !turnId || !modelId) return;

    const targetTurn = turns.find((item) => item.id === turnId);
    if (!targetTurn) {
      setHistoryFolderMsg(t("history.retryTurnNotFound"));
      return;
    }
    const targetResult = (targetTurn.results || []).find((result) => isSameResultTask(result, modelId, promptKey));
    if (!targetResult) {
      setHistoryFolderMsg(t("history.retryResultNotFound"));
      return;
    }
    const model = IMAGE_MODELS.find((item) => item.id === modelId);
    if (!model) {
      setHistoryFolderMsg(t("history.retryModelMissing"));
      return;
    }

    const promptVariants = getTurnPromptVariants(targetTurn);
    const matchedVariant = promptVariants.find((item) => item.key === promptKey) || promptVariants[0];
    const promptText =
      typeof targetResult.promptText === "string"
        ? targetResult.promptText
        : matchedVariant?.prompt || targetTurn.prompt || "";
    const turnImageInputs = normalizeImageInputs(targetTurn.referenceImage, targetTurn.styleReferenceImages);
    const replaceAt = imageIndex - 1;
    const taskKey = buildTurnTaskKey(turnId, modelId, promptKey);
    const busyKeys = [taskKey, key].filter(Boolean);

    setRetryingImageKeys((prev) => {
      const next = new Set(prev);
      busyKeys.forEach((item) => next.add(item));
      return next;
    });

    setTurns((prev) =>
      prev.map((turn) =>
        turn.id !== turnId
          ? turn
          : {
              ...turn,
              folderSyncedAt: null,
              results: (turn.results || []).map((result) =>
                isSameResultTask(result, modelId, promptKey)
                  ? {
                      ...result,
                      status: "loading",
                      error: null,
                      requestedCount:
                        mode === "append"
                          ? Math.max(1, Number(result.requestedCount || 1)) + 1
                          : result.requestedCount,
                    }
                  : result
              ),
            }
      )
    );

    try {
      const requestConfig = getApiConfigForModel(model, targetTurn.apiKeys || apiKeys);
      const generated = await generateImage(targetTurn.proxyUrl || proxyUrl, model, promptText, targetTurn.referenceImage, {
        count: 1,
        ...requestConfig,
        aspectRatio: normalizeAspectRatio(targetTurn.aspectRatio ?? targetTurn.geminiAspectRatio ?? aspectRatio),
        imageInputs: turnImageInputs,
      });
      const nextImage = Array.isArray(generated) && generated.length ? generated[0] : null;
      if (!nextImage) throw new Error("No images returned");

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id !== turnId
            ? turn
            : {
                ...turn,
                folderSyncedAt: null,
                results: (turn.results || []).map((result) => {
                  if (!isSameResultTask(result, modelId, promptKey)) return result;
                  const baseImages = Array.isArray(result.images) ? [...result.images] : [];
                  if (mode === "append") {
                    baseImages.push(nextImage);
                  } else if (replaceAt >= 0 && replaceAt < baseImages.length) {
                    baseImages[replaceAt] = nextImage;
                  } else {
                    baseImages.splice(0, baseImages.length, nextImage);
                  }
                  return {
                    ...result,
                    status: "success",
                    error: null,
                    images: baseImages,
                  };
                }),
              }
        )
      );
      if (mode === "replace" && key) {
        setSelectedAtlasItems((prev) =>
          prev.map((item) => (item.key === key ? { ...item, image: nextImage } : item))
        );
      }
      setAtlasThumbnail(null);
      setHistoryFolderMsg(mode === "append" ? t("history.appendedOne") : t("history.replacedOne"));
    } catch (err) {
      const message = err?.message || "未知错误";
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id !== turnId
            ? turn
            : {
                ...turn,
                folderSyncedAt: null,
                results: (turn.results || []).map((result) => {
                  if (!isSameResultTask(result, modelId, promptKey)) return result;
                  const hasImages = Array.isArray(result.images) && result.images.length > 0;
                  return hasImages
                    ? {
                        ...result,
                        status: "success",
                      }
                    : {
                        ...result,
                        status: "error",
                        error: message,
                      };
                }),
              }
        )
      );
      setHistoryFolderMsg(t("history.retryFailed", { error: localizeRuntimeMessage(message, t) }));
    } finally {
      setRetryingImageKeys((prev) => {
        const next = new Set(prev);
        busyKeys.forEach((item) => next.delete(item));
        return next;
      });
    }
  }, [turns, proxyUrl, apiKeys, aspectRatio, t]);

  const retryImage = useCallback((payload) => runResultImageAction(payload, "replace"), [runResultImageAction]);
  const appendResultImage = useCallback((payload) => runResultImageAction(payload, "append"), [runResultImageAction]);

  const runSplitForImage = useCallback(async (payload, options = {}) => {
    const openModal = options.openModal !== false;
    const defaultRenderMode = normalizeSplitRenderMode(options.renderMode);
    const defaultShapeMode = normalizeSplitShapeMode(options.shapeMode);
    const defaultEnhance = options.enhance !== false;
    const defaultUseRemoved = options.useRemovedSource === true;
    const resetUndo = options.resetUndo !== false;
    const imageKey = payload?.key || `split-${Date.now()}`;
    const rawImage = payload?.image;
    if (!rawImage) return;
    if (openModal) setShowSplitModal(true);
    setSplitRenderMode(defaultRenderMode);
    setSplitShapeMode(defaultShapeMode);
    setSplitEnhanceEnabled(defaultEnhance);
    setSplitUseRemovedSource(defaultUseRemoved);
    setSplitBusy(true);
    setSplitExporting(false);
    setSplitEnhancing(defaultEnhance);
    setSplitSelectedItemIds(new Set());
    if (resetUndo) setSplitUndoStack([]);
    setSplitStatusTone("info");
    setSplitStatusText(t("split.detecting"));
    setSplitContext((prev) => ({
      ...prev,
      ...payload,
      key: imageKey,
      image: rawImage,
      originalImage: "",
      removedImage: "",
      removedBaseImage: "",
      removedEnhancedImage: "",
      processBaseImage: "",
      processImage: "",
      items: [],
      sourceImage: "",
      width: 0,
      height: 0,
    }));
    setSplittingImageKeys((prev) => {
      const next = new Set(prev);
      next.add(imageKey);
      return next;
    });
    try {
      const normalized = await resolveSplitSourceDataUrl(rawImage, { apiBaseUrl, proxyUrl });
      if (!normalized || /^https?:\/\//i.test(normalized)) {
        throw new Error(t("errors.failedToFetch"));
      }
      const originalSplit = await splitImageBySubjects(normalized);
      let splitResult = originalSplit;
      if (defaultUseRemoved) {
        splitResult = await splitImageBySubjects(originalSplit.removedImage);
      }
      const splitTarget = defaultUseRemoved ? originalSplit.removedImage : normalized;
      const nextBackgroundColor = originalSplit.backgroundColor || DEFAULT_SPLIT_BG_COLOR;
      setSplitBackgroundColor(nextBackgroundColor);
      const preparedItems = await buildSplitItemDisplayList(
        splitResult.items.map((item, index) => ({ ...item, index: index + 1 })),
        {
          renderMode: defaultRenderMode,
          shapeMode: defaultShapeMode,
          backgroundColor: nextBackgroundColor,
          enhance: defaultEnhance,
        }
      );
      const removedDisplay = await buildRemovedDisplayImage(originalSplit.removedImage, {
        enhance: defaultEnhance,
        cachedEnhanced: "",
      });
      setSplitContext((prev) => ({
        ...prev,
        ...payload,
        key: imageKey,
        image: splitTarget,
        originalImage: normalized,
        sourceImage: splitResult.sourceImage,
        processBaseImage: splitResult.processImage || splitResult.sourceImage,
        processImage: splitResult.processImage || splitResult.sourceImage,
        removedBaseImage: originalSplit.removedImage,
        removedEnhancedImage: removedDisplay.enhancedImage,
        removedImage: removedDisplay.image,
        items: preparedItems,
        width: splitResult.width,
        height: splitResult.height,
      }));
      if (preparedItems.length) {
        setSplitStatusTone("info");
        setSplitStatusText(
          defaultEnhance
            ? t("split.enhanced", { count: preparedItems.length })
            : t("split.count", { count: preparedItems.length })
        );
      } else {
        setSplitStatusTone("info");
        setSplitStatusText(t("split.noSubjects"));
      }
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      setSplitContext((prev) => ({
        ...prev,
        ...payload,
        key: imageKey,
        image: rawImage,
        originalImage: "",
        sourceImage: "",
        processBaseImage: "",
        processImage: "",
        removedImage: "",
        removedBaseImage: "",
        removedEnhancedImage: "",
        items: [],
      }));
    } finally {
      setSplitBusy(false);
      setSplitEnhancing(false);
      setSplittingImageKeys((prev) => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  }, [apiBaseUrl, proxyUrl, t]);

  useEffect(() => {
    const sourceImage = splitContext.sourceImage;
    const processBaseImage = splitContext.processBaseImage || splitContext.processImage || sourceImage;
    if (!sourceImage && !processBaseImage) return;
    let cancelled = false;
    (async () => {
      try {
        const nextProcessImage = await buildSplitProcessPreviewForShape(
          sourceImage,
          processBaseImage,
          splitContext.items,
          splitShapeMode
        );
        if (cancelled || !nextProcessImage) return;
        setSplitContext((prev) => {
          if (prev.sourceImage !== sourceImage) return prev;
          if ((prev.processBaseImage || prev.processImage || prev.sourceImage) !== processBaseImage) return prev;
          if (prev.processImage === nextProcessImage) return prev;
          return {
            ...prev,
            processImage: nextProcessImage,
          };
        });
      } catch {
        // Keep the last preview if regenerating the process image fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [splitContext.items, splitContext.processBaseImage, splitContext.sourceImage, splitShapeMode]);

  const openSplitModalForImage = useCallback((payload) => {
    runSplitForImage(payload, {
      openModal: true,
      renderMode: DEFAULT_SPLIT_RENDER_MODE,
      shapeMode: DEFAULT_SPLIT_SHAPE_MODE,
      enhance: true,
      useRemovedSource: false,
      resetUndo: true,
    });
  }, [runSplitForImage]);

  const reSplitCurrentImage = useCallback(() => {
    const source = splitContext.originalImage || splitContext.sourceImage || splitContext.image;
    if (!source) return;
    runSplitForImage(
      {
        ...splitContext,
        image: source,
        key: splitContext.key || `split-${Date.now()}`,
      },
      {
        openModal: false,
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: splitUseRemovedSource,
        resetUndo: true,
      }
    );
  }, [splitContext, runSplitForImage, splitRenderMode, splitShapeMode, splitEnhanceEnabled, splitUseRemovedSource]);

  const uploadSplitImageFromModal = useCallback(async (imageDataUrl, file) => {
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) return;
    const fallbackStem = typeof file?.name === "string" && file.name.trim()
      ? safeName(file.name.replace(/\.[^.]+$/, ""))
      : `upload_${Date.now()}`;
    await runSplitForImage(
      {
        key: `split-upload-${Date.now()}`,
        image: imageDataUrl,
        fileStem: fallbackStem,
        turnId: "",
        turnSeq: 0,
        modelId: "",
        modelName: "",
        promptKey: "single",
        theme: "",
        index: 1,
      },
      {
        openModal: true,
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: splitUseRemovedSource,
        resetUndo: true,
      }
    );
  }, [runSplitForImage, splitRenderMode, splitShapeMode, splitEnhanceEnabled, splitUseRemovedSource]);

  const toggleSplitSourceMode = useCallback((useRemovedSource) => {
    const nextUseRemoved = useRemovedSource === true;
    if (nextUseRemoved === splitUseRemovedSource) return;
    const source = splitContext.originalImage || splitContext.sourceImage || splitContext.image;
    if (!source) return;
    runSplitForImage(
      {
        ...splitContext,
        image: splitContext.originalImage || source,
        key: splitContext.key || `split-${Date.now()}`,
      },
      {
        openModal: false,
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: nextUseRemoved,
        resetUndo: true,
      }
    );
  }, [splitUseRemovedSource, splitContext, runSplitForImage, splitRenderMode, splitShapeMode, splitEnhanceEnabled]);

  const setSplitRenderModeMode = useCallback(async (mode) => {
    const nextMode = normalizeSplitRenderMode(mode);
    if (nextMode === splitRenderMode) return;
    setSplitRenderMode(nextMode);
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    setSplitBusy(true);
    try {
      const nextItems = await buildSplitItemDisplayList(items, {
        renderMode: nextMode,
        shapeMode: splitShapeMode,
        backgroundColor: splitBackgroundColor,
        enhance: splitEnhanceEnabled,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitRenderMode, splitContext.items, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const setSplitShapeModeMode = useCallback(async (mode) => {
    const nextMode = normalizeSplitShapeMode(mode);
    if (nextMode === splitShapeMode) return;
    setSplitShapeMode(nextMode);
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    setSplitBusy(true);
    try {
      const nextItems = await buildSplitItemDisplayList(items, {
        renderMode: splitRenderMode,
        shapeMode: nextMode,
        backgroundColor: splitBackgroundColor,
        enhance: splitEnhanceEnabled,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitShapeMode, splitContext.items, splitRenderMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const toggleSplitItemSelected = useCallback((itemId) => {
    if (!itemId) return;
    setSplitSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const mergeSelectedSplitItems = useCallback(async () => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    const selected = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => splitSelectedItemIds.has(item.id));
    if (selected.length < 2) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.mergeNeedTwo"));
      return;
    }
    setSplitBusy(true);
    try {
      const pickedItems = selected.map(({ item }) => item);
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let areaSum = 0;
      for (let i = 0; i < pickedItems.length; i += 1) {
        const item = pickedItems[i];
        const x = Number(item.x) || 0;
        const y = Number(item.y) || 0;
        const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + baseWidth);
        maxY = Math.max(maxY, y + baseHeight);
        areaSum += Number(item.area) || 0;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        throw new Error("Invalid merge bounds");
      }
      const mergedBounds = {
        x: Math.max(0, Math.floor(minX)),
        y: Math.max(0, Math.floor(minY)),
      };
      mergedBounds.width = Math.max(1, Math.ceil(maxX) - mergedBounds.x);
      mergedBounds.height = Math.max(1, Math.ceil(maxY) - mergedBounds.y);
      const [rectImage, edgeImage, polygonImage] = await Promise.all([
        composeMergedSplitField(pickedItems, "rect", mergedBounds),
        composeMergedSplitField(pickedItems, "edge", mergedBounds),
        composeMergedSplitField(pickedItems, "polygon", mergedBounds),
      ]);
      const mergedId = `subject-merge-${Date.now()}`;
      const mergedRaw = {
        id: mergedId,
        index: 1,
        x: mergedBounds.x,
        y: mergedBounds.y,
        width: mergedBounds.width,
        height: mergedBounds.height,
        baseWidth: mergedBounds.width,
        baseHeight: mergedBounds.height,
        area: areaSum || mergedBounds.width * mergedBounds.height,
        rectImage: rectImage || edgeImage || polygonImage,
        edgeImage: edgeImage || polygonImage || rectImage,
        polygonImage: polygonImage || edgeImage || rectImage,
        transparentImage: edgeImage || polygonImage || rectImage,
        enhancedRectImage: "",
        enhancedRectWidth: 0,
        enhancedRectHeight: 0,
        enhancedEdgeImage: "",
        enhancedEdgeWidth: 0,
        enhancedEdgeHeight: 0,
        enhancedPolygonImage: "",
        enhancedPolygonWidth: 0,
        enhancedPolygonHeight: 0,
        paintedRectImage: "",
        paintedEdgeImage: "",
        paintedPolygonImage: "",
        paintedEnhancedRectImage: "",
        paintedEnhancedEdgeImage: "",
        paintedEnhancedPolygonImage: "",
        paintedBackgroundColor: "",
        image: edgeImage || polygonImage || rectImage,
      };
      const selectedIdSet = new Set(pickedItems.map((item) => item.id));
      const firstIndex = Math.min(...selected.map((entry) => entry.idx));
      const remaining = items.filter((item) => !selectedIdSet.has(item.id));
      remaining.splice(firstIndex, 0, mergedRaw);
      const nextItems = await buildSplitItemDisplayList(
        remaining.map((item, index) => ({ ...item, index: index + 1 })),
        {
          renderMode: splitRenderMode,
          shapeMode: splitShapeMode,
          backgroundColor: splitBackgroundColor,
          enhance: splitEnhanceEnabled,
        }
      );
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
      setSplitSelectedItemIds(new Set([mergedId]));
      setSplitStatusTone("info");
      setSplitStatusText(t("split.merged", { count: selected.length }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitContext.items, splitSelectedItemIds, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const deleteSplitItem = useCallback((itemId) => {
    if (!itemId) return;
    setSplitSelectedItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    setSplitContext((prev) => {
      const items = Array.isArray(prev.items) ? prev.items : [];
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return prev;
      const removed = items[index];
      setSplitUndoStack((stack) => {
        const next = [...stack, { item: removed, index }];
        return next.slice(-120);
      });
      const nextItems = items.filter((item) => item.id !== itemId);
      return {
        ...prev,
        items: nextItems.map((item, itemIndex) => ({ ...item, index: itemIndex + 1 })),
      };
    });
    setSplitStatusTone("info");
    setSplitStatusText(t("split.deletedOne"));
  }, [t]);

  const undoDeleteSplitItem = useCallback(() => {
    setSplitUndoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      if (!last?.item) return next;
      setSplitContext((ctx) => {
        const current = Array.isArray(ctx.items) ? [...ctx.items] : [];
        const insertAt = Math.max(0, Math.min(Number(last.index) || current.length, current.length));
        current.splice(insertAt, 0, last.item);
        return {
          ...ctx,
          items: current.map((item, index) => ({ ...item, index: index + 1 })),
        };
      });
      setSplitStatusTone("info");
      setSplitStatusText(t("split.undoDone"));
      return next;
    });
  }, [t]);

  const setSplitEnhanceMode = useCallback(async (targetEnhance) => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    const hasRemoved = !!splitContext.removedBaseImage;
    if (!items.length && !hasRemoved) return;
    const nextEnhance = targetEnhance !== false;
    if (nextEnhance === splitEnhanceEnabled) return;
    setSplitEnhanceEnabled(nextEnhance);
    setSplitEnhancing(nextEnhance);
    setSplitStatusTone("info");
    setSplitStatusText(nextEnhance ? t("split.enhancing") : t("split.qualityOriginal"));
    try {
      const sourceItems = nextEnhance
        ? items.map((item) => ({
            ...item,
            enhancedRectImage: "",
            enhancedRectWidth: 0,
            enhancedRectHeight: 0,
            enhancedEdgeImage: "",
            enhancedEdgeWidth: 0,
            enhancedEdgeHeight: 0,
            enhancedPolygonImage: "",
            enhancedPolygonWidth: 0,
            enhancedPolygonHeight: 0,
            paintedEnhancedRectImage: "",
            paintedEnhancedEdgeImage: "",
            paintedEnhancedPolygonImage: "",
          }))
        : items;
      const nextItems = await buildSplitItemDisplayList(sourceItems, {
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        backgroundColor: splitBackgroundColor,
        enhance: nextEnhance,
      });
      const removedDisplay = await buildRemovedDisplayImage(splitContext.removedBaseImage, {
        enhance: nextEnhance,
        cachedEnhanced: nextEnhance ? "" : splitContext.removedEnhancedImage,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
        removedImage: removedDisplay.image,
        removedEnhancedImage: removedDisplay.enhancedImage,
      }));
      setSplitStatusTone("info");
      if (nextEnhance) {
        setSplitStatusText(t("split.enhanced", { count: nextItems.length }));
      } else {
        setSplitStatusText(t("split.qualityOriginal"));
      }
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      setSplitEnhanceEnabled((prev) => !prev);
    } finally {
      setSplitEnhancing(false);
    }
  }, [splitContext.items, splitContext.removedBaseImage, splitContext.removedEnhancedImage, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const exportSplitItems = useCallback(async () => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.exportNoItems"));
      return;
    }
    if (!supportsFileSystemAccess()) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.unsupported"));
      return;
    }
    setSplitExporting(true);
    setSplitStatusTone("info");
    setSplitStatusText("");
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const stem = safeName(splitContext.fileStem || "image");
      const folderName = `split-${stem}-${Date.now()}`;
      const splitDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
      const sourceData = dataUrlToBytes(splitContext.originalImage || splitContext.sourceImage);
      if (sourceData) {
        await writeBinaryFile(splitDir, `original.${sourceData.ext}`, sourceData.bytes);
      }
      const removedData = dataUrlToBytes(splitContext.removedImage);
      if (removedData) {
        await writeBinaryFile(splitDir, `removed_background.${removedData.ext}`, removedData.bytes);
      }
      const manifestItems = [];
      for (let index = 0; index < Math.min(items.length, MAX_SPLIT_EXPORT_ITEMS); index += 1) {
        const item = items[index];
        const exportDataUrl = item.image;
        const data = dataUrlToBytes(exportDataUrl);
        if (!data) continue;
        const fileName = `${String(index + 1).padStart(3, "0")}_subject.${data.ext}`;
        await writeBinaryFile(splitDir, fileName, data.bytes);
        manifestItems.push({
          index: index + 1,
          file: fileName,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          area: item.area || 0,
        });
      }
      await writeTextFile(
        splitDir,
        "manifest.json",
        JSON.stringify(
          {
            createdAt: Date.now(),
            source: {
              width: splitContext.width || 0,
              height: splitContext.height || 0,
              file: sourceData ? `original.${sourceData.ext}` : "",
            },
            splitSource: splitUseRemovedSource ? "removed-background" : "original",
            renderMode: splitRenderMode,
            shapeMode: splitShapeMode,
            backgroundColor: splitBackgroundColor,
            enhanced: splitEnhanceEnabled,
            itemCount: manifestItems.length,
            items: manifestItems,
          },
          null,
          2
        )
      );
      const successText = t("split.exported", { folder: folderName, count: manifestItems.length });
      setSplitStatusTone("info");
      setSplitStatusText(successText);
      setHistoryFolderMsg(successText);
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.pickFolderFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitExporting(false);
    }
  }, [splitContext, splitUseRemovedSource, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const clearAllSelections = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSelectedAtlasItems([]);
    setAtlasThumbnail(null);
  }, []);

  const reorderAtlasSelection = useCallback((fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setSelectedAtlasItems((prev) => {
      const fromIndex = prev.findIndex((item) => item.key === fromKey);
      const toIndex = prev.findIndex((item) => item.key === toKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setAtlasThumbnail(null);
  }, []);

  const generateAtlasThumbnail = useCallback(async () => {
    if (!selectedAtlasItems.length) {
      setHistoryFolderMsg(t("history.selectImagesFirst"));
      return;
    }
    setAtlasBusy(true);
    try {
      const ordered = [...selectedAtlasItems];
      const sources = await Promise.all(
        ordered.map(async (item) => {
          const normalized = normalizeImageValue(item.image, apiBaseUrl);
          if (!normalized) return null;
          const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
          return normalizeImageValue(proxied, apiBaseUrl);
        })
      );
      const thumbDataUrl = await createAtlasThumbnailDataUrl(sources.filter(Boolean), { rows: 3, cellWidth: 256, cellHeight: 256 });
      if (!thumbDataUrl) {
        setHistoryFolderMsg(t("history.thumbnailFailed"));
        return;
      }
      setAtlasThumbnail(thumbDataUrl);
      setHistoryFolderMsg(t("history.thumbnailReady", { count: ordered.length }));
    } catch (err) {
      setHistoryFolderMsg(t("history.thumbnailFailedDetail", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      setAtlasBusy(false);
    }
  }, [selectedAtlasItems, apiBaseUrl, proxyUrl, t]);

  const exportAtlasSelection = useCallback(async () => {
    if (!historyDirHandle) {
      setHistoryFolderMsg(t("history.selectHistoryFolderFirst"));
      return;
    }
    if (!selectedAtlasItems.length) {
      setHistoryFolderMsg(t("history.selectExportImagesFirst"));
      return;
    }

    setAtlasBusy(true);
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedExport"));
        return;
      }

      const ordered = [...selectedAtlasItems];
      let thumbDataUrl = atlasThumbnail;
      if (!thumbDataUrl) {
        const sources = await Promise.all(
          ordered.map(async (item) => {
            const normalized = normalizeImageValue(item.image, apiBaseUrl);
            if (!normalized) return null;
            const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
            return normalizeImageValue(proxied, apiBaseUrl);
          })
        );
        thumbDataUrl = await createAtlasThumbnailDataUrl(sources.filter(Boolean), { rows: 3, cellWidth: 256, cellHeight: 256 });
        if (thumbDataUrl) setAtlasThumbnail(thumbDataUrl);
      }

      const atlasRoot = await historyDirHandle.getDirectoryHandle("atlas", { create: true });
      const folderName = formatAtlasFolderName(ordered);
      const atlasDir = await atlasRoot.getDirectoryHandle(folderName, { create: true });
      const manifestItems = [];

      for (let index = 0; index < ordered.length; index += 1) {
        const item = ordered[index];
        const normalized = normalizeImageValue(item.image, apiBaseUrl);
        if (!normalized) continue;
        const stem = buildAtlasImageFileStem(item, index);
        let fileName = `${stem}.png`;
        if (normalized.startsWith("data:image/")) {
          const data = dataUrlToBytes(normalized);
          if (!data) continue;
          fileName = `${stem}.${data.ext}`;
          await writeBinaryFile(atlasDir, fileName, data.bytes);
        } else if (/^https?:\/\//i.test(normalized)) {
          const remote = await fetchImageBytes(normalized);
          fileName = `${stem}.${remote.ext}`;
          await writeBinaryFile(atlasDir, fileName, remote.bytes);
        } else {
          continue;
        }
        manifestItems.push({
          index: index + 1,
          file: fileName,
          theme: item.theme || "",
          turnId: item.turnId,
          turnSeq: item.turnSeq,
          modelId: item.modelId,
          modelName: item.modelName || "",
          promptKey: item.promptKey,
        });
      }

      if (thumbDataUrl) {
        const thumb = dataUrlToBytes(thumbDataUrl);
        if (thumb) {
          await writeBinaryFile(atlasDir, `thumbnail.${thumb.ext}`, thumb.bytes);
        }
      }

      await writeTextFile(
        atlasDir,
        "manifest.json",
        JSON.stringify(
          {
            createdAt: Date.now(),
            itemCount: manifestItems.length,
            maxSelectable: MAX_ATLAS_SELECTED_IMAGES,
            rows: 3,
            items: manifestItems,
          },
          null,
          2
        )
      );
      setHistoryFolderMsg(t("history.atlasExported", { folder: folderName }));
    } catch (err) {
      setHistoryFolderMsg(t("history.exportFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      setAtlasBusy(false);
    }
  }, [historyDirHandle, selectedAtlasItems, atlasThumbnail, apiBaseUrl, proxyUrl, t]);

  const loadHistoryFromFolder = useCallback(async (dirHandle) => {
    if (!dirHandle) return false;
    const canRead = await ensureDirectoryPermission(dirHandle, false);
    if (!canRead) {
      setHistoryFolderMsg(t("history.folderReadDenied"));
      return false;
    }
    const apiConfig = await loadApiConfigFromLocalFolder(dirHandle);
    const loadedApiKeys = normalizeApiKeys(apiConfig);
    setApiKeys(loadedApiKeys);
    setDraftApiKeys(loadedApiKeys);
    setApiKeySavedAt(apiConfig.exists ? Date.now() : null);
    const loadedGptAssistConfig = await loadGptAssistFromLocalFolder(dirHandle);
    setGptAssistPrompt(loadedGptAssistConfig.prompt);
    setDraftGptAssistPrompt(loadedGptAssistConfig.prompt);
    setGptAssistSendPromptText(loadedGptAssistConfig.sendPromptText);
    setDraftGptAssistSendPromptText(loadedGptAssistConfig.sendPromptText);
    setGptAssistSendPromptImage(loadedGptAssistConfig.sendPromptImage);
    setDraftGptAssistSendPromptImage(loadedGptAssistConfig.sendPromptImage);
    setStyleThemeAssistPrompt(loadedGptAssistConfig.styleThemePrompt);
    setDraftStyleThemeAssistPrompt(loadedGptAssistConfig.styleThemePrompt);
    setGptAssistSavedAt(Date.now());
    const templatePayload = await loadTemplatesFromLocalFolder(dirHandle);
    if (templatePayload) {
      setTemplates(templatePayload.templates);
      setActiveTemplateId(templatePayload.activeTemplateId);
    } else {
      const fallbackTemplates = normalizeTemplates(DEFAULT_TEMPLATES);
      setTemplates(fallbackTemplates);
      setActiveTemplateId(null);
    }
    const styleTemplatePayload = await loadStyleTemplatesFromLocalFolder(dirHandle);
    if (styleTemplatePayload) {
      setStyleTemplates(styleTemplatePayload.templates);
      setActiveStyleTemplateId(styleTemplatePayload.activeTemplateId || styleTemplatePayload.templates[0]?.id || null);
    } else {
      const fallbackStyleTemplates = normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES);
      setStyleTemplates(fallbackStyleTemplates);
      setActiveStyleTemplateId(fallbackStyleTemplates[0]?.id || null);
    }
    const loadedTurns = await loadTurnsFromLocalFolder(dirHandle);
    setSelectedAtlasItems([]);
    setAtlasThumbnail(null);
    const nextTurns = [...loadedTurns].sort((a, b) => b.seq - a.seq);
    setTurns(nextTurns);
    setHiddenTurnIds([]);
    setActiveTurnId(nextTurns[0]?.id || null);
    if (loadedTurns.length) {
      const maxSeq = loadedTurns.reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
      seqRef.current = maxSeq + 1;
    } else {
      seqRef.current = 1;
    }
    setHistoryFolderMsg(
      templatePayload
        ? t("history.folderLoadedWithTemplates", {
            turns: loadedTurns.length,
            templates: templatePayload.templates.length,
            styleTemplates: styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES,
          })
        : t("history.folderLoadedInitialized", {
            turns: loadedTurns.length,
            templates: MAX_TEMPLATES,
            styleTemplates: styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES,
          })
    );
    return true;
  }, [t]);

  const handlePickHistoryFolder = useCallback(async (options = {}) => {
    const source = options?.source === "auto" ? "auto" : "manual";
    if (!supportsFileSystemAccess()) {
      setHistoryFolderMsg(t("history.browserUnsupported"));
      return;
    }
    if (isPickingHistoryFolderRef.current) return;
    if (source === "auto") {
      hasAutoPromptedHistoryFolderRef.current = true;
    }
    isPickingHistoryFolderRef.current = true;
    setIsPickingHistoryFolder(true);
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const loaded = await loadHistoryFromFolder(dirHandle);
      if (!loaded) return;
      setHistoryDirHandle(dirHandle);
      setHistoryDirName(dirHandle.name || "");
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      if (/File picker already active/i.test(String(err?.message || ""))) return;
      setHistoryFolderMsg(t("history.pickFolderFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      isPickingHistoryFolderRef.current = false;
      setIsPickingHistoryFolder(false);
    }
  }, [loadHistoryFromFolder, t]);

  const handleGenerate = useCallback(async () => {
    if (!proxyUrl.trim()) { setShowSettings(true); return; }
    const effectiveModelIds = taskMode === "style" ? selectedModels.slice(0, 1) : selectedModels;
    const promptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes);
    const hasPromptInput = promptVariants.some((variant) => variant.prompt.trim());
    const inputBatch = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean)
      .slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    const fallbackInput = typeof uploadedImage === "string" && uploadedImage ? [uploadedImage] : [];
    const resolvedInputBatch = inputBatch.length ? inputBatch : fallbackInput;
    const hasImageInput = !!resolvedInputBatch.length || (taskMode === "style" && styleReferenceImages.length > 0);
    if (!effectiveModelIds.length || (!hasPromptInput && !hasImageInput)) return;

    const now = Date.now();
    const turnModelCounts = effectiveModelIds.reduce((acc, mid) => {
      acc[mid] = Math.max(1, Math.min(8, Number(modelCounts[mid]) || 1));
      return acc;
    }, {});
    const normalizedPromptVariants = promptVariants.map((variant) => ({
      ...variant,
      prompt: variant.prompt || "",
    }));
    const turnInputImages = resolvedInputBatch.length ? resolvedInputBatch : [null];
    const queuedTurns = turnInputImages.map((referenceImage, index) => ({
      id: now + index * 1000 + Math.floor(Math.random() * 1000),
      seq: seqRef.current + index,
      createdAt: now + index,
      mode: taskMode,
      prompt: taskMode === "compare" ? "" : (prompt || ""),
      styleBasePrompt: taskMode === "style" ? (prompt || "") : "",
      styleThemes: taskMode === "style" ? normalizeStyleThemes(styleThemes) : [],
      promptVariants: normalizedPromptVariants,
      apiBaseUrl: resolveApiBaseUrl(apiBaseUrl),
      apiKeys: normalizeApiKeys(apiKeys),
      aspectRatio: normalizeAspectRatio(aspectRatio),
      referenceImage,
      styleReferenceImages: taskMode === "style" ? styleReferenceImages.slice(0, MAX_STYLE_REFERENCE_IMAGES) : [],
      selectedModelIds: [...effectiveModelIds],
      modelCounts: turnModelCounts,
      proxyUrl: proxyUrl.trim(),
      status: "queued",
      results: normalizedPromptVariants.flatMap((variant) =>
        effectiveModelIds.map((mid) => ({
          modelId: mid,
          modelName: IMAGE_MODELS.find((m) => m.id === mid)?.name || mid,
          promptKey: variant.key,
          promptLabel: variant.label,
          promptText: variant.prompt || "",
          requestedCount: turnModelCounts[mid] || 1,
          status: "loading",
          images: [],
          error: null,
        }))
      ),
    }));
    const displayTurns = [...queuedTurns].reverse();
    seqRef.current += queuedTurns.length;
    setActiveTurnId(displayTurns[0]?.id || null);
    setTurns((prev) => [...displayTurns, ...prev]);
    if (queuedTurns.length > 1) {
      setHistoryFolderMsg(t("history.createdTasks", { count: queuedTurns.length }));
    }
    if (taskMode === "compare") {
      compareAEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
      compareBEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
    } else {
      promptEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
    }
  }, [proxyUrl, selectedModels, modelCounts, taskMode, prompt, comparePrompts, styleThemes, styleReferenceImages, apiKeys, apiBaseUrl, aspectRatio, uploadedInputImages, uploadedImage, compareAEditor, compareBEditor, promptEditor, t]);

  const cancelModelTask = useCallback((turnId, modelId, promptKey = "single") => {
    const key = `${turnId}:${modelId}:${promptKey}`;
    const ctl = controllersRef.current[key];
    if (ctl) {
      try { ctl.abort(); } catch {}
      delete controllersRef.current[key];
    }
    setTurns((prev) =>
      prev.map((t) =>
        t.id !== turnId
          ? t
          : {
              ...t,
              results: t.results.map((r) =>
                isSameResultTask(r, modelId, promptKey) && r.status === "loading"
                  ? { ...r, status: "cancelled", error: t("status.cancelledByUser") }
                  : r
              ),
            }
      )
    );
  }, [t]);

  const removeTurnFromPage = useCallback((turnId) => {
    const targetTurn = turns.find((item) => item.id === turnId) || null;
    setTurns((prev) => prev.filter((t) => t.id !== turnId));
    setHiddenTurnIds((prev) => prev.filter((id) => id !== turnId));
    setSelectedAtlasItems((prev) => prev.filter((item) => item.turnId !== turnId));
    setRetryingImageKeys((prev) => {
      const next = new Set();
      prev.forEach((key) => {
        if (!String(key).startsWith(`${turnId}:`)) next.add(key);
      });
      return next;
    });
    setAtlasThumbnail(null);
    setActiveTurnId((prev) => (prev === turnId ? null : prev));
    Object.keys(controllersRef.current).forEach((key) => {
      if (!key.startsWith(`${turnId}:`)) return;
      try { controllersRef.current[key].abort(); } catch {}
      delete controllersRef.current[key];
    });
    return targetTurn;
  }, [turns]);

  const hideTurn = useCallback((turnId) => {
    removeTurnFromPage(turnId);
  }, [removeTurnFromPage]);

  const deleteTurn = useCallback(async (turnId) => {
    const targetTurn = removeTurnFromPage(turnId);

    if (!historyDirHandle || !targetTurn) return;
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedDelete"));
        return;
      }
      const dirName = getTurnDirName(targetTurn);
      await historyDirHandle.removeEntry(dirName, { recursive: true });
      setHistoryFolderMsg(t("history.deletedLocal", { seq: targetTurn.seq }));
    } catch (err) {
      setHistoryFolderMsg(t("history.deleteLocalFailed", { seq: targetTurn?.seq || "?", error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    }
  }, [historyDirHandle, removeTurnFromPage, t]);

  const reuseTurn = useCallback((turn) => {
    const promptVariants = getTurnPromptVariants(turn);
    const mode = getTurnMode(turn);
    const primaryPrompt = promptVariants[0]?.prompt || turn.prompt || "";
    if (mode === "style") {
      setTaskMode("style");
      promptEditor.resetText(typeof turn.styleBasePrompt === "string" ? turn.styleBasePrompt : primaryPrompt);
      compareAEditor.resetText(DEFAULT_COMPARE_PROMPTS.a);
      compareBEditor.resetText(DEFAULT_COMPARE_PROMPTS.b);
      setStyleThemes(normalizeStyleThemes(turn.styleThemes));
      setStyleReferenceImages(
        (Array.isArray(turn.styleReferenceImages) ? turn.styleReferenceImages : [])
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean)
          .slice(0, MAX_STYLE_REFERENCE_IMAGES)
      );
    } else if (mode === "compare") {
      setTaskMode("compare");
      promptEditor.resetText(primaryPrompt);
      compareAEditor.resetText(promptVariants[0]?.prompt || "");
      compareBEditor.resetText(promptVariants[1]?.prompt || "");
      setStyleThemes(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
      setStyleReferenceImages([]);
    } else {
      setTaskMode("single");
      promptEditor.resetText(primaryPrompt);
      compareAEditor.resetText(DEFAULT_COMPARE_PROMPTS.a);
      compareBEditor.resetText(DEFAULT_COMPARE_PROMPTS.b);
      setStyleThemes(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
      setStyleReferenceImages([]);
    }
    const nextSelectedModels =
      Array.isArray(turn.selectedModelIds) && turn.selectedModelIds.length
        ? mode === "style"
          ? turn.selectedModelIds.slice(0, 1)
          : turn.selectedModelIds
        : mode === "style"
        ? DEFAULT_SELECTED_MODELS.slice(0, 1)
        : DEFAULT_SELECTED_MODELS;
    setSelectedModels(nextSelectedModels);
    if (turn.modelCounts && typeof turn.modelCounts === "object") {
      setModelCounts((prev) => ({ ...prev, ...turn.modelCounts }));
      const firstSelectedModel = nextSelectedModels[0] || null;
      if (firstSelectedModel && typeof turn.modelCounts[firstSelectedModel] === "number") {
        setLastEditedCount(Math.max(1, Math.min(8, Number(turn.modelCounts[firstSelectedModel]) || 1)));
      }
    }
    if (turn.apiKeys && typeof turn.apiKeys === "object") {
      const nextApiKeys = normalizeApiKeys(turn.apiKeys);
      setApiKeys(nextApiKeys);
      setDraftApiKeys(nextApiKeys);
    }
    setApiBaseUrl(resolveApiBaseUrl(turn.apiBaseUrl));
    setAspectRatio(normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio));
    if (turn.referenceImage) {
      setUploadedInputImages([turn.referenceImage]);
      setUploadedImage(turn.referenceImage);
      setUploadedPreview(turn.referenceImage);
    } else {
      setUploadedInputImages([]);
      setUploadedImage(null);
      setUploadedPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [compareAEditor, compareBEditor, promptEditor]);

  useEffect(() => {
    if (isProcessing) return;
    const queued = turns.filter((t) => t.status === "queued").sort((a, b) => a.seq - b.seq);
    const next = queued[0];
    if (!next) return;

    (async () => {
      setIsProcessing(true);
      if (typeof window !== "undefined") window.__apiBaseUrl = next.apiBaseUrl || DEFAULT_API_BASE_URL;
      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "running", startedAt: Date.now() } : t)));
      const promptVariants = getTurnPromptVariants(next);
      const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
      const turnImageInputs = normalizeImageInputs(next.referenceImage, next.styleReferenceImages);
      const resultSeeds =
        Array.isArray(next.results) && next.results.length
          ? next.results
          : promptVariants.flatMap((variant) =>
              (next.selectedModelIds || []).map((modelId) => ({
                modelId,
                promptKey: variant.key,
                promptLabel: variant.label,
                promptText: variant.prompt || "",
                requestedCount: next.modelCounts?.[modelId] || 1,
              }))
            );
      const queuedTasks = resultSeeds.map((result) => {
        const promptKey = getResultPromptKey(result);
        const promptVariant = promptLookup.get(promptKey) || promptVariants[0];
        return {
          modelId: result.modelId,
          promptKey,
          promptLabel: result.promptLabel || promptVariant?.label || "PROMPT",
          promptText: typeof result.promptText === "string" ? result.promptText : promptVariant?.prompt || next.prompt || "",
          requestedCount: result.requestedCount || next.modelCounts?.[result.modelId] || 1,
        };
      });

      const patchTaskResult = (task, updater) => {
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id !== next.id
              ? turn
              : {
                  ...turn,
                  results: turn.results.map((result) => {
                    if (!isSameResultTask(result, task.modelId, task.promptKey)) return result;
                    const base = {
                      ...result,
                      promptLabel: task.promptLabel,
                      promptText: task.promptText,
                    };
                    if (typeof updater === "function") return updater(base);
                    return { ...base, ...updater };
                  }),
                }
          )
        );
      };

      await Promise.allSettled(
        queuedTasks.map(async (task) => {
          const model = IMAGE_MODELS.find((m) => m.id === task.modelId);
          if (!model) {
            throw new Error(`Model not found: ${task.modelId}`);
          }
          const key = `${next.id}:${task.modelId}:${task.promptKey}`;
          const controller = new AbortController();
          controllersRef.current[key] = controller;
          try {
            const requestedCount = Math.max(1, Number(task.requestedCount || next.modelCounts?.[task.modelId] || 1));
            let partialImages = [];
            let lastNonAbortError = null;
            const requestConfig = getApiConfigForModel(model, next.apiKeys || apiKeys);

            for (let index = 0; index < requestedCount; index += 1) {
              try {
                const generated = await generateImage(next.proxyUrl, model, task.promptText, next.referenceImage, {
                  signal: controller.signal,
                  count: 1,
                  ...requestConfig,
                  aspectRatio: normalizeAspectRatio(next.aspectRatio ?? next.geminiAspectRatio),
                  imageInputs: turnImageInputs,
                });
                const nextImage = Array.isArray(generated) && generated.length ? generated[0] : null;
                if (!nextImage) {
                  lastNonAbortError = new Error("No images returned");
                  continue;
                }
                partialImages = [...partialImages, nextImage];
                patchTaskResult(task, (current) => ({
                  ...current,
                  status: "loading",
                  error: null,
                  images: [...(Array.isArray(current.images) ? current.images : []), nextImage],
                }));
              } catch (err) {
                if (isAbortError(err)) throw err;
                lastNonAbortError = err;
              }
            }

            if (!partialImages.length) {
              throw lastNonAbortError || new Error("No images returned");
            }

            patchTaskResult(task, {
              status: "success",
              error: null,
              images: partialImages,
            });
          } catch (err) {
            patchTaskResult(
              task,
              isAbortError(err)
                ? (current) => ({ ...current, status: "cancelled", error: t("status.cancelledByUser") })
                : (current) => ({ ...current, status: "error", error: err?.message || t("common.unknownError") })
            );
          } finally {
            delete controllersRef.current[key];
          }
        })
      );

      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "done", endedAt: Date.now() } : t)));
      setIsProcessing(false);
    })();
  }, [turns, isProcessing, apiKeys]);

  useEffect(() => {
    if (!historyDirHandle) return;
    const pending = turns.filter((t) => t.status === "done" && !t.folderSyncedAt && !savingToFolderRef.current.has(t.id));
    if (!pending.length) return;

    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedAutosave"));
        return;
      }

      for (const turn of pending) {
        savingToFolderRef.current.add(turn.id);
        try {
          await saveTurnToLocalFolder(historyDirHandle, turn);
          setTurns((prev) => prev.map((t) => (t.id === turn.id ? { ...t, folderSyncedAt: Date.now(), folderSyncError: null } : t)));
          setHistoryFolderMsg(t("history.wroteLocal", { seq: turn.seq }));
        } catch (err) {
          setTurns((prev) =>
            prev.map((t) => (t.id === turn.id ? { ...t, folderSyncError: err?.message || "write failed" } : t))
          );
          setHistoryFolderMsg(t("history.writeLocalFailed", { seq: turn.seq, error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
        } finally {
          savingToFolderRef.current.delete(turn.id);
        }
      }
    })();
  }, [turns, historyDirHandle, t]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveTemplatesToLocalFolder(historyDirHandle, templates, activeTemplateId);
      } catch {}
    })();
  }, [historyDirHandle, templates, activeTemplateId]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveStyleTemplatesToLocalFolder(historyDirHandle, styleTemplates, activeStyleTemplateId);
      } catch {}
    })();
  }, [historyDirHandle, styleTemplates, activeStyleTemplateId]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveGptAssistToLocalFolder(
          historyDirHandle,
          gptAssistPrompt,
          styleThemeAssistPrompt,
          gptAssistSendPromptText,
          gptAssistSendPromptImage
        );
      } catch {}
    })();
  }, [historyDirHandle, gptAssistPrompt, styleThemeAssistPrompt, gptAssistSendPromptText, gptAssistSendPromptImage]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveApiConfigToLocalFolder(historyDirHandle, apiKeys);
      } catch {}
    })();
  }, [historyDirHandle, apiKeys]);

  const visibleTurns = turns.filter((turn) => !hiddenTurnIds.includes(turn.id));
  const activeTurn =
    visibleTurns.find((t) => t.id === activeTurnId) ||
    visibleTurns.filter((t) => t.status === "running" || t.status === "queued").sort((a, b) => a.seq - b.seq)[0] ||
    [...visibleTurns].sort((a, b) => b.seq - a.seq)[0] ||
    null;
  const historyTurns = visibleTurns.filter((t) => !activeTurn || t.id !== activeTurn.id).sort((a, b) => b.seq - a.seq);
  const visibleHistory = historyTurns.slice(0, historyLimit);
  const hasMoreHistory = historyTurns.length > historyLimit;
  const previewGalleryItems = useMemo(
    () => [activeTurn, ...visibleHistory].filter(Boolean).flatMap((turn) => buildTurnPreviewItems(turn)),
    [activeTurn, visibleHistory]
  );
  const queueCount = visibleTurns.filter((t) => t.status === "queued").length;
  const runningCount = visibleTurns.filter((t) => t.status === "running").length;
  const hasAnySuccess = visibleTurns.some((t) => t.results?.some((r) => r.status === "success" && r.images?.length));
  const folderSupported = supportsFileSystemAccess();
  const templatesEnabled = !!historyDirHandle;
  const composerPromptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes);
  const hasPromptInput = composerPromptVariants.some((variant) => variant.prompt.trim());
  const hasImageInput = inputImageList.length > 0 || (taskMode === "style" && styleReferenceImages.length > 0);
  const hasPlaceholderInComposer =
    taskMode === "compare"
      ? composerPromptVariants.some((variant) => extractPlaceholderTokens(variant.prompt).length > 0)
      : extractPlaceholderTokens(prompt).length > 0;
  const canRunGptAssist = !gptAssistBusy && !!proxyUrl.trim() && hasPlaceholderInComposer;
  const hasAnyStyleThemeValue = styleThemes.some((item) => typeof item === "string" && item.trim());
  const canRunStyleThemeAssist =
    taskMode === "style" &&
    !styleThemeAssistBusy &&
    !!proxyUrl.trim() &&
    !!styleThemeSeedInput.trim();
  const canGenerate = selectedModels.length > 0 && (hasPromptInput || hasImageInput);
  const inputImageCount = inputImageList.length;
  const inputPrimaryPreview = inputImageList[0] || null;
  const canEditInputImages = inputImageCount > 0;
  const normalizedApiKeys = normalizeApiKeys(apiKeys);
  const normalizedDraftApiKeys = normalizeApiKeys(draftApiKeys);
  const isApiKeyDirty =
    normalizedDraftApiKeys.deerapi !== normalizedApiKeys.deerapi ||
    normalizedDraftApiKeys.bailian !== normalizedApiKeys.bailian;
  const isGptAssistPromptDirty =
    normalizeGptAssistPrompt(draftGptAssistPrompt) !== normalizeGptAssistPrompt(gptAssistPrompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt) !== normalizeStyleThemeAssistPrompt(styleThemeAssistPrompt) ||
    normalizeGptAssistFlag(draftGptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) !== normalizeGptAssistFlag(gptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) ||
    normalizeGptAssistFlag(draftGptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE) !== normalizeGptAssistFlag(gptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const canSaveGptAssistPrompt = !!historyDirHandle;
  const apiKeySaveStateText = isApiKeyDirty
    ? t("common.unsavedChanges")
    : apiKeySavedAt
    ? t("common.savedAt", { time: formatUiTime(apiKeySavedAt, uiLanguage) })
    : t("common.saved");
  const gptAssistSaveStateText = !historyDirHandle
    ? t("history.selectHistoryFolderFirst")
    : isGptAssistPromptDirty
    ? t("common.unsavedChanges")
    : gptAssistSavedAt
    ? t("common.savedAt", { time: formatUiTime(gptAssistSavedAt, uiLanguage) })
    : t("common.saved");

  const openPreviewImage = useCallback((payload) => {
    if (!payload) {
      setPreviewImage(null);
      return;
    }
    const normalized = normalizePreviewPayload(payload);
    if (!normalized.outputSrc) return;
    if (normalized.imageKey) {
      const galleryIndex = previewGalleryItems.findIndex((item) => item.imageKey === normalized.imageKey);
      if (galleryIndex >= 0) {
        setPreviewImage({
          ...normalized,
          galleryItems: previewGalleryItems,
          currentIndex: galleryIndex,
        });
        return;
      }
    }
    setPreviewImage(normalized);
  }, [previewGalleryItems]);

  useEffect(() => {
    if (!folderSupported || historyDirHandle || typeof window === "undefined") return;
    if (hasAutoPromptedHistoryFolderRef.current) return;
    hasAutoPromptedHistoryFolderRef.current = true;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      handlePickHistoryFolder({ source: "auto" });
    });
    return () => {
      cancelled = true;
    };
  }, [folderSupported, handlePickHistoryFolder, historyDirHandle]);

  return (
    <I18nContext.Provider value={{ uiLanguage, t }}>
    <div style={{ ...S.root, fontWeight: uiLanguage === "zh" ? 360 : undefined }}>
      <div style={S.bgGrain} />
      <header style={S.header}>
        <div style={S.logoArea}>
          <div style={S.logoCube}><span style={{ fontSize: 20 }}>◈</span></div>
          <div>
            <h1 style={S.title}>POLYIMAGE</h1>
            <p style={S.subtitle}>{t("header.subtitle")}</p>
          </div>
        </div>
        <div style={S.headerActions}>
          <nav style={S.modeNav}>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "single" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("single");
              }}
            >
              {t("nav.single")}
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "compare" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("compare");
              }}
            >
              {t("nav.compare")}
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "style" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("style");
              }}
            >
              {t("nav.style")}
            </button>
          </nav>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(activePage === "help" ? S.apiSwitchBtnActive : null) }}
              onClick={() => setActivePage("help")}
            >
              {t("nav.help")}
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showGptAssistModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftGptAssistPrompt(gptAssistPrompt);
                setDraftGptAssistSendPromptText(gptAssistSendPromptText);
                setDraftGptAssistSendPromptImage(gptAssistSendPromptImage);
                setDraftStyleThemeAssistPrompt(styleThemeAssistPrompt);
                setShowGptAssistModal(true);
              }}
            >
              {t("nav.gptPrompt")}
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showApiModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftApiKeys(normalizeApiKeys(apiKeys));
                setShowApiModal(true);
              }}
            >
              {t("nav.api")}
            </button>
          </div>
          <button style={S.settingsBtn} onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      <main style={S.main}>
        {activePage === "help" ? (
          <HelpPage />
        ) : (
          <>
        <section style={{ marginBottom: 24 }}>
          <div style={taskMode === "style" ? S.inputGridStyle : S.inputGrid}>
            <div>
              <div style={S.promptHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "compare" ? t("workspace.prompts") : t("workspace.prompt")}</label>
                <div style={S.promptHeadActions}>
                  {taskMode === "compare" && <span style={S.inputHint}>{t("workspace.compareHint")}</span>}
                  <button
                    type="button"
                    style={S.placeholderBtn}
                    onClick={insertPlaceholderChip}
                    title={t("template.insertPlaceholder")}
                  >
                    【】
                  </button>
                  <button
                    type="button"
                    style={{ ...S.gptAssistBtn, opacity: canRunGptAssist ? 1 : 0.5, cursor: canRunGptAssist ? "pointer" : "not-allowed" }}
                    onClick={runGptAssist}
                    disabled={!canRunGptAssist}
                    title={hasPlaceholderInComposer ? t("workspace.rewriteByGpt") : t("workspace.noPlaceholder")}
                  >
                    👤
                  </button>
                </div>
              </div>
              {taskMode === "compare" ? (
                <div style={S.comparePromptGrid}>
                  <div>
                    <TokenPromptInput
                      value={comparePrompts.a}
                      onChange={(next) => updateComparePrompt("a", next)}
                      onKeyDown={compareAEditor.handleKeyDown}
                      onFocus={() => { activePromptFieldRef.current = "a"; }}
                      editorRef={compareAInputRef}
                      placeholder={t("workspace.promptAPlaceholder")}
                      rows={4}
                    />
                  </div>
                  <div>
                    <TokenPromptInput
                      value={comparePrompts.b}
                      onChange={(next) => updateComparePrompt("b", next)}
                      onKeyDown={compareBEditor.handleKeyDown}
                      onFocus={() => { activePromptFieldRef.current = "b"; }}
                      editorRef={compareBInputRef}
                      placeholder={t("workspace.promptBPlaceholder")}
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <TokenPromptInput
                  value={prompt}
                  onChange={(next) => promptEditor.setText(next)}
                  onKeyDown={promptEditor.handleKeyDown}
                  onFocus={() => { activePromptFieldRef.current = "single"; }}
                  editorRef={promptInputRef}
                  placeholder={t("workspace.promptPlaceholder")}
                  rows={4}
                />
              )}
            </div>
            <div style={S.refColumn}>
              {taskMode === "style" ? (
                <>
                  <div style={S.uploadPairRow}>
                    <div style={S.uploadPairCol}>
                      <div style={S.uploadPairTopLabel}>{t("workspace.reference")} ({styleImageList.length}/{MAX_STYLE_REFERENCE_IMAGES})</div>
                      <button type="button" style={S.uploadPairBox} onClick={() => setShowStyleReferenceModal(true)}>
                        <div style={S.inputImagesGrid}>
                          {Array.from({ length: MAX_STYLE_REFERENCE_IMAGES }, (_, index) => {
                            const image = styleImageList[index];
                            return image ? (
                              <div key={`style-image-slot-${index}`} style={S.inputImagesCell}>
                                <img src={image} alt={`Reference ${index + 1}`} style={S.inputImagesThumb} />
                              </div>
                            ) : (
                              <div key={`style-empty-slot-${index}`} style={S.inputImagesEmpty}>
                                +
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    </div>
                    <div style={S.uploadPairCol}>
                      <div style={S.uploadPairTopLabel}>{t("workspace.input")}</div>
                      <div
                        style={S.uploadPairBox}
                        role="button"
                        tabIndex={0}
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            fileRef.current?.click();
                          }
                        }}
                      >
                        {inputImageCount > 0 && <span style={S.inputCountBadge}>{inputImageCount}</span>}
                        {canEditInputImages && (
                          <button
                            type="button"
                            style={S.inputEditBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              setShowInputImageModal(true);
                            }}
                          >
                            {t("common.edit")}
                          </button>
                        )}
                        {canEditInputImages && (
                          <button
                            type="button"
                            style={S.inputDrawBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              openInputImageEditor(0);
                            }}
                            title={t("imageEditor.title")}
                          >
                            ✎
                          </button>
                        )}
                        <div style={S.uploadPairBody}>
                          {inputPrimaryPreview ? (
                            <img src={inputPrimaryPreview} alt="Input" style={S.uploadPairMainThumb} />
                          ) : (
                            <div style={S.inputImagesEmpty}>+</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label style={S.label}>{t("workspace.referenceImage")}</label>
                  {inputPrimaryPreview ? (
                    <div
                      style={S.uploadedBox}
                      role="button"
                      tabIndex={0}
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          fileRef.current?.click();
                        }
                      }}
                    >
                      {inputImageCount > 0 && <span style={S.inputCountBadge}>{inputImageCount}</span>}
                      {canEditInputImages && (
                        <button
                          type="button"
                          style={S.inputEditBtn}
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowInputImageModal(true);
                          }}
                        >
                          {t("common.edit")}
                        </button>
                      )}
                      {canEditInputImages && (
                        <button
                          type="button"
                          style={S.inputDrawBtn}
                          onClick={(event) => {
                            event.stopPropagation();
                            openInputImageEditor(0);
                          }}
                          title={t("imageEditor.title")}
                        >
                          ✎
                        </button>
                      )}
                      <img src={inputPrimaryPreview} alt="Ref" style={S.uploadedThumb} />
                      <button
                        type="button"
                        style={S.removeBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeImage();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button type="button" style={S.dropZone} onClick={() => fileRef.current?.click()}>
                      <span style={{ fontSize: 28, opacity: 0.4 }}>+</span>
                      <span style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{t("common.upload")}</span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      if (files.length) await appendInputImageFiles(files);
                      event.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </>
              )}
              {taskMode === "style" && (
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) await appendInputImageFiles(files);
                    event.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              )}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <div style={taskMode === "style" ? S.modelTemplateGridStyle : S.modelTemplateGrid}>
            <div style={{ ...S.modelsPanel, ...(taskMode === "style" ? S.modelsPanelStyle : null) }}>
              <div style={S.modelsHeadRow}>
                <label style={{ ...S.label, marginBottom: 0 }}>
                  {t("workspace.models")} <span style={{ color: "#888", fontWeight: 400 }}>({selectedModels.length}/{taskMode === "style" ? 1 : 6})</span>
                </label>
                <button style={S.syncBtn} onClick={syncSelectedCounts} disabled={!selectedModels.length}>
                  {t("workspace.syncCount")}
                </button>
              </div>
              <div style={taskMode === "style" ? S.modelGridStyle : S.modelGrid}>
                {IMAGE_MODELS.map((m) => (
                  <ModelChip
                    key={m.id}
                    model={m}
                    selected={selectedModels.includes(m.id)}
                    onToggle={toggleModel}
                    disabled={taskMode === "style" ? selectedModels.length >= 1 : selectedModels.length >= 6}
                    count={modelCounts[m.id] || 1}
                    onCountChange={setModelCount}
                    styleMode={taskMode === "style"}
                  />
                ))}
              </div>
              <div style={S.imageSizePanel}>
                <label style={{ ...S.label, marginBottom: 6 }}>{t("workspace.imageRatio")}</label>
                <div style={S.imageSizeGroup}>
                  <div style={S.imageSizeBtnRow}>
                    {ASPECT_RATIO_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        style={{ ...S.imageSizeBtn, ...(aspectRatio === option.value ? S.imageSizeBtnActive : null) }}
                        onClick={() => setAspectRatio(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <aside style={S.templatePanel}>
              <div style={S.templatePanelHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "style" ? t("workspace.styleTemplates") : t("workspace.templates")}</label>
              </div>
              {taskMode === "style" ? (
                <>
                  <div style={S.styleTemplateList}>
                    {styleTemplates.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          ...S.templateItem,
                          ...(item.id === activeStyleTemplateId ? S.templateItemActive : null),
                          ...(!templatesEnabled ? S.templateItemDisabled : null),
                        }}
                      onClick={() => {
                        if (!templatesEnabled) return;
                        selectStyleTemplateUsage(item.id);
                      }}
                    >
                        <span style={S.templateItemTitle}>{getLocalizedTemplateTitle(item.title, item.id, uiLanguage, true)}</span>
                        <span style={S.templateActions}>
                          <button
                            type="button"
                            style={S.templateEditBtn}
                            disabled={!templatesEnabled}
                            onClick={(event) => {
                              event.stopPropagation();
                            if (!templatesEnabled) return;
                            openStyleTemplateEditor(item.id);
                          }}
                          title={t("template.editStyle")}
                        >
                            ✎
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={S.styleThemesPanel}>
                    <div style={S.styleThemesHeadRow}>
                      <label style={{ ...S.label, marginBottom: 0 }}>{t("workspace.themes")}</label>
                      <button
                        type="button"
                        style={{ ...S.zipBtn, padding: "6px 10px", fontSize: 11, opacity: hasAnyStyleThemeValue ? 1 : 0.5, cursor: hasAnyStyleThemeValue ? "pointer" : "not-allowed" }}
                        onClick={clearAllStyleThemes}
                        disabled={!hasAnyStyleThemeValue}
                      >
                        {t("workspace.clearAll")}
                      </button>
                    </div>
                    <div style={S.styleThemeAssistRow}>
                      <input
                        style={S.styleThemeAssistInput}
                        value={styleThemeSeedInput}
                        onChange={(event) => setStyleThemeSeedInput(event.target.value)}
                        placeholder={t("workspace.themeSeedPlaceholder")}
                      />
                      <button
                        type="button"
                        style={{ ...S.apiSaveBtn, padding: "0 12px", height: 30, opacity: canRunStyleThemeAssist ? 1 : 0.5, cursor: canRunStyleThemeAssist ? "pointer" : "not-allowed" }}
                        onClick={runStyleThemeAssist}
                        disabled={!canRunStyleThemeAssist}
                      >
                        {styleThemeAssistBusy ? "..." : "GPT 12"}
                      </button>
                    </div>
                    <div style={S.styleThemesGrid}>
                      {styleThemes.map((theme, index) => (
                        <input
                          key={`theme-${index + 1}`}
                          style={S.styleThemeInput}
                          value={theme}
                          onChange={(event) => updateStyleTheme(index, event.target.value)}
                          placeholder={t("workspace.themePlaceholder", { index: index + 1 })}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={S.templateList}>
                  {templates.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        ...S.templateItem,
                        ...(item.id === activeTemplateId ? S.templateItemActive : null),
                        ...(!templatesEnabled ? S.templateItemDisabled : null),
                      }}
                      onClick={() => {
                        if (!templatesEnabled) return;
                        selectTemplateUsage(item.id);
                      }}
                    >
                      <span style={S.templateItemTitle}>{getLocalizedTemplateTitle(item.title, item.id, uiLanguage, false)}</span>
                      <span style={S.templateActions}>
                        <button
                          type="button"
                          style={S.templateEditBtn}
                          disabled={!templatesEnabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!templatesEnabled) return;
                            openTemplateEditor(item.id);
                          }}
                          title={t("template.edit")}
                        >
                          ✎
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </section>

        <div style={S.genRow}>
          <button style={{ ...S.genBtn, opacity: canGenerate ? 1 : 0.5 }}
            disabled={!canGenerate} onClick={handleGenerate}>
            {isProcessing
              ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={S.btnSpin} /> {t("workspace.runningQueued", { running: runningCount, queued: queueCount })}</span>
              : taskMode === "compare"
              ? t("workspace.enqueueCompare")
              : taskMode === "style"
              ? t("workspace.enqueueStyle")
              : t("workspace.enqueueTask")}
          </button>
          {hasAnySuccess && <button style={S.zipBtn} onClick={() => downloadAllAsZip(turns)}>{t("workspace.downloadAll")}</button>}
        </div>
        <div style={S.folderRow}>
          <button
            style={S.zipBtn}
            onClick={() => handlePickHistoryFolder({ source: "manual" })}
            disabled={!folderSupported || isPickingHistoryFolder}
          >
            {historyDirHandle ? t("workspace.switchHistoryFolder") : t("workspace.selectHistoryFolder")}
          </button>
          {historyDirHandle && (
            <button style={S.zipBtn} onClick={() => loadHistoryFromFolder(historyDirHandle)}>
              {t("workspace.reloadHistory")}
            </button>
          )}
          <span style={S.folderHint}>
            {folderSupported
              ? historyDirName
                ? t("workspace.connected", { name: historyDirName })
                : t("workspace.noFolderSelected")
              : t("workspace.folderUnsupported")}
          </span>
        </div>
        <div style={S.atlasRow}>
          <span style={S.atlasCount}>{t("workspace.selectedCount", { count: selectedAtlasItems.length, max: MAX_ATLAS_SELECTED_IMAGES })}</span>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={clearAllSelections}
            disabled={!selectedAtlasItems.length || atlasBusy}
          >
            {t("workspace.clearSelections")}
          </button>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: historyDirHandle && selectedAtlasItems.length ? 1 : 0.5, cursor: historyDirHandle && selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={exportAtlasSelection}
            disabled={!historyDirHandle || !selectedAtlasItems.length || atlasBusy}
          >
            {t("workspace.exportAtlas")}
          </button>
          {taskMode === "style" && (
            <button
              type="button"
              style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
              onClick={() => setShowAtlasThumbnailModal(true)}
              disabled={!selectedAtlasItems.length || atlasBusy}
            >
              {t("workspace.thumbnail")}
            </button>
          )}
          {atlasThumbnail && (
            <button
              type="button"
              style={S.atlasThumbBtn}
              onClick={() => setShowAtlasThumbnailModal(true)}
              title={t("atlas.openEditor")}
            >
              <img src={atlasThumbnail} alt={t("workspace.thumbnail")} style={S.atlasThumbImg} />
            </button>
          )}
        </div>
        {!!historyFolderMsg && <div style={S.folderMsg}>{historyFolderMsg}</div>}

        {activeTurn && (
          <section style={{ animation: "fadeIn 0.3s ease", marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              {t("workspace.currentDialog")}
            </h3>
            <TurnPanel
              turn={activeTurn}
              onPreview={openPreviewImage}
              onCancelModel={cancelModelTask}
              onDelete={deleteTurn}
              onReuse={reuseTurn}
              onHide={hideTurn}
              onSyncTemplate={syncTurnToTemplate}
              canSyncTemplate={templatesEnabled && (getTurnMode(activeTurn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
              selectedImageKeys={selectedImageKeys}
              onToggleImageSelect={toggleImageSelection}
              onRetryImage={retryImage}
              onAppendImage={appendResultImage}
              onSplitImage={openSplitModalForImage}
              retryingImageKeys={retryingImageKeys}
              splittingImageKeys={splittingImageKeys}
              compactStyleHistory={false}
              truncatePromptText={false}
              showModelSummary={true}
              enableInlineReferenceViewer={true}
            />
          </section>
        )}

        {historyTurns.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              {t("workspace.historyDialogs")}
            </h3>
            <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)", padding: 12 }}>
              {visibleHistory.map((turn) => (
                <div key={turn.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TurnPanel
                    turn={turn}
                    onPreview={openPreviewImage}
                    onCancelModel={cancelModelTask}
                    onDelete={deleteTurn}
                    onReuse={reuseTurn}
                    onHide={hideTurn}
                    onSyncTemplate={syncTurnToTemplate}
                    canSyncTemplate={templatesEnabled && (getTurnMode(turn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
                    selectedImageKeys={selectedImageKeys}
                    onToggleImageSelect={toggleImageSelection}
                    onRetryImage={retryImage}
                    onAppendImage={appendResultImage}
                    onSplitImage={openSplitModalForImage}
                    retryingImageKeys={retryingImageKeys}
                    splittingImageKeys={splittingImageKeys}
                    compactStyleHistory={false}
                    truncatePromptText={true}
                    showModelSummary={false}
                    enableInlineReferenceViewer={true}
                  />
                </div>
              ))}
              {hasMoreHistory && (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  <button style={S.zipBtn} onClick={() => setHistoryLimit((n) => n + 4)}>{t("workspace.loadMore")}</button>
                </div>
              )}
            </div>
          </section>
        )}
          </>
        )}
      </main>

      <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} proxyUrl={proxyUrl} setProxyUrl={setProxyUrl} uiLanguage={uiLanguage} setUiLanguage={setUiLanguage} />
      <ApiKeyModal
        show={showApiModal}
        onClose={() => setShowApiModal(false)}
        apiKeys={apiKeys}
        draftApiKeys={draftApiKeys}
        setDraftApiKeys={setDraftApiKeys}
        onSave={handleSaveApiKey}
        saveStateText={apiKeySaveStateText}
      />
      <GptAssistModal
        show={showGptAssistModal}
        onClose={() => setShowGptAssistModal(false)}
        prompt={gptAssistPrompt}
        draftPrompt={draftGptAssistPrompt}
        setDraftPrompt={setDraftGptAssistPrompt}
        sendPromptText={gptAssistSendPromptText}
        draftSendPromptText={draftGptAssistSendPromptText}
        setDraftSendPromptText={setDraftGptAssistSendPromptText}
        sendPromptImage={gptAssistSendPromptImage}
        draftSendPromptImage={draftGptAssistSendPromptImage}
        setDraftSendPromptImage={setDraftGptAssistSendPromptImage}
        styleThemePrompt={styleThemeAssistPrompt}
        draftStyleThemePrompt={draftStyleThemeAssistPrompt}
        setDraftStyleThemePrompt={setDraftStyleThemeAssistPrompt}
        onSave={handleSaveGptAssistPrompt}
        saveStateText={gptAssistSaveStateText}
        canSave={canSaveGptAssistPrompt}
      />
      <TemplateEditorModal
        show={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        draft={templateDraft}
        setDraft={setTemplateDraft}
        onSave={saveTemplateDraft}
        canSave={!!templateDraft.title.trim() || !!templateDraft.body.trim() || !!templateDraft.backup.trim() || !!templateDraft.memo.trim()}
      />
      <StyleTemplateEditorModal
        show={showStyleTemplateModal}
        onClose={() => setShowStyleTemplateModal(false)}
        draft={styleTemplateDraft}
        setDraft={setStyleTemplateDraft}
        onSave={saveStyleTemplateDraft}
        canSave={!!styleTemplateDraft.title.trim() || !!styleTemplateDraft.body.trim()}
      />
      <InputImagesModal
        show={showInputImageModal}
        onClose={() => setShowInputImageModal(false)}
        title={t("images.inputTitle")}
        images={inputImageList}
        maxCount={MAX_INPUT_IMAGES_PER_BATCH}
        onUploadFiles={appendInputImageFiles}
        onRemoveAt={removeInputImageAt}
      />
      <PromptImageEditorModal
        show={showInputImageEditor}
        onClose={() => setShowInputImageEditor(false)}
        images={inputImageList}
        initialIndex={inputImageEditorIndex}
        onConfirm={confirmInputImageEditor}
      />
      <InputImagesModal
        show={showStyleReferenceModal}
        onClose={() => setShowStyleReferenceModal(false)}
        title={t("images.referenceTitle")}
        images={styleImageList}
        maxCount={MAX_STYLE_REFERENCE_IMAGES}
        onUploadFiles={appendStyleReferenceFiles}
        onRemoveAt={removeStyleReferenceAt}
      />
      <SelectionLimitModal
        show={showSelectionLimitModal}
        onClose={() => setShowSelectionLimitModal(false)}
        limit={MAX_ATLAS_SELECTED_IMAGES}
      />
      <AtlasThumbnailModal
        show={showAtlasThumbnailModal}
        onClose={() => setShowAtlasThumbnailModal(false)}
        items={selectedAtlasItems}
        onReorder={reorderAtlasSelection}
        onGenerate={generateAtlasThumbnail}
        thumbnail={atlasThumbnail}
        busy={atlasBusy}
        onPreview={openPreviewImage}
      />
      <SpriteSplitModal
        show={showSplitModal}
        onClose={() => {
          setShowSplitModal(false);
          setSplitStatusText("");
          setSplitStatusTone("info");
        }}
        sourceImage={splitContext.originalImage || splitContext.sourceImage}
        processImage={splitContext.processImage}
        splitItems={splitContext.items}
        splitOnRemoved={splitUseRemovedSource}
        selectedItemIds={splitSelectedItemIds}
        enhanceEnabled={splitEnhanceEnabled}
        renderMode={splitRenderMode}
        shapeMode={splitShapeMode}
        canUndo={splitUndoStack.length > 0}
        busy={splitBusy}
        enhancing={splitEnhancing}
        exporting={splitExporting}
        statusText={splitStatusText}
        statusTone={splitStatusTone}
        onToggleSplitSource={toggleSplitSourceMode}
        onResplit={reSplitCurrentImage}
        onSetRenderMode={setSplitRenderModeMode}
        onSetShapeMode={setSplitShapeModeMode}
        onSetEnhanceEnabled={setSplitEnhanceMode}
        onToggleSelectItem={toggleSplitItemSelected}
        onMergeSelectedItems={mergeSelectedSplitItems}
        onDeleteItem={deleteSplitItem}
        onUndoDelete={undoDeleteSplitItem}
        onExport={exportSplitItems}
        onPreview={openPreviewImage}
        onUploadImageDataUrl={uploadSplitImageFromModal}
      />
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        [contenteditable="true"][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #6b7280;
          pointer-events: none;
        }
      `}</style>
    </div>
    </I18nContext.Provider>
  );
}

// ─── Styles ───
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const THEME_PRIMARY = "#3b82f6";
const THEME_PRIMARY_TEXT = "#bfdbfe";
const THEME_PRIMARY_SOFT = "rgba(59,130,246,0.16)";
const THEME_PRIMARY_BORDER = "rgba(59,130,246,0.45)";
const THEME_GOLD = "#facc15";
const THEME_GOLD_TEXT = "#fef08a";
const THEME_GOLD_SOFT = "rgba(250,204,21,0.14)";
const THEME_GOLD_BORDER = "rgba(250,204,21,0.55)";
const S = {
  root: { minHeight: "100vh", background: "#0a0a0b", color: "#e4e4e7", fontFamily: sans, position: "relative" },
  bgGrain: { position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(16,163,127,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(26,115,232,0.04) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 },
  header: { position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logoArea: { display: "flex", alignItems: "center", gap: 14 },
  logoCube: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #1a73e8, #10a37f)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 },
  title: { margin: 0, fontSize: 18, fontFamily: mono, fontWeight: 700, letterSpacing: 3, color: "#fff" },
  subtitle: { margin: 0, fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase" },
  headerActions: { display: "flex", alignItems: "center", gap: 12 },
  modeNav: { display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" },
  modeTab: { padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  modeTabActive: { background: THEME_GOLD_SOFT, color: THEME_GOLD },
  apiSwitchWrap: { position: "relative" },
  apiSwitchBtn: { height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  apiSwitchBtnActive: { borderColor: THEME_PRIMARY_BORDER, color: THEME_PRIMARY_TEXT, background: THEME_PRIMARY_SOFT },
  settingsBtn: { width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  main: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" },
  inputGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 136px", gap: 16 },
  inputGridStyle: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16 },
  refColumn: { display: "flex", flexDirection: "column" },
  label: { display: "block", fontSize: 11, fontFamily: mono, fontWeight: 600, letterSpacing: 1.5, color: "#999", marginBottom: 8, textTransform: "uppercase" },
  promptHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  promptHeadActions: { display: "flex", alignItems: "center", gap: 8 },
  inputHint: { fontSize: 12, color: "#71717a", fontFamily: mono },
  placeholderBtn: { height: 20, minWidth: 26, borderRadius: 5, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 10, lineHeight: "18px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" },
  gptAssistBtn: { width: 20, height: 20, borderRadius: 5, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 11, lineHeight: "18px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  comparePromptGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  textarea: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.6 },
  tokenEditor: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, outline: "none", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  dropZone: { width: "100%", height: PROMPT_EDITOR_MIN_HEIGHT, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(255,255,255,0.02)" },
  uploadedBox: { position: "relative", width: "100%", height: PROMPT_EDITOR_MIN_HEIGHT, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", background: "rgba(255,255,255,0.02)" },
  uploadedThumb: { width: "100%", height: "100%", objectFit: "cover" },
  removeBtn: { position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 },
  uploadPairRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, alignItems: "stretch" },
  uploadPairCol: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  uploadPairTopLabel: { fontSize: 11, color: "#71717a", fontFamily: mono, letterSpacing: 0.5, textTransform: "uppercase" },
  uploadPairBox: { position: "relative", width: "100%", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(255,255,255,0.03)", padding: 6, cursor: "pointer", textAlign: "left" },
  uploadPairBody: { borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", minHeight: 106 },
  uploadPairMainThumb: { width: "100%", height: 106, objectFit: "cover", display: "block" },
  inputImagesGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, minHeight: 106 },
  inputImagesCell: { borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", minHeight: 50 },
  inputImagesThumb: { width: "100%", height: 50, objectFit: "cover", display: "block" },
  inputImagesEmpty: { minHeight: 50, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.2)", color: "#71717a", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)", width: "100%" },
  inputCountBadge: { position: "absolute", top: 8, right: 8, zIndex: 3, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.88)", color: "#dbeafe", fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  inputEditBtn: { position: "absolute", top: 8, left: 8, zIndex: 3, height: 22, padding: "0 8px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(15,23,42,0.82)", color: "#e2e8f0", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  inputDrawBtn: { position: "absolute", left: 8, bottom: 8, zIndex: 3, width: 26, height: 26, borderRadius: 13, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.88)", color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  modelsPanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 10, height: "100%" },
  modelsPanelStyle: { width: "100%", maxWidth: "100%" },
  modelsHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  syncBtn: { padding: "6px 10px", borderRadius: 7, border: `1px solid ${THEME_GOLD_BORDER}`, background: THEME_GOLD_SOFT, color: THEME_GOLD_TEXT, fontFamily: mono, fontSize: 11, cursor: "pointer" },
  modelTemplateGrid: { display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 3fr)", gap: 12, alignItems: "stretch" },
  modelTemplateGridStyle: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, alignItems: "stretch" },
  modelGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  modelGridStyle: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  imageSizePanel: { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,0.015)", marginTop: "auto" },
  imageSizeGroup: { display: "grid", gap: 6, marginBottom: 8 },
  imageSizeGroupTitle: { fontSize: 11, color: "#8b8b93", fontFamily: mono },
  imageSizeBtnRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  imageSizeBtn: { padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.03)", color: "#c4c4cc", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  imageSizeBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  imageSizeWarn: { margin: "2px 0 0", fontSize: 11, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  templatePanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", height: "100%" },
  templatePanelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  templateFieldHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  templateStatus: { fontSize: 11, color: "#71717a", fontFamily: mono, marginBottom: 8 },
  templateList: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  styleTemplateList: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  styleThemesPanel: { marginTop: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 8, background: "rgba(255,255,255,0.02)" },
  styleThemesHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  styleThemeAssistRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 },
  styleThemeAssistInput: { width: "100%", height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, padding: "0 8px", outline: "none" },
  styleThemesGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  styleThemeInput: { width: "100%", height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, padding: "0 8px", outline: "none" },
  templateItem: { width: "100%", border: "1px solid rgba(63,63,70,0.9)", borderRadius: 8, padding: "8px 8px 8px 10px", background: "rgba(12,12,14,0.9)", minHeight: 38, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", color: "#71717a", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent", boxShadow: "none" },
  templateItemDisabled: { opacity: 0.55, cursor: "not-allowed" },
  templateItemActive: { borderColor: THEME_PRIMARY_BORDER, boxShadow: "none", background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  templateItemTitle: { fontSize: 11, color: "inherit", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },
  templateActions: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
  templateEditBtn: { width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(82,82,91,0.9)", background: "rgba(24,24,27,0.9)", color: "#a1a1aa", fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 0, lineHeight: "24px", textAlign: "center", outline: "none" },
  modelChipWrap: { border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 5, background: "rgba(255,255,255,0.02)" },
  modelRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" },
  modelChip: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 7px", borderRadius: 7, border: "1px solid", color: "#e4e4e7", fontSize: 12, fontFamily: sans, transition: "all 0.15s", width: "100%", minHeight: 32 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  chipName: { fontWeight: 500, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 },
  chipNameStyleMode: { fontWeight: 500, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 },
  check: { marginLeft: "auto", color: "#10a37f", fontWeight: 700, fontSize: 14 },
  countRow: { display: "flex", alignItems: "center", gap: 4 },
  countLabel: { fontSize: 11, color: "#999", fontFamily: mono, width: 10, textAlign: "center" },
  countSelect: { width: 50, height: 32, padding: "4px 5px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 11, outline: "none" },
  genRow: { display: "flex", gap: 12, marginBottom: 32, alignItems: "center" },
  folderRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" },
  atlasRow: { display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" },
  atlasCount: { fontSize: 12, color: THEME_PRIMARY_TEXT, fontFamily: mono, minWidth: 120 },
  atlasThumbBtn: { width: 54, height: 54, borderRadius: 8, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.65)", overflow: "hidden", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  atlasThumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  helpWrap: { display: "grid", gap: 16 },
  helpHero: { borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(26,115,232,0.2), rgba(16,163,127,0.08))", padding: "22px 24px" },
  helpTitle: { margin: 0, fontSize: 28, fontFamily: mono, color: "#f8fafc", letterSpacing: -0.5 },
  helpTextBlock: { display: "grid", gap: 8 },
  helpIntro: { margin: "10px 0 0", fontSize: 14, color: "#9ca3af", lineHeight: 1.7, maxWidth: 760 },
  helpIntroCn: { margin: 0, fontSize: 14, color: "#a7b0bf", lineHeight: 1.8, maxWidth: 760 },
  helpGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 },
  helpCard: { borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px 18px 16px" },
  helpCardFull: { gridColumn: "1 / -1" },
  helpCardTitle: { margin: "0 0 8px", fontSize: 13, color: "#f8fafc", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.6 },
  helpCardText: { margin: 0, fontSize: 13, color: "#98a2b3", lineHeight: 1.7 },
  helpCardTextCn: { margin: 0, fontSize: 13, color: "#a8b1c0", lineHeight: 1.8 },
  helpParagraphGroup: { display: "grid", gap: 8 },
  helpParagraphItem: { display: "grid" },
  helpLangGap: { height: 8 },
  helpInlineCode: { fontFamily: mono, fontSize: "0.95em", color: "#f8fafc", background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 6, padding: "1px 6px", margin: "0 2px" },
  folderHint: { fontSize: 12, color: "#a1a1aa", fontFamily: mono },
  folderMsg: { fontSize: 12, color: THEME_PRIMARY_TEXT, marginBottom: 18, fontFamily: mono },
  genBtn: { padding: "12px 32px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a73e8, #10a37f)", color: "#fff", fontFamily: mono, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  zipBtn: { padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 13, cursor: "pointer" },
  btnSpin: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" },
  resultCol: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, minHeight: 200 },
  resultHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  resultName: { fontFamily: mono, fontSize: 13, fontWeight: 600, flex: 1 },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, textTransform: "capitalize" },
  loadingArea: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(59,130,246,0.2)", borderTopColor: THEME_PRIMARY, borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  errArea: { padding: "20px 12px" },
  imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 },
  imgGridCompact: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 },
  imgCard: { position: "relative", borderRadius: 8, overflow: "hidden", background: "#111", border: "1px solid transparent", boxShadow: "none" },
  imgCardCompact: { borderRadius: 6 },
  imgCardSelected: { borderColor: "rgba(59,130,246,0.9)", boxShadow: "0 0 0 1px rgba(59,130,246,0.35) inset" },
  imageSelectBtn: { position: "absolute", top: 8, right: 8, zIndex: 3, width: 24, height: 24, borderRadius: 12, border: "1px solid rgba(226,232,240,0.7)", background: "rgba(15,23,42,0.72)", color: "rgba(226,232,240,0.88)", fontFamily: mono, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1, outline: "none", boxShadow: "none", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" },
  imageSelectBtnCompact: { top: 4, right: 4, width: 16, height: 16, borderRadius: 8, fontSize: 10 },
  imageSelectBtnBottom: { top: "auto", bottom: 4, right: 4 },
  imageSelectBtnActive: { borderColor: "rgba(16,163,127,0.9)", background: "rgba(5,150,105,0.92)", color: "#dcfce7" },
  imageSplitBtn: { position: "absolute", bottom: 38, right: 8, zIndex: 3, width: 26, height: 26, borderRadius: 13, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.82)", color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1, outline: "none", boxShadow: "none", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" },
  imageSplitBtnCompact: { width: 18, height: 18, borderRadius: 9, right: 4, bottom: 32, fontSize: 10 },
  imageSplitBtnBusy: { opacity: 0.65, cursor: "wait" },
  imageThemeTag: { position: "absolute", left: 8, top: 8, zIndex: 2, maxWidth: "70%", padding: "2px 7px", borderRadius: 999, fontSize: 10, fontFamily: mono, color: THEME_PRIMARY_TEXT, background: "rgba(6,78,59,0.82)", border: `1px solid ${THEME_PRIMARY_BORDER}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  imageThemeTagCompact: { left: 4, top: 4, maxWidth: "75%", padding: "1px 5px", fontSize: 9, borderRadius: 999 },
  thumb: { width: "100%", aspectRatio: "4 / 3", objectFit: "contain", cursor: "pointer", display: "block", background: "#0b0b0d" },
  thumbCompact: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", cursor: "pointer", display: "block", background: "#0b0b0d" },
  thumbRetrying: { width: "100%", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontFamily: mono, fontSize: 12 },
  thumbRetryingCompact: { width: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontFamily: mono, fontSize: 10 },
  imageActionBar: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" },
  imageActionBarCompact: { minHeight: 28 },
  imageActionBtn: { height: 34, border: "none", borderRight: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#cbd5e1", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  imageActionBtnCompact: { height: 28, border: "none", borderRight: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#cbd5e1", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  imageActionBtnBusy: { opacity: 0.6, cursor: "wait" },
  imageActionBtnDisabled: { opacity: 0.35, cursor: "not-allowed" },
  imageActionIcon: { fontSize: 18, lineHeight: 1, fontWeight: 700 },
  imageActionIconCompact: { fontSize: 16, lineHeight: 1, fontWeight: 700 },
  imageActionPlus: { fontSize: 13, lineHeight: 1, fontWeight: 700 },
  imageActionPlusCompact: { fontSize: 12, lineHeight: 1, fontWeight: 700 },
  dlBtn: { width: "100%", padding: "8px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.15s ease" },
  previewNavBtn: { position: "absolute", top: "50%", transform: "translateY(-50%)", zIndex: 11, width: 38, height: 38, borderRadius: 19, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(2,6,23,0.74)", color: "#f8fafc", fontSize: 24, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  previewCounter: { position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 11, minWidth: 72, height: 28, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(2,6,23,0.74)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  previewCompareGrid: { width: "100%", height: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 0 },
  previewComparePane: { minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", borderRight: "1px solid rgba(255,255,255,0.08)" },
  previewCompareLabel: { minHeight: 42, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#cbd5e1", fontFamily: mono, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", flexWrap: "wrap" },
  previewCompareTokens: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  previewCompareToken: { padding: "2px 8px", borderRadius: 999, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontSize: 11, letterSpacing: 0, textTransform: "none" },
  previewCompareImageWrap: { minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#0b0b0d" },
  previewCompareImage: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  previewSingleWrap: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#0b0b0d" },
  settingsModal: { width: "90%", maxWidth: 560, background: "#161618", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, maxHeight: "80vh", overflow: "auto" },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  fieldLabel: { display: "block", fontSize: 12, fontFamily: mono, fontWeight: 500, color: "#999", marginBottom: 6 },
  proxyInput: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 14, outline: "none" },
  hint: { fontSize: 12, color: "#888", marginTop: 8, lineHeight: 1.5 },
  settingToggleList: { marginTop: 2, display: "grid", gap: 10 },
  settingToggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  settingToggleTextWrap: { minWidth: 0, display: "grid", gap: 3 },
  settingToggleTitle: { fontSize: 13, color: "#e4e4e7", fontFamily: mono },
  settingToggleHint: { fontSize: 12, color: "#888", lineHeight: 1.5 },
  settingToggleBtn: { minWidth: 62, height: 30, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer", flexShrink: 0 },
  settingToggleBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  toggleCodeBtn: { padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  codeBlock: { marginTop: 12, padding: 16, background: "#0d0d0f", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 11, fontFamily: mono, color: "#a0a0b0", overflow: "auto", maxHeight: 300, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  apiModalActions: { marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  apiModalState: { fontSize: 12, color: "#a1a1aa", fontFamily: mono },
  apiSaveBtn: { padding: "8px 14px", borderRadius: 8, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImagesModal: { maxWidth: 820 },
  modalInputImagesHint: { marginBottom: 12, fontSize: 12, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  modalInputImagesGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 },
  modalInputImageCell: { position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT },
  modalInputImageThumb: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" },
  modalInputImageRemoveBtn: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(15,23,42,0.8)", color: "#e2e8f0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  modalInputImageEmpty: { aspectRatio: "1 / 1", borderRadius: 10, border: `1px dashed ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, gap: 6 },
  modalInputImageEmptyDisabled: { opacity: 0.45, cursor: "not-allowed" },
  modalInputImageUploadPlus: { fontSize: 28, lineHeight: 1 },
  modalInputImageUploadText: { fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
  modalInputImagesActions: { marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  inputImageEditorModal: { width: "min(1180px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#161618", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 18, display: "grid", gap: 16 },
  inputImageEditorHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  inputImageEditorHeaderHint: { marginTop: 6, fontSize: 12, color: "#9ca3af", lineHeight: 1.6, maxWidth: 560, fontFamily: mono },
  inputImageEditorLayout: { display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16, minHeight: 0 },
  inputImageEditorSidebar: { minWidth: 0, display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  inputImageEditorMain: { minWidth: 0, display: "grid", gap: 12 },
  inputImageEditorBlock: { display: "grid", gap: 8 },
  inputImageEditorLabel: { fontSize: 11, color: "#a1a1aa", fontFamily: mono, letterSpacing: 1.2, textTransform: "uppercase" },
  inputImageEditorToolGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  inputImageEditorToolBtn: { height: 34, borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImageEditorToolBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  inputImageEditorColorRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  inputImageEditorColorBtn: { width: 28, height: 28, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(2,6,23,0.2)" },
  inputImageEditorColorBtnActive: { boxShadow: `0 0 0 2px ${THEME_PRIMARY}, inset 0 0 0 1px rgba(2,6,23,0.28)` },
  inputImageEditorNavRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  inputImageEditorMiniBtn: { height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImageEditorMiniBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  inputImageEditorStatus: { minHeight: 18, fontSize: 12, color: THEME_PRIMARY_TEXT, fontFamily: mono, lineHeight: 1.5 },
  inputImageEditorSubHint: { fontSize: 11, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  inputImageEditorActionGrid: { display: "grid", gap: 8 },
  inputImageEditorActionBtn: { height: 36, borderRadius: 9, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImageEditorGhostBtn: { height: 36, borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImageEditorConfirmBtn: { height: 38, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a73e8, #10a37f)", color: "#fff", fontFamily: mono, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  inputImageEditorActionBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  inputImageEditorViewport: { position: "relative", minHeight: 520, height: "min(58vh, 560px)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "#09090b", overflow: "hidden" },
  inputImageEditorCanvas: { width: "100%", height: "100%", display: "block", touchAction: "none" },
  inputImageEditorThumbStrip: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 10 },
  inputImageEditorThumbBtn: { position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", padding: 0, cursor: "pointer", minHeight: 84 },
  inputImageEditorThumbBtnActive: { borderColor: THEME_PRIMARY_BORDER, boxShadow: `0 0 0 1px ${THEME_PRIMARY_BORDER} inset` },
  inputImageEditorThumbImg: { width: "100%", height: 84, objectFit: "cover", display: "block", background: "#0b0b0d" },
  inputImageEditorThumbIndex: { position: "absolute", left: 6, bottom: 6, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "rgba(2,6,23,0.78)", color: "#f8fafc", fontSize: 11, fontFamily: mono, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  selectionLimitModal: { width: "min(420px, 90vw)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "#161618", padding: "24px 22px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)" },
  selectionLimitTitle: { fontSize: 18, color: "#f8fafc", fontFamily: mono, marginBottom: 8 },
  selectionLimitText: { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 },
  atlasModalHint: { fontSize: 12, color: "#a1a1aa", fontFamily: mono, marginBottom: 14 },
  atlasModalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },
  atlasModalCard: { position: "relative", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", overflow: "hidden", cursor: "grab" },
  atlasModalCardDragging: { opacity: 0.5, transform: "scale(0.98)" },
  atlasModalCardOrder: { position: "absolute", top: 8, left: 8, zIndex: 2, minWidth: 24, height: 24, padding: "0 6px", borderRadius: 12, background: "rgba(2,6,23,0.78)", color: "#f8fafc", fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  atlasModalCardThumb: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", background: "#0b0b0d" },
  atlasModalCardMeta: { padding: "10px 10px 12px", display: "grid", gap: 4 },
  atlasModalCardTitle: { fontSize: 12, color: "#f4f4f5", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  atlasModalCardSub: { fontSize: 11, color: "#a1a1aa", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  atlasModalPreview: { marginTop: 16, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  atlasModalPreviewImg: { width: "100%", display: "block", objectFit: "contain", background: "#0b0b0d" },
  splitModal: { width: "min(1220px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#161618", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, display: "grid", gap: 12 },
  splitModalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  splitMainGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" },
  splitLeftCol: { display: "grid", gap: 10, alignContent: "start" },
  splitRightCol: { borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 10, minHeight: 520, alignContent: "start" },
  splitRightTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  splitTopActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  splitRightBody: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)", padding: 10, minHeight: 430, overflow: "visible", alignContent: "start" },
  splitPane: { borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8, alignContent: "start", minHeight: 300 },
  splitMidActions: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.38)", padding: 8, display: "grid", gap: 8, alignContent: "start" },
  splitMidActionRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" },
  splitToggleGroup: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: 2, borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(2,6,23,0.48)", minWidth: 0, maxWidth: "100%" },
  splitToggleBtn: { height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", color: "#cbd5e1", fontFamily: mono, fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" },
  splitToggleBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  splitPaneTitle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: "#e4e4e7", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4 },
  splitPaneCount: { fontSize: 11, color: "#94a3b8", textTransform: "none", letterSpacing: 0, marginLeft: "auto" },
  splitOriginalWrap: { position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "#0b0b0d", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" },
  splitImageWrap: { position: "relative", width: "100%", height: "100%" },
  splitOriginalImg: { width: "100%", maxHeight: 520, objectFit: "contain", display: "block", cursor: "zoom-in" },
  splitImageZoomBtn: { position: "absolute", top: 8, right: 8, zIndex: 3, width: 24, height: 24, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(2,6,23,0.82)", color: "#e2e8f0", fontSize: 12, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  splitImageZoomBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  splitImageUploadBtn: { position: "absolute", right: 8, bottom: 8, zIndex: 4, height: 24, minWidth: 68, padding: "0 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(2,6,23,0.88)", color: "#e2e8f0", fontSize: 11, fontFamily: mono, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  splitPaneInlineZoomViewer: { width: "100%", maxWidth: "100%", height: "min(520px, 62vh)", borderRadius: 10, border: "1px solid rgba(59,130,246,0.45)", background: "rgba(8,47,73,0.24)", boxShadow: "0 0 0 1px rgba(59,130,246,0.16), 0 10px 24px rgba(2,6,23,0.24)" },
  splitPaneInlineZoomCollapseBtn: { top: 8, right: 8, width: 24, height: 24, borderRadius: 12, fontSize: 12 },
  splitGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, alignContent: "start" },
  splitItemCell: { position: "relative" },
  splitItemBtn: { position: "relative", width: "100%", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.5)", borderRadius: 10, overflow: "hidden", padding: 0, cursor: "zoom-in", textAlign: "left" },
  splitItemBtnWhiteBg: { background: "#ffffff" },
  splitItemOrder: { position: "absolute", top: 6, left: 6, minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px", background: "rgba(2,6,23,0.78)", color: "#f8fafc", fontFamily: mono, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 },
  splitItemImg: { width: "100%", minHeight: 160, maxHeight: 280, objectFit: "contain", display: "block", background: "#020617" },
  splitItemSelectBtn: { position: "absolute", top: 6, right: 54, zIndex: 3, width: 20, height: 20, borderRadius: 10, border: "1px solid rgba(148,163,184,0.65)", background: "rgba(15,23,42,0.86)", color: "#e2e8f0", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  splitItemSelectBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  splitItemZoomBtn: { position: "absolute", top: 6, right: 30, zIndex: 3, width: 20, height: 20, borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(2,6,23,0.82)", color: "#e2e8f0", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  splitItemZoomBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  splitItemDeleteBtn: { position: "absolute", top: 6, right: 6, zIndex: 3, width: 20, height: 20, borderRadius: 10, border: "1px solid rgba(248,113,113,0.65)", background: "rgba(127,29,29,0.88)", color: "#fee2e2", fontSize: 11, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  splitItemInlineZoomViewer: { width: "100%", maxWidth: "100%", height: 160, borderRadius: 10, border: "1px solid rgba(59,130,246,0.45)", background: "rgba(8,47,73,0.24)", boxShadow: "0 0 0 1px rgba(59,130,246,0.16), 0 10px 24px rgba(2,6,23,0.24)" },
  splitItemInlineZoomCollapseBtn: { width: 22, height: 22, borderRadius: 11, top: 6, right: 6, fontSize: 11 },
  splitStatusText: { minHeight: 18, fontSize: 12, color: "#94a3b8", fontFamily: mono, wordBreak: "break-word" },
  splitStatusTextError: { color: "#fca5a5" },
  turnActionBtn: { height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontSize: 11, fontFamily: mono, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  turnPromptRow: { marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  turnPromptRowExpanded: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", alignItems: "stretch", justifyContent: "stretch" },
  turnModeBadge: { display: "inline-flex", alignItems: "center", marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontSize: 11, fontFamily: mono },
  turnPromptCards: { flex: "1 1 320px", minWidth: 220, display: "grid", gap: 10 },
  turnPromptCardsExpanded: { height: 320, minHeight: 320, alignSelf: "stretch", gridAutoRows: "1fr" },
  turnPromptCard: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: "12px 14px" },
  turnPromptCardCompact: { maxHeight: 96, overflow: "hidden" },
  turnPromptCardExpanded: { height: "100%", maxHeight: 320, minHeight: 320, overflow: "hidden", display: "flex", flexDirection: "column" },
  turnPromptBadge: { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: THEME_GOLD_SOFT, color: THEME_GOLD, fontSize: 10, fontFamily: mono, marginBottom: 8 },
  turnPromptText: { fontSize: 13, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.5 },
  turnPromptTextCompact: { maxHeight: 72, overflow: "hidden" },
  turnPromptTextExpanded: { flex: 1, maxHeight: "100%", overflow: "hidden" },
  promptChipReadonly: { background: "rgba(59,130,246,0.18)", color: THEME_PRIMARY_TEXT, border: "1px solid rgba(59,130,246,0.62)", borderRadius: 6, padding: "1px 6px", display: "inline-block", margin: "0 1px" },
  styleHistorySummary: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 },
  styleSummaryItem: { borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.24)", padding: "8px 10px", display: "grid", gap: 4 },
  styleSummaryKey: { fontSize: 10, color: "#71717a", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4 },
  styleSummaryVal: { fontSize: 12, color: "#e4e4e7", fontFamily: mono, fontWeight: 600 },
  turnStyleUnifiedWrap: { display: "grid", gap: 10 },
  turnStyleFailedLine: { borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(127,29,29,0.2)", color: "#fca5a5", fontFamily: mono, fontSize: 11, padding: "7px 10px" },
  turnStyleImageBox: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8 },
  turnStyleImageHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  turnStyleImageEmpty: { borderRadius: 8, border: "1px dashed rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.2)", color: "#71717a", fontFamily: mono, fontSize: 12, padding: "14px 10px", textAlign: "center" },
  turnCompareResultsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  turnStyleResultsGrid: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 },
  turnResultGroup: { marginTop: 16 },
  turnResultGroupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  turnResultMeta: { fontSize: 11, color: "#71717a", fontFamily: mono },
  turnRefViewerCol: { display: "grid", gap: 10, alignItems: "start", justifyItems: "start", flex: "0 0 auto", minWidth: 0 },
  turnRefViewerColExpanded: { width: 320, minWidth: 320, height: 320, alignSelf: "stretch" },
  turnRefImageStack: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", overflowX: "auto", paddingBottom: 2, maxWidth: "100%" },
  turnRefImageWrap: { position: "relative", flexShrink: 0 },
  turnRefImageBtn: { width: 96, height: 96, borderRadius: 8, padding: 0, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", background: "transparent", cursor: "zoom-in", flexShrink: 0 },
  turnRefImageZoomBtn: { position: "absolute", top: 6, right: 6, zIndex: 3, width: 24, height: 24, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(2,6,23,0.82)", color: "#e2e8f0", fontSize: 12, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  turnRefImageZoomBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  turnRefImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  inlineZoomViewer: { position: "relative", width: 320, maxWidth: "min(320px, 100%)", height: 320, borderRadius: 12, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.22)", boxShadow: "0 0 0 1px rgba(59,130,246,0.18), 0 12px 30px rgba(2,6,23,0.28)", overflow: "hidden", flexShrink: 0 },
  inlineZoomViewerCollapseBtn: { position: "absolute", top: 8, right: 8, zIndex: 4, width: 26, height: 26, borderRadius: 13, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(2,6,23,0.78)", color: THEME_PRIMARY_TEXT, fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  inlineZoomViewerViewport: { width: "100%", height: "100%", overflow: "hidden", background: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" },
  inlineZoomViewerImage: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transformOrigin: "center center", willChange: "transform", userSelect: "none" },
};
