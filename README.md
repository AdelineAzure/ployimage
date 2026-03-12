# POLYIMAGE · DeerAPI 模版检测工具

这是一个使用 React + Vite 搭建的前端项目，用于通过 DeerAPI 调用多种图像模型（OpenAI、Google Gemini、字节 Seedream）进行图片生成与对比。

当前仓库已经包含基本的工程结构，你只需要安装 Node.js 和依赖，就可以在本地启动这个网页。

## 1. 安装 Node.js

1. 打开浏览器访问 `https://nodejs.org/`。
2. 下载推荐的 LTS 版本（绿色按钮）。
3. 双击安装包，一路“继续 / 同意 / 安装”直到完成。
4. 安装完成后，打开「终端」（Terminal），输入：

   ```bash
   node -v
   ```

   如果能看到类似 `v20.x.x` 的版本号，说明安装成功。

## 2. 安装依赖

在终端中进入本项目所在目录（你的路径可能类似这样）：

```bash
cd "/Users/mac/Desktop/模版检测工具"
```

然后执行：

```bash
npm install
```

这一步会根据 `package.json` 安装 React、Vite 等依赖。

## 3. 启动开发服务器

依赖安装完毕后，在同一个目录运行：

```bash
npm run dev
```

终端中会看到类似：

```text
  VITE vX.X.X  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

用浏览器打开 `http://localhost:5173/`，即可看到 POLYIMAGE 网页界面。

## 4. Cloudflare Worker 代理（可后续配置）

前端界面已经可以打开，但要真正调用 DeerAPI 生成图片，需要一个 Cloudflare Worker 作为代理。

### 4.1 准备 Worker 代码

仓库根目录下有 `cloudflare-worker-deerapi.js`，内容就是示例 Worker 代码。你可以在 Cloudflare Dashboard 中新建一个 Worker，并把这份代码粘贴进去。

### 4.2 配置环境变量

在 Worker 的设置中添加环境变量：

- 名称：`DEERAPI_KEY`
- 值：你的 DeerAPI 密钥，例如：`sk-xxxx...`

当你暂时还没有 API Key 时，可以先跳过这一步，界面依然可以打开，只是点击「Generate」不会真正生成图片。

### 4.3 在前端填入 Worker 地址

等 Worker 部署好后，会得到一个地址，例如：

```text
https://your-worker-name.your-subdomain.workers.dev
```

在网页右上角点击 `⚙`，打开配置弹窗，在「Cloudflare Worker Proxy URL」输入这个地址并保存即可。

## 5. 用户使用说明

### 5.1 基础出图流程

1. 打开页面后先点 `⚙` 填写 Worker 地址。
2. （可选）点右上角 `API` 填写 DeerAPI Key 并点 `Save`。
3. 输入提示词，按需上传参考图。
4. 选择模型和每个模型的出图数量。
5. 点击 `⬡ Enqueue Task` 或 `⬡ Enqueue Compare Tasks` 运行任务。

### 5.2 GPT 助手怎么用

> GPT 助手只改写 `{{ }}` 中间的内容，不会直接生图。

1. 在导航栏点击 `GPT Prompt`。
2. 填写“GPT 改写规则”并点 `Save`。
3. 在提示词里写占位符，例如：`一个 {{情绪随机}} 的女孩在 {{天气随机}} 的街头`。
4. 点击提示词区域上方的人形按钮 `👤`。
5. GPT 会自动改写 `{{ }}` 内文本，完成后按钮自动恢复为未运行状态。

### 5.3 GPT 助手是否支持识图？

支持。  
当你上传了参考图后，点击 `👤` 时会把当前输入图一并发送给 GPT 作为视觉参考（但 GPT 助手本身不生图）。

### 5.4 GPT 助手配置存储规则

- `GPT Prompt` 的配置文件与模板一样，保存在你选择的 History Folder 中。
- 文件名为：`gpt-assist.json`。
- 必须先选择 History Folder，才能保存 GPT Prompt。
- GPT 调用会读取当前输入图作为上下文，但**不会把输入图写入** `gpt-assist.json`。

### 5.5 Prompt Compare 模式下的 GPT 助手

- `PROMPTS` 模式下会同时检查两列输入框。
- 哪个输入框包含 `{{ }}`，就改写哪个。
- 没有 `{{ }}` 的输入框不会被改动。

## 6. 项目结构简要说明

- `index.html`：入口 HTML 文件，挂载点为 `#root`。
- `src/main.jsx`：前端入口文件，挂载 React 应用。
- `src/App.jsx`：主页面组件，包含 POLYIMAGE 的全部逻辑和界面。
- `cloudflare-worker-deerapi.js`：Cloudflare Worker 示例代码，用于代理请求到 DeerAPI。
- `package.json`：项目依赖与启动脚本配置。
- `vite.config.js`：Vite 配置。

如果你不熟悉命令行，可以直接按照上面的命令一步一步复制粘贴，有任何一步报错，把终端里的报错信息发给我，我可以继续帮你排查。
