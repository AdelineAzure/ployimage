# GitHub 提交与推送解决方案

本文件用于处理本仓库的 Git/GitHub 操作。遇到提交、推送、暂存、Git LFS 或工作区权限问题时，先读取本文件，再执行操作。

## 适用范围

- 将本次代码修改提交到 GitHub
- 只上传指定文件，避免误带用户已有改动
- 处理构建产物、编辑器配置和 Git LFS 文件
- 处理 `.git/index.lock`、LFS 临时目录和沙箱权限错误
- 推送前确认远端、分支和提交内容

## 标准流程

1. 查看工作区状态、当前分支和远端：

   ```bash
   git status --short
   git branch --show-current
   git remote -v
   ```

2. 查看本次改动，特别检查是否存在用户先前留下的未提交修改：

   ```bash
   git diff --stat
   git diff -- <涉及文件>
   ```

3. 不要自动恢复、覆盖或删除未知来源的修改。若同一文件存在无关改动，先向用户确认是否一并提交。

4. 只暂存用户确认的文件。不要默认暂存整个工作区：

   ```bash
   git add <明确的文件列表>
   ```

5. 暂存后再次检查：

   ```bash
   git status --short
   git diff --cached --stat
   git diff --cached --check
   ```

6. 提交信息要描述实际改动：

   ```bash
   git commit -m "<简短且具体的提交说明>"
   ```

7. 推送前确认当前分支和远端，用户明确要求上传时才推送：

   ```bash
   git branch --show-current
   git remote -v
   git push origin <当前分支>
   ```

## 不应默认上传的内容

- `dist/` 构建产物，除非仓库明确要求提交构建结果
- `.vscode/`、本地 IDE 配置和个人环境文件
- API Key、`.env`、Cookie、令牌和任何凭据
- 与当前需求无关的用户修改
- 临时截图、日志、缓存和上传文件

## Git LFS 问题

如果状态或 diff 检查触发 Git LFS 清理错误，优先使用只读检查：

```bash
git -c filter.lfs.process= -c filter.lfs.required=false status --short
```

不要为了绕过 LFS 错误删除 `.git/lfs`、重置工作区或强制改写历史。若确实需要提交 LFS 文件，先确认 Git LFS 在当前环境可用，并取得用户明确授权。

## `.git/index.lock` 或权限问题

典型错误包括：

- `Unable to create '.git/index.lock': Operation not permitted`
- `Error cleaning Git LFS object ... operation not permitted`

处理顺序：

1. 确认没有其他 Git 进程正在运行。
2. 不要直接删除未知的 lock 文件，先检查其存在和归属。
3. 在当前沙箱无法写入 `.git` 时，向用户说明暂存、提交和推送被环境权限阻塞。
4. 只有在用户明确授权且系统审批通过后，才请求更高权限重试。
5. 审批失败时不得通过改写 Git 目录、绕过安全策略或使用破坏性命令规避限制。

## 推送失败

- 先区分认证失败、网络失败、分支保护和权限失败。
- 不要强制推送，不要使用 `--force`，除非用户明确要求并确认风险。
- 不要提交 API Key 来“修复”认证问题。
- 推送成功后向用户报告分支和提交结果；失败时报告准确阻塞点，不要声称已上传。

## 完成标准

只有同时满足以下条件，才能说“已上传到 GitHub”：

- 目标文件已正确暂存
- 提交成功生成
- 推送命令成功返回
- 推送目标为用户要求的远端和分支

