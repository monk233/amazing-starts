# amazing-stars Chrome 扩展设计

日期：2026-10-09  
状态：根据已确认的产品方案编写；应用代码尚未实现。  
范围：Chrome 扩展、无自建后端、用户自行配置 AI 服务。

更新记录（2026-10-10）：用户确认 GitHub 连接方式由 OAuth Device Flow 改为 Personal Access Token。本文件 §5.1 的 Device Flow 流程、§5.2 的 OAuth scope 申请流程与 §13 第 1 项的 OAuth Client ID 门槛均由该调整取代，原文保留作为设计历史。当前实现、权限声明与验收状态以 README、`docs/setup/github-oauth.md` 和 `docs/acceptance.md` 为准。

## 1. 已确认的决策

1. 使用 Chrome Manifest V3、WXT、React 和 TypeScript。
2. 使用 GitHub 账号授权读取 Stars，并管理 GitHub Lists。
3. AI 由用户配置 Base URL、API Key 和模型名称，插件直接访问所配置服务。
4. 支持默认分类提示词、自定义规则、AI 自动管理及完全不依赖 AI 的手动管理。
5. GitHub 页面新增 Star 后自动分类；其他设备产生的变化通过同步补充。
6. GitHub Lists 保存远端分类与归属；维度、标签、手册、规则等扩展信息仅保存在本机。
7. 支持多维度分类、重命名、描述修改、合并分类和移动仓库。
8. 支持手动或 AI 生成手册、自然语言检索、项目对比和动态跟踪。
9. 提供独特的视觉设计、多主题、亮色、暗色、跟随系统与适度动画。
10. 不因为本次设计文档授权而注册 OAuth App、修改 GitHub 收藏、发送 AI 请求、提交、推送或发布扩展。

项目名称使用 `Amazing Stars`，产品所管理的 GitHub 功能称为 Star。两者同名但含义不同：前者是产品与仓库名，后者指 GitHub 的 Star 功能。

## 2. 交付边界

首版服务 GitHub.com 和 Chrome 桌面浏览器。不引入服务器、账户数据库、云端任务、付费体系、团队协作、浏览器间本地数据同步、向量数据库或常驻本地进程。

无后端指没有项目自建服务，不代表离线。GitHub API 与 AI 服务仍需要网络。手动管理不依赖 AI；断网时可浏览已有缓存和编辑本地资料，远端修改只能进入明确可见的待同步状态。

不增加自动取消 Star、自动删除分类、自动公开手册、自动修改仓库代码等能力。手册默认仅保存在本地。

## 3. 功能与模块

| 模块 | 职责 |
| --- | --- |
| 工具栏弹窗（后续阶段） | 显示连接状态、当前仓库是否在收藏中、分类状态和管理页入口 |
| 独立管理页 | 收藏浏览、分类维度、仓库详情、手册、对比、动态和设置 |
| 后台 Service Worker | GitHub 请求、AI 请求、认证状态、任务调度和业务写入 |
| GitHub 内容脚本 | 识别 Star 操作并发送仓库线索，不读取 Token/API Key |
| GitHub 适配层 | Stars 分页、仓库信息、Lists 查询和修改、Release 信息 |
| AI 适配层 | 用户配置的兼容聊天接口、响应校验、分类、检索、手册与对比 |
| 本地数据层 | 账号隔离、缓存、维度、标签、任务、手册、动态与迁移 |

所有远端请求由受信任的扩展上下文发起。内容脚本不能向后台提交任意 URL、请求头、AI 提示词或 GitHub GraphQL 文本。

## 4. 数据模型及归属

### 4.1 实体

| 实体 | 关键字段 | 归属 |
| --- | --- | --- |
| Account | GitHub 用户稳定 ID、login、avatar、授权能力 | 本地账号信息 |
| Repository | 稳定节点 ID、owner/name、描述、语言、topics、可见性、starredAt、pushedAt、archived、fetchedAt | GitHub 数据缓存 |
| List | GitHub List ID、名称、描述、可见性、同步时间 | GitHub 为准 |
| ListMembership | accountId、repositoryId、listId | GitHub 为准 |
| Dimension | 本地 ID、名称、描述、顺序 | 本地 |
| Tag | 本地 ID、dimensionId、名称、颜色 | 本地 |
| RepositoryTag | accountId、repositoryId、tagId、来源 | 本地 |
| ManualOverride | 仓库 ID、被保护的归属字段、修订号、修改时间 | 本地 |
| RuleSet | 默认提示词、自定义规则、版本、自动管理开关 | 本地 |
| Handbook | ID、标题、仓库范围、模板、Markdown、来源、修订号、更新时间 | 本地 |
| Comparison | 所选仓库 ID、事实快照、分析文本、来源时间 | 本地 |
| Job | 账号、类型、目标、状态、去重键、版本、尝试次数、下次运行时间 | 本地 |
| Activity | 仓库、变化类型、旧值、新值、发生或发现时间、已读状态 | 本地 |

多维度不是 Lists 的嵌套结构。例如仓库可同时属于 GitHub List“AI工具”，以及本地维度“使用状态”下的“正在使用”和维度“部署方式”下的“可自部署”。

首版维度允许多个标签值，不引入单选字段、任意字段表达式或无限嵌套层级。标签在同一维度中重名时提示用户，不静默创建重复项。界面明确区分“同步至 GitHub”和“仅此设备”。

### 4.2 存储

- `chrome.storage.local`：主题、规则、AI 非敏感配置、当前账号和小体积设置。
- `chrome.storage.session`：默认保存 GitHub Token、刷新凭证和 AI Key；不写入 Chrome Sync。
- 用户主动开启“在此设备记住凭证”后，才持久保存对应凭证，并提示本地访问风险。
- `IndexedDB`：仓库缓存、多对多关系、手册、动态、比较结果和可恢复任务；事务保护关联更新和任务领取。
- 扩展存储设置 `TRUSTED_CONTEXTS`，内容脚本不直接访问本地敏感配置。
- 每条账号业务数据以稳定的 `accountId` 隔离。切换账号时，旧账号的运行中任务停止继续写入，新账号不继承旧账号的规则和关系。
- 不在日志、任务载荷、错误弹窗、导出文档中保存凭证。AI 配置读取接口只能返回“已配置”状态及脱敏信息。
- 设置与数据库有独立版本。迁移失败不删除原数据，也不假装首次初始化成功。

退出登录清除凭证并暂停该账号任务，不静默删除本地手册和标签。浏览器重启后如果未记住凭证，界面明确提示重新授权或填写 AI Key。

## 5. GitHub 授权与权限

### 5.1 Device Flow

> 历史设计（已被取代）：本节描述的 Device Flow 授权流程自 2026-10-10 起不再使用，实际实现改为 Personal Access Token，见文首更新记录与 `docs/setup/github-oauth.md`。以下内容保留作为设计历史。

注册本项目的 OAuth App，启用 Device Flow。Client ID 是公开配置，不能使用 GitHub CLI 的 Client ID 或复用开发者自己的 CLI Token。

流程：用户主动登录，获取 device code 和 user code，打开 GitHub 验证页面，按服务端 interval 轮询，成功后调用用户身份接口，以真实用户 ID 建立账号边界。

处理等待授权、拒绝授权、过期、取消、网络错误和 `slow_down`。轮询时间与过期信息必须可恢复，不使用 Service Worker 内永久计时循环。长期关闭授权页面后停止主动轮询，用户返回后按有效期继续或重新申请。

响应若包含过期时间和 refresh token，按 Device Flow 刷新方式处理，不引入 client secret。未返回刷新凭证时不能假设存在。刷新和账号切换采用版本检查，旧授权响应不得覆盖新登录状态。

未配置有效 Client ID 时提供真实的设置说明，不使用模拟登录冒充 GitHub 登录。OAuth App 注册和真实授权属于后续人工配置步骤。

### 5.2 OAuth scope

> 历史设计（部分被取代）：Personal Access Token 由用户自行选择权限范围，扩展不再走 OAuth 授权申请 scope 的流程。本节关于最小权限与不静默扩权的约束仍然有效，具体范围由用户在 GitHub 上为 Token 配置。

本次会话已有真实接口证据表明 `createUserList` 要求 `user` scope。该 scope 不仅覆盖本产品需要的列表操作，授权界面必须解释权限范围。

初始授权以 Lists 管理所需的 `user` 为候选最小 scope，实施时验证真实查询与写入能力。不能根据本机 CLI 已具有 `repo` 权限而把同样权限默认复制给插件。

首版观察用户在 GitHub 网站上的 Star 操作，不代替网站执行 Star 或取消 Star，因此不默认增加仅为该类写入所需的权限。若真实调用发现额外 scope 必需，应停止对应能力并说明原因，不静默扩大授权。

私有仓库和受组织策略限制的数据，只按用户实际授权能力处理；不默认申请完整 `repo` 权限，不把权限不足当作仓库已删除。

### 5.3 Chrome 权限

当前已申请的权限限于 `storage` 与 `https://api.github.com/*` 主机范围。Github.com 内容脚本匹配范围仅限产品所需网站。

`alarms` 属于 M5（新增 Star 检测与自动分类）和 M7（动态跟踪）引入后台定时唤醒时才增加的权限。M1/M2 的实现把同步进度保存在持久化任务中，由管理页打开时驱动分页，因此 manifest 目前不声明 `alarms`，也没有调度层。

AI 自定义地址采用 optional host permissions，由用户保存配置时的明确手势请求所选 origin，不一次性授权所有网站。普通服务仅允许 HTTPS；用户明确配置本地服务时才允许 loopback HTTP，不泛化为任意明文 HTTP 地址。

不申请 cookies、history、webRequest、通知或 broad tabs 权限，除非后续具体实现证明必需并另行说明。首版动态在插件内部展示，不发送系统通知。

修改 Base URL 后必须重新确认目标并重新取得其主机权限；旧 API Key 不自动转发到另一个 origin。网络请求拒绝跨 origin 重定向携带凭证。

## 6. GitHub 同步与分类写入

### 6.1 初次导入和后续同步

Stars、Lists 及 List 内仓库均完成分页，不能仅处理前 100 项。同步记录开始时间、页游标、账号和完成状态。只有一次成功完成的快照才能决定哪些远端关系已被移除。

快速同步处理新增收藏，完整核对处理取消收藏、仓库改名、转移及外部修改。使用稳定仓库 ID，不以 owner/name 作为永久主键。

404、403、限流或分页中断不等于取消 Star。只有完整权威快照或明确状态查询才可改变收藏可见状态。本地手册和用户笔记不因远端不可访问而被自动删除。

GitHub 是 Lists 和远端归属的事实来源。远端变化同步到本地；本地待写操作成功后再确认已同步。暂未成功的修改必须显示 pending 或 failed，不展示虚假成功。

### 6.2 创建、改名、描述和移动

GitHub 适配层封装 `createUserList`、`updateUserList`、`deleteUserList`、`updateUserListsForItem`，实施时按实际 schema 固定输入输出，避免 UI 直接拼接 mutation。

修改仓库 Lists 归属前读取最新归属，合并目标操作后提交完整集合，保留无关列表。明确区分“添加到分类”和“从 A 移动至 B”；移动只移除用户指定的来源，不清空其他维度或列表。

新建 List 在 UI 中显式展示公开/私有设置，不把插件中的本地标签错误发布成公开 List。

GitHub Lists 没有本产品可依赖的跨请求原子事务。跨设备并发修改可能冲突；不宣称本地版本号能够锁住远端。发现冲突时提示用户刷新并重新确认。

### 6.3 合并分类

1. 用户确认源分类、目标分类、涉及仓库及是否在结束时删除源分类。
2. 记录可恢复作业；逐仓库把目标分类加入最新归属集合，保留其他分类。
3. 全部添加成功后处理移出源分类；失败保留源分类及未完成进度。
4. 最后重新读取源分类，若出现新的仓库或外部变化，停止删除并要求重新确认。
5. 仅在用户原先明确选择删除且迁移成功时删除源分类。

遇到部分成功必须展示具体进度；不执行猜测式整体回滚，不因重试重复创建列表。

## 7. AI 管理

### 7.1 配置与网络

单一兼容聊天接口适配器，配置 Base URL、API Key、模型名及请求超时。手动管理在 AI 未配置、离线、超时或配额不足时仍可使用。

“测试连接”由用户主动触发，并说明可能产生供应商费用。设置界面保存凭证后不再返回明文 Key。供应商不支持结构化响应时采用普通文本 JSON 解析和同样严格的运行时校验，不以“兼容”宣称所有供应商均已验证。

默认发送仓库公开元数据和当前操作需要的规则。README 仅在手册、对比或分类信息不足且用户允许时获取必要片段；截断需要在结果中标注。私有仓库资料未经单独同意不得发送到外部 AI。

仓库描述、README 和模型响应均视为不可信数据，不能覆盖系统规则、要求读取凭证或构造执行工具。

### 7.2 默认分类规则

默认提示词表达以下要求：

- 优先根据主要用途分类，语言与框架作为辅助信号。
- 优先使用已有 List ID、Tag ID 和维度，不按相似名称重复创建。
- 允许同一仓库多分类、多维度，但必须给出简短理由和置信度。
- 不取消 Star，不删除、合并或重命名分类，不覆盖受保护的手动调整。
- 新分类或新标签只能作为待确认建议，不能凭模型输出直接远端创建。
- 信息不足时标记需要人工处理，不用猜测填满分类。
- 只能返回本次输入范围内的仓库 ID 和允许的字段，不返回可执行代码。

自定义规则作为受限的产品输入加入提示词，版本变更使旧分类任务重新检查；不能解除产品的账号、权限、手动保护和危险操作确认边界。

### 7.3 分类结果契约

结果由 repositoryId、目标 listIds、tagIds、理由、confidence 和 needsReview 组成。应用层校验 ID 是否来自当前账号的输入集合，去重后再计算差异。

自动分类只追加允许的归属，不移除现有归属。默认置信度阈值作为产品配置保存；首次实现设置为 0.8，低于阈值进入待确认，不把模型自报置信度当作校准概率。

首次批量整理必须先预览并确认。自动管理开关由用户主动打开；打开后，新收藏按当时规则处理，不把历史收藏全部静默重分类。

手动移除的 AI 分类需要记录保护信息，避免下次分类又自动加回。手动修改和规则修改都更新仓库或规则修订号，旧 AI 响应到达时不再直接落地。

## 8. 新增 Star 检测与后台作业

GitHub 内容脚本捕获可信的用户交互，适配站内导航与动态 DOM，提取仓库标识后发送 `STAR_HINT`。不劫持页面 fetch，不获取 GitHub Cookie，不把按钮文本当作收藏成功的最终证据。

后台验证消息来源、消息类型、仓库标识和当前账号，调用 GitHub 核实收藏状态。只有确认为该账号的新增收藏、自动管理已开启且没有受保护的手动状态时才入队。

GitHub 网站登录账号与插件账号可能不同。插件不能仅凭网站显示的按钮状态替另一个账号分类；核实失败时展示说明，不尝试切换用户或修改 Star。

其他设备的新增收藏在同步发现后进入同一流程。去重键包含 accountId、repositoryId、收藏生命周期和 ruleVersion；取消后重新收藏应能形成新事件，而同一事件的多次 DOM 消息不能产生多次费用。

作业状态：queued、running、retry_wait、needs_review、succeeded、failed、cancelled。持久化租约防止同一账号的并发触发重复执行；Worker 终止后通过租约到期恢复，外部写入前重新核对目标状态。

网络超时后的 GitHub 写入先核对远端结果，再决定是否重试。AI 请求中断且结果未知时进入 needs_review，不自动反复付费调用；首版不承诺供应商端 exactly-once。

（后续阶段）`chrome.alarms` 只用于唤醒和补偿，不承诺精确定时或浏览器退出时继续运行。启动时检查并重建必要闹钟，调度按持久化 nextRunAt 恢复。

## 9. 手册、检索、对比和动态

### 9.1 收藏手册

支持用户选择单仓库或一组仓库，编辑标题、章节模板和 Markdown 内容。默认模板包含用途、适用场景、技术栈、部署信息、相关链接及个人备注。

AI 生成先形成草稿，不直接覆盖用户修改过的内容；生成期间发生本地编辑时保留两个版本供用户选择。未知部署要求、成本或许可证必须标记未知，不从模型常识虚构。

渲染 Markdown 不执行 HTML/脚本；外链协议受限，远程图片默认不自动加载。手册默认本地保存，可由用户主动导出 Markdown，不自动创建 Gist、PR 或仓库文件。

### 9.2 自然语言检索

提供两层能力：本地名称、描述、语言、标签筛选始终可用；AI 配置后把自然语言转成受限查询条件，并对当前收藏候选集进行匹配说明。

结果只能引用本地收藏中存在的仓库 ID。展示解释后的筛选条件，允许用户修改；不执行模型生成的 JavaScript、SQL 或任意网络请求。无匹配即显示无结果，不推荐未收藏的项目混充命中。

首版不引入向量模型或向量数据库，不宣称实现全网搜索。

### 9.3 同类项目对比

用户选择 2—4 个仓库后生成事实表。事实项包含描述、语言、许可证、归档状态、最近更新时间、Release 信息及资料来源时间；未知字段显示未知。

AI 分析为单独区域，说明适用场景和差异。事实与推断分开，许可证字段只展示仓库声明，不提供法律结论。无 AI 时保留事实表。

### 9.4 动态跟踪

用户主动开启并选择跟踪仓库。首版跟踪新 Release、归档状态变化和 pushedAt 变化；pushedAt 只表示仓库活动，不等于新版本或具体功能发布。

默认每 6 小时安排一次轻量同步，可手动刷新；间隔是调度目标而非保证。按账号分批、限流、保存游标与条件请求信息。第一次抓取建立基线，不把全部历史 Release 推为新动态。

新 Release 以稳定 ID 去重，变化记录区分事件时间和发现时间。不默认调用 AI 总结每次更新；用户主动生成摘要时再调用 AI。

## 10. 界面与视觉交付

### 10.1 页面

- 收藏页：搜索、维度筛选、分类导航、卡片/列表、同步状态和批量操作。
- 仓库详情：真实元数据、GitHub 分类、本地维度标签、手册、动态。
- 分类管理：创建、重命名、描述、归属调整、合并预览和冲突反馈。
- 手册页：模板、Markdown 编辑、预览、AI 草稿和版本冲突状态。
- 对比页：事实表与 AI 分析分区。
- 动态页：跟踪范围、更新列表、已读状态、上次成功同步时间。
- 设置页：GitHub、AI、规则、外观、数据归属说明。
- 弹窗（后续阶段）：简洁的快捷入口，不在窄窗口复制完整后台界面。

### 10.2 艺术方向与主题

视觉方向先形成可比较的主页面、详情及设置参考，再经用户确认后编码。艺术方向不在未看到方案前假称已获批准。

首版交付至少两套有明显差异且可读的艺术主题，不把亮色与暗色算作两个主题。每套主题均支持 light、dark 和 system；使用共享语义化 CSS tokens 保持组件一致。

系统模式跟随 prefers-color-scheme，用户手动选择后保持其选择。尊重 prefers-reduced-motion；交互反馈以短时 opacity/transform 为主，不使用持续粒子动画拖慢管理界面。

主页面在 1366×768 和 1440×900 下保持主要操作可见；窄屏不出现无法访问的操作栏。全部交互支持键盘、可见焦点、清楚标签和必要的对比度。

### 10.3 必须设计的状态

未登录、缺少 GitHub 凭证、无收藏、未配置 AI、同步中、部分失败、权限不足、限流、离线、无搜索结果、AI 待确认、手动保护、任务中断、主题切换、分类合并冲突。

不得使用虚构统计数字填满界面，不以成功提示掩盖 pending 状态。

## 11. 模块目录建议

以下目录属于后续实现计划，本轮不创建应用文件。

- `entrypoints/background.ts`：后台入口。
- `entrypoints/github.content.ts`：GitHub 页面适配。
- `entrypoints/popup/`：工具栏弹窗（后续阶段）。
- `entrypoints/manager/`：独立管理页。
- `src/github/`：认证、查询、同步与 Lists 写入。
- `src/ai/`：兼容接口、提示词、输出契约。
- `src/data/`：数据库、版本迁移、账号隔离与凭证。
- `src/jobs/`：调度、去重、租约和恢复。
- `src/features/`：收藏、分类、手册、搜索、对比、动态、设置。
- `src/ui/`：公共交互组件与主题。
- `tests/`：与核心行为对应的定向测试。

避免预先建立通用插件市场、万能工作流引擎或供应商抽象层级。先实现一个清晰的 AI 适配器和一个 GitHub 适配器。

## 12. 完成标准及授权边界

完成标准包括真实授权、完整分页、手动管理、多维度保护、自动分类、手册、检索、对比、动态、多主题、可恢复错误和凭证边界。不能以有页面截图或通过构建代替真实功能完成。

本次只写设计和实施计划，不运行测试、不安装依赖、不注册 OAuth App、不生成视觉资源、不调用付费 AI、不操作真实收藏、不提交、不推送、不发布。后续验证项目已写入实施计划，真实账号写入和可能付费的请求需在对应执行范围得到用户授权。

## 13. 已知边界与实施门槛

1. GitHub 连接改用 Personal Access Token 后不再需要 OAuth Client ID，原 OAuth App 配置门槛作废；Token 类型、权限与组织策略下的真实读取范围仍需在用户提供的 Token 下验收。
2. AI 兼容性以实际服务测试结果为准，不能仅凭接口名宣布全部兼容。
3. Lists 合并是可恢复的组合操作，不具有跨设备原子性。
4. 外部 AI 请求可能收费，超时无法证明供应商未完成推理。
5. 纯本地资料没有自动跨设备恢复；卸载或清除插件数据有丢失风险。
6. 内容脚本依赖 GitHub 页面结构，因此必须有同步补偿，不承诺所有页面版本即时捕获。
7. 视觉方案确认是正式 UI 编码前的门槛，而不是跳过其他功能的理由。

## 14. 参考依据

核对日期：2026-10-09。接口细节以实施时官方文档和真实授权返回为准；本节不表示已完成集成测试。

- GitHub Docs：Authorizing OAuth apps，Device Flow、轮询和刷新流程。
  `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`
- GitHub Docs：Scopes for OAuth apps。
  `https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps`
- GitHub Docs：REST API endpoints for starring。
  `https://docs.github.com/en/rest/activity/starring`
- Chrome for Developers：The extension service worker lifecycle。
  `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle`
- Chrome for Developers：Storage、Permissions、Alarms。
  `https://developer.chrome.com/docs/extensions/reference/api/storage`
  `https://developer.chrome.com/docs/extensions/reference/api/permissions`
  `https://developer.chrome.com/docs/extensions/reference/api/alarms`
- Chrome for Developers：Cross-origin network requests、Content scripts。
  `https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`
  `https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts`
- WXT：Introduction。
  `https://wxt.dev/guide/introduction.html`
