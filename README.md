# Amazing Stars

让 GitHub 与 Gitee Stars 的管理与浏览变得 amazing。

一个无自建后端、以本地数据为主的 Chrome 扩展项目：让收藏不止停留在 Star，也能成为有分类、有手册、随时找得到的私人开源目录。

## 当前状态

**已接入 M2 GitHub 读取同步，并完成 Git provider 扩展（GitHub 与 Gitee 多账号）与本地分类管理；真实账号集成验收待完成。**

已实现：

- WXT、React、TypeScript、Manifest V3 工程及锁定的依赖版本。
- 后台、GitHub 内容脚本与独立管理页入口；点击工具栏图标直接打开管理页，目前没有工具栏弹窗。
- 按账号隔离的 IndexedDB 基础结构、事务替换与版本保护。
- 默认会话级凭证存储、可选持久存储封装及受信任上下文限制。
- UI 与 GitHub 内容脚本分开的消息允许列表，不提供任意请求或凭证读取接口。
- 候选色板、亮色、暗色和跟随系统的本地外观设置。
- AI 服务配置、按需主机授权、模型目录获取与连通性测试（GET /models，不包含模型生成）。
- 正式收藏工作区：本地搜索、分类筛选、维度标签筛选和项目详情。
- Git 设置页：GitHub 与 Gitee 两个子标签，同一平台可连接多个账号，每个账号独立凭证、同步状态与同步规则。
- 两种同步规则：只同步 Stars；同步 Stars 与 Lists 并把远端 Lists 建立为分类。
- GitHub 与 Gitee 的 Stars 分页读取；每页保存进度，全部成功后原子提交快照。
- 本地分类：手动新建、改名、修改说明、删除（其中的项目回到未分类）、拖拽移动项目，以及项目详情里的等价移动入口。
- 独立的两套交互视觉候选，覆盖收藏、详情、设置；演示数据不进入真实扩展。

尚未实现：把本地分类写回远端 Lists、AI 模型生成调用、自动分类、手册、自然语言检索、项目对比和动态跟踪。

项目名称使用 `Amazing Stars`，产品所管理的 Star 功能分别来自 GitHub 与 Gitee。两者同名但含义不同：前者是产品与仓库名，后者指代码托管平台的 Star 功能。

## 本地开发

使用 Node.js 22.18 或更高版本，以及 `package.json` 中固定的 pnpm 版本。

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Chrome 构建产物位于 `.output/chrome-mv3`。在 Chrome 扩展管理页开启开发者模式后，可手动选择“加载已解压的扩展程序”并加载该目录。在设置的 Git 区域选择 GitHub 或 Gitee，填写 Personal Access Token 或私人令牌，点击“验证并保存”，识别账号后主动同步收藏。AI 服务仅在主动测试或获取模型目录时访问，不发送模型生成请求。

开发模式使用 `pnpm dev`。开发服务器与 WXT 调试工具仅用于开发，不是产品运行所需的后端。

## 查看视觉草案

```powershell
pnpm preview:design
```

打开 `http://127.0.0.1:4317/`。两种方向分别为“纸页收藏馆”和“轨道观测室”，每套均支持独立明暗模式。

页面使用本地 HTML/CSS、字体与少量几何图形，不连接第三方服务。演示数据明确标注为演示，不表示真实账户状态。可直接打开 `docs/design/preview.html` 离线查看。

设计预览与 Chrome 扩展构建相互独立，预览页面不进入扩展构建；正式工作区复用的字体会作为本地静态资源打包。

## 权限与隐私

扩展基础权限为 `storage`，以及 `api.github.com` 与 `gitee.com` 主机范围；内容脚本仅匹配 `github.com`；AI 服务声明可选 HTTPS 主机与指定 HTTP loopback 范围，仅在主动测试或获取模型目录时请求对应主机权限，不默认授予所有网站访问权。没有申请 alarms、notifications 或 cookies 权限。

内容脚本只发送页面就绪与仓库线索，不观察点击，不读取 Token/API Key，不修改页面收藏状态。Git 账号连接、读取同步以及 AI 配置和模型目录访问仅由受信任的扩展管理页触发。当前没有修改远端 Stars 或 Lists 的接口，也没有 AI 模型生成调用。

不要将 Token、API Key、Client Secret 写进项目文件或提交历史。本地分类、笔记、标签没有跨设备云同步；卸载或清除扩展数据存在丢失风险。

## Git 同步边界

- 在设置页为每个平台填写 Personal Access Token 或私人令牌，无需注册 OAuth App 或配置 Client ID。不读取本机 Git 客户端的登录凭证。
- GitHub 验证时检查账号身份及 Stars / Lists / items 查询；Gitee 验证时检查账号身份与 Stars 读取能力。只读取令牌可见的数据，不自动提升权限。受令牌类型、权限、有效期或组织策略影响的内容仍需真实账号验收。
- 每次保存令牌前重新识别账号，验证失败不覆盖旧凭证。默认仅保留到浏览器会话结束，勾选“在此设备记住令牌”后才写入本地存储；这些存储不是加密保险箱。令牌不会回传 UI 或自动刷新，失效后需更换。
- 管理页打开时驱动分页；关闭所有管理页后暂停，重新打开后从已保存页面继续。后台重启不丢失已保存进度，浏览器重启丢失会话凭证后需要重新填写令牌、重新同步。
- 规则「只同步 Stars」只更新项目，完全不动本地分类；规则「同步 Stars 与 Lists」按远端 Lists 增量维护分类。
- 跟随远端的分类会按远端结果更新或删除；用户在本地改过名称、说明或拖动过归属的分类会脱离远端跟踪，之后不再被覆盖。手动创建的分类始终只保存在本地。
- 同步完成前不改变旧快照。HTTP 错误、GraphQL 部分错误、分页数量变化、重复游标或服务端截断均停止提交；可重新发起完整同步。
- GitHub 的多次分页读取不是远端事务；同步期间修改收藏可能导致数量检查失败，需要重试。大量 Stars 被 GitHub 标记 `isOverLimit` 时会明确停止，不提交截断结果。Gitee 的集合接口没有总量字段，只能按返回条数推断结束。
- 完成同步只替换仓库与分类归属，不删除取消 Star 项目的本地标签、笔记。移除此设备凭证保留快照，不等于在平台撤销令牌。

## 文档

- [产品设计](docs/superpowers/specs/2026-10-09-amazing-stars-design.md)
- [实施计划](docs/superpowers/plans/2026-10-09-amazing-stars-implementation.md)
- [Git provider 与分类设计](docs/superpowers/specs/2026-10-10-git-providers-and-categories-design.md)
- [Git provider 与分类实施计划](docs/superpowers/plans/2026-10-10-git-providers-and-categories-implementation.md)
- [视觉候选](docs/design/visual-direction.md)
- [GitHub Access Token 配置](docs/setup/github-oauth.md)
- [AI 服务配置准备](docs/setup/ai-provider.md)
- [当前验证记录](docs/acceptance.md)

## 许可证

项目代码采用 [MIT License](LICENSE)。设计预览使用的第三方字体另附其原始授权文件，位于 `docs/design/assets/`。
