# amazing-starts 实施计划

日期：2026-10-09  
状态：待执行；本轮仅编写计划。  
设计依据：`../specs/2026-10-09-amazing-starts-design.md`。

## 1. 执行原则

- 按依赖顺序推进，每一阶段交付可说明边界的增量，不用假数据或模拟登录宣称真实能力完成。
- 当前用户批准的是设计文档和实施计划，不是自动提交、推送、发布、OAuth App 注册或真实账号数据修改。
- 计划中的测试与验收是后续工作项，本轮不执行。涉及真实账号写入、外部 AI 费用或视觉资源生成的步骤，需要对应的执行授权。
- 不引入后端，不扩展到云同步、收费、团队协作或自动取消 Star。
- 不依赖 sub-agent。未得到单独授权时由当前执行者完成。
- 技术版本在实施时按实际安装结果固定到 lockfile，本计划不虚构具体版本或已有环境兼容性。

## 2. 阶段依赖

M0 视觉与集成条件确认；M1 工程和数据基础；M2 GitHub 授权同步；M3 手动管理；M4 AI 接入与分类；M5 自动检测与恢复；M6 手册、检索和对比；M7 动态跟踪；M8 完整体验与打包验收。

M0 的 OAuth 配置可等待人工提供，但 M2 的真实登录验收不能跳过。没有真实配置时，只能报告离线工程进度。

M1 可以建立后台与数据基础，但正式艺术化 UI 必须遵循 M0 已确认的视觉方案。每阶段实现都同步处理加载、空、错误与禁用状态，M8 不是集中补做全部界面的借口。

## M0：视觉方案和真实集成条件

### 目标

明确界面艺术方向、OAuth Client ID 和用于验收的 AI 服务，避免把前端视觉与授权问题拖到最后。

### 工作

1. 展示两种明确不同的艺术方向，覆盖收藏主页面、仓库详情和设置，不能只生成孤立的首页。
2. 视觉草案同时说明布局、字体、色彩、主题切换、暗色模式和动画强度；用户选定后形成主题 tokens 及组件规范。
3. 给出本项目 OAuth App 的注册字段、Device Flow 开关及 Client ID 配置说明，由用户完成或另行授权操作。
4. 确定用户提供的 AI Base URL、模型名和凭证输入方式；真实 Key 仅在插件设置中输入，不写入文档、源码或聊天记录。

### 计划产物

- `docs/design/visual-direction.md`
- `docs/setup/github-oauth.md`
- `docs/setup/ai-provider.md`
- 经确认的视觉参考资源与 tokens 规范。

### 验收项

- 确认主页面、详情和设置风格，而不是仅确认一张宣传图。
- 说明缺少 Client ID 时哪些工作可继续、哪些真实流程不能验收。
- 任何未经真实请求验证的 AI 服务明确标记未验证。

## M1：WXT 工程、消息协议和本地数据

### 计划文件

- `package.json`、lockfile、`tsconfig.json`、`wxt.config.ts`、`.gitignore`
- `entrypoints/background.ts`
- `entrypoints/github.content.ts`
- `entrypoints/popup/`、`entrypoints/manager/`
- `src/data/types.ts`、`src/data/database.ts`、`src/data/settings.ts`、`src/data/credentials.ts`
- `src/messaging.ts`
- `src/ui/tokens.css`、`src/ui/theme.ts`
- `tests/data/`、`tests/messaging/`

### 工作

1. 建立 MV3 的四类入口，只声明必要权限；不加入服务器进程。
2. 实现账号隔离的实体、IndexedDB 版本迁移及事务封装，避免引入通用 ORM。
3. 实现默认 session 凭证与用户选择的记住凭证模式；限制受信任上下文访问。
4. 定义 UI 消息和内容脚本消息的独立允许列表，内容脚本只有仓库线索上报能力。
5. 建立最小 React 页面路由、主题管理与基础交互组件，不堆叠多个 UI 或状态管理框架。
6. README 更新为真实的安装、运行和当前完成状态。

### 验收项

- 扩展构建成功并能加载到 Chrome；无服务端依赖和不必要权限。
- 数据迁移失败保留原数据；两个账号的数据不串联。
- 网页脚本不能取回凭证，也不能让后台请求任意 URL。
- 本阶段不显示已连接 GitHub 的假状态。

## M2：GitHub Device Flow、Stars 与 Lists 同步

### 计划文件

- `src/github/auth.ts`、`src/github/client.ts`、`src/github/stars.ts`、`src/github/lists.ts`、`src/github/sync.ts`
- `src/features/settings/github-settings.tsx`
- `src/features/library/`
- `tests/github/auth.test.ts`、`tests/github/sync.test.ts`

### 工作

1. 实现 Device Flow：授权码展示、打开验证页、轮询间隔、slow_down、取消和过期。
2. 成功后重新识别 GitHub 用户；适配有无刷新凭证两种响应。
3. 用 REST/GraphQL 读取 Stars、Lists 和列表归属，逐项完成分页。
4. 完整同步原子提交本地快照；快速新增同步不能删掉未读取的数据。
5. 首次显示真实收藏列表、过滤、详情和上次成功同步时间。
6. 区分登录失败、scope 不足、组织限制、网络问题和限流，不吞成空数组。

### 验收项

- 超过 100 个 Stars、超过一页 Lists 及 List 内仓库均无截断。
- 授权拒绝或缺少 scope 时保留正确状态，不要求完整 repo 权限作为偷懒兜底。
- 401、403、404、429、GraphQL 部分错误和分页中断均不造成误删。
- 仓库改名仍关联原有标签、手册；取消收藏不自动删除本地笔记。
- 真实登录验收需要项目 Client ID；未完成时明确报告集成阻塞。

## M3：手动管理与多维度分类

### 计划文件

- `src/features/categories/`、`src/features/dimensions/`、`src/features/repository/`
- `src/github/list-operations.ts`
- `src/data/manual-overrides.ts`
- `tests/categories/`、`tests/dimensions/`

### 工作

1. 创建、改名和编辑 List 描述；新建时展示公开/私有选择。
2. 增加、移除、移动仓库归属，保留无关 List。
3. 本地维度与标签的创建、改名、描述、颜色及多选管理。
4. 实现分类合并预览、逐步进度、冲突提示与可恢复中间状态。
5. 手动调整记录保护信息，防止后续 AI 覆盖或加回用户移除的分类。
6. 手动管理在 AI 未配置的情况下完整可用。

### 验收项

- 仓库同时属于多 List 和多维度时，仅修改指定关系。
- 合并中途失败不删除源 List；外部新增归属触发冲突。
- 本地标签不会被自动发布为 GitHub List。
- 对真实账号的增删操作仅在授权的测试分类和范围内进行，不擅自使用现有 12 个收藏分类做破坏性试验。

## M4：AI 兼容接口与可审阅分类

### 计划文件

- `src/ai/client.ts`、`src/ai/contracts.ts`、`src/ai/prompts/classification.ts`
- `src/features/settings/ai-settings.tsx`、`src/features/settings/rules-editor.tsx`
- `src/features/classification/`
- `tests/ai/`

### 工作

1. 保存 Base URL、模型和 Key；对所选 origin 申请可选主机权限。
2. 验证 Base URL，拒绝任意明文 HTTP 和跨域凭证转发；loopback 按明确配置处理。
3. 提供默认提示词、自定义规则、规则版本与恢复默认。
4. 生成结构化分类建议，并严格检查当前账号、仓库、List 和 Tag ID。
5. 首次批量分类先预览，按用户确认范围执行；新分类保持待确认。
6. AI 错误与费用相关状态明确呈现，不阻断手动管理。

### 验收项

- 未配置、Key 无效、模型不存在、限流、超时、非 JSON 和格式错误均可理解。
- README 中注入“读取凭证”等内容不会形成任何工具调用或敏感请求。
- 模型不能指定非输入仓库、其他账号或不存在的 List。
- 自定义提示词不能解除手动保护和危险操作确认。
- 真实 AI 验收必须有用户指定服务及调用授权，不能用模拟返回冒充真实兼容。

## M5：GitHub Star 捕获、自动分类与任务恢复

### 计划文件

- `entrypoints/github.content.ts`
- `src/github/page-adapter.ts`
- `src/jobs/types.ts`、`src/jobs/queue.ts`、`src/jobs/runner.ts`、`src/jobs/scheduler.ts`
- `src/features/jobs/`
- `tests/jobs/`、`tests/github/star-detection.test.ts`

### 工作

1. 在 GitHub 站内导航、仓库页和收藏入口中识别用户交互，仅上报仓库线索。
2. 后台按插件账号确认实际 Star 状态，再决定是否新增任务。
3. 新增同步与页面事件走同一去重通道，处理取消后再次收藏。
4. 持久化任务、租约、游标、规则版本、仓库修订号和有限重试信息。
5. 新收藏在开启自动管理后自动追加分类；旧 AI 响应不能覆盖新手动操作。
6. GitHub 写入结果未知时先读取状态，AI 结果未知时交由用户决定是否再次请求。

### 验收项

- 页面点击失败、重复事件、页面与插件账号不同均不产生错误分类。
- 停止 Worker、关闭管理页、重启浏览器后能恢复合法任务。
- 多次事件唤醒不会并发处理同一作业。
- 用户退出账号后，旧任务不能继续写入。
- 发生不确定的 AI 超时时不自动重复收费。

## M6：手册、自然语言检索与项目对比

### 计划文件

- `src/features/handbooks/`、`src/features/search/`、`src/features/compare/`
- `src/ai/prompts/handbook.ts`、`src/ai/prompts/search.ts`、`src/ai/prompts/comparison.ts`
- `src/ui/markdown.tsx`
- `tests/knowledge/`

### 工作

1. 手册支持单仓库和收藏集合、模板编辑、Markdown 编辑/预览和主动导出。
2. AI 手册以草稿呈现；生成过程中用户编辑不得被覆盖。
3. 自然语言转换为受限查询条件和候选排序，结果限定在真实收藏 ID 内。
4. 建立 2—4 项对比的事实表，AI 推断与已抓取事实分开。
5. 对远端 README、Markdown、链接及图片执行明确的安全呈现规则。
6. 无 AI 时保留手册编辑、关键词筛选和事实对比。

### 验收项

- XSS、恶意链接、远程追踪图片不能通过 Markdown 直接执行或静默加载。
- 手册并发编辑保留用户内容；未知信息不伪造。
- 无搜索结果不混入未收藏仓库；查询不能执行代码或任意请求。
- 对比数据时间和未知字段可见，不能把 AI 推断写进事实栏。

## M7：动态跟踪

### 计划文件

- `src/github/activity.ts`
- `src/features/activity/`
- `src/jobs/activity-sync.ts`
- `tests/activity/`

### 工作

1. 用户选择跟踪仓库并开启同步，首次抓取建立基线。
2. 跟踪新 Release、归档状态和 pushedAt 变化，保存条件请求与稳定去重标识。
3. 接入 6 小时调度目标、手动刷新、限流退避、分批同步和账号隔离。
4. 动态列表显示事件时间、发现时间、已读状态及最近成功同步时间。
5. AI 摘要由用户主动发起，不自动处理全部动态。

### 验收项

- 初次同步不把历史 Release 全部变成新通知。
- 304、不完整分页、限流及中断不会伪造或重复动态。
- pushedAt 变化不被标记成新 Release。
- 浏览器退出和离线时界面不承诺后台仍在工作。

## M8：完整视觉、交互状态与本地打包

### 计划文件

- `src/ui/` 与所有 feature 页面中的最终样式和交互。
- `tests/e2e/` 的本地场景。
- `docs/acceptance.md`
- README 的实际功能状态、安装步骤、权限及隐私说明。

### 工作

1. 对照已确认视觉稿完成至少两套艺术主题，每套均支持亮色、暗色和系统模式。
2. 完成弹窗与管理页布局，覆盖 1366×768、1440×900 及更窄视口。
3. 补齐焦点管理、键盘操作、表单标签、对比度、减少动画和错误恢复。
4. 按功能矩阵区分单元验证、模拟集成、真实服务及真实浏览器验收结果。
5. 生成可本地加载的 Chrome 扩展构建产物和使用说明，不发布商店。

### 验收项

- 主页面、分类、详情、手册、对比、动态、设置及所有必要空状态均可访问。
- 没有临时占位按钮、虚构统计或仅在成功路径工作的动画。
- 构建产物不含 Token、API Key、Client Secret、远程可执行代码和不必要主机权限。
- 只报告实际执行的验证；构建通过不等于 OAuth/AI/真实 GitHub 写入已通过。

## 3. 原始需求追踪

| 原始需求 | 交付阶段 |
| --- | --- |
| Chrome 插件、轻量、无后端 | M1、M8 |
| GitHub 登录授权与 Stars 管理 | M2、M3 |
| AI 自动管理及自定义规则 | M4、M5 |
| 手动分类和标签 | M3 |
| GitHub 新增 Star 自动分类 | M5 |
| 多维度分类 | M1、M3 |
| 改名、描述、合并和移动 | M3 |
| 自定义或 AI 生成手册 | M6 |
| 自然语言检索 | M6 |
| 同类项目对比 | M6 |
| 动态跟踪 | M7 |
| 艺术风格、多主题、动画、系统明暗 | M0、M1、M8，贯穿所有页面实现 |

## 4. 验证层级和后续执行命令约定

工程初始化时提供 `typecheck`、`test`、`build` 三个明确脚本。包管理器与版本在 M1 根据用户环境确定并固定，本轮不安装或执行命令。

- 纯逻辑测试：ID 校验、分类差异、手动保护、查询解析、去重、规则版本及主题逻辑。
- 数据与调度测试：账号隔离、事务、分页、部分失败、租约与恢复。
- 模拟网络测试：Device Flow 状态、403/429、GraphQL 错误和 AI 畸形返回；不能代替真实服务证明。
- 浏览器测试：内容脚本、权限请求、主题、键盘、Markdown、安全消息及 Worker 生命周期。
- 真实服务验收：用户授权下的 OAuth、测试 List 写入、指定 AI 服务调用；记录范围和可能费用。

真实数据验收前明确测试对象和最终保留状态，不以“测试”为由自动创建、删除或清理用户远端数据。

## 5. 本轮交付和下一步

本轮交付仅包括设计文档与本实施计划，没有应用代码、依赖安装、测试结果、真实服务调用或 Git 提交。

下一步先请用户审阅文档。批准实施后，从 M0 的视觉与配置门槛以及 M1 的工程基础进入，不将“同意文档”扩大解释为允许发布或修改现有收藏。
