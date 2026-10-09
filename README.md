# amazing-starts

让 GitHub Stars 的管理与浏览变得 amazing。

一个无自建后端、以本地数据为主的 Chrome 扩展项目：让收藏不止停留在 Star，也能成为有分类、有手册、随时找得到的私人开源目录。

## 当前状态

**M0 视觉候选与 M1 基础工程阶段，不是完整产品。**

已实现：

- WXT、React、TypeScript、Manifest V3 工程及锁定的依赖版本。
- 后台、GitHub 内容脚本、弹窗和独立管理页入口。
- 按账号隔离的 IndexedDB 基础结构、事务替换与版本保护。
- 默认会话级凭证存储、可选持久存储封装及受信任上下文限制。
- UI 与 GitHub 内容脚本分开的消息允许列表，不提供任意请求或凭证读取接口。
- 候选色板、亮色、暗色和跟随系统的本地外观设置。
- 独立的两套交互视觉候选，覆盖收藏、详情、设置；演示数据不进入真实扩展。

尚未实现：GitHub OAuth、Stars/Lists 同步与管理、真实 AI 接入、自动分类、手册、自然语言检索、项目对比和动态跟踪。

项目名称保留为 `amazing-starts`，所管理的 GitHub 功能称为 Stars。

## 本地开发

使用 Node.js 22.18 或更高版本，以及 `package.json` 中固定的 pnpm 版本。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Chrome 构建产物位于 `.output/chrome-mv3`。在 Chrome 扩展管理页开启开发者模式后，可手动选择“加载已解压的扩展程序”并加载该目录。当前工作区不会登录账号、读取真实收藏或调用 AI。

开发模式使用 `pnpm dev`。开发服务器与 WXT 调试工具仅用于开发，不是产品运行所需的后端。

## 查看视觉草案

```powershell
pnpm preview:design
```

打开 `http://127.0.0.1:4317/`。两种方向分别为“纸页收藏馆”和“轨道观测室”，每套均支持独立明暗模式。

页面使用本地 HTML/CSS、字体与少量几何图形，不连接第三方服务。演示数据明确标注为演示，不表示真实账户状态。可直接打开 `docs/design/preview.html` 离线查看。

设计预览与 Chrome 扩展构建相互独立，预览页面和字体不会进入扩展构建产物。

## 权限与隐私

M1 只声明 `storage` 和 GitHub.com 主机范围，用于本地数据层和内容脚本边界。尚未接入调度和 AI，因此没有提前申请 alarms、所有网站、notifications 或 cookies 权限。

内容脚本只发送页面就绪与仓库线索，不观察点击，不读取 Token/API Key，不修改页面收藏状态。所有真实 GitHub 与 AI 操作均留待后续阶段。

不要将 Token、API Key、Client Secret 写进项目文件或提交历史。本地笔记、标签、手册没有跨设备云同步；卸载或清除扩展数据存在丢失风险。

## 文档

- [产品设计](docs/superpowers/specs/2026-10-09-amazing-starts-design.md)
- [实施计划](docs/superpowers/plans/2026-10-09-amazing-starts-implementation.md)
- [视觉候选](docs/design/visual-direction.md)
- [GitHub OAuth 配置准备](docs/setup/github-oauth.md)
- [AI 服务配置准备](docs/setup/ai-provider.md)
- [当前验证记录](docs/acceptance.md)

## 许可证

项目代码采用 [MIT License](LICENSE)。设计预览使用的第三方字体另附其原始授权文件，位于 `docs/design/assets/`。
