import { useI18n } from "../../i18n";
import { S } from "../../styles/appStyles";

export function HelpRichText({ text, style }) {
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

export function HelpParagraphs({ text, style }) {
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

export function HelpPage() {
  const { uiLanguage, t } = useI18n();
  const sections = uiLanguage === "zh"
    ? [
        {
          title: "开始使用",
          fullWidth: true,
          lines: [
            "这个工具本身没有内置账号登录页面。",
            "先去 Comet 或百炼网页端创建并复制你的 API Key；回到本工具后点击 `API`，分别填入对应的密钥即可。",
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
            "对于支持图像编辑的模型（如 Qwen、GPT Image 1.5 / 2），上传输入图后会自动走图生或编辑；不上传则继续走文生图。",
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
            "Create or copy your API key from Comet or Bailian, open this app, click `API`, and fill the matching key fields.",
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
            "For models that support image editing, such as Qwen and GPT Image 1.5 / 2, uploading an input image automatically switches the request to image-to-image or edit mode; without an upload it stays text-to-image.",
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
