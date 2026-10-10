# Git 多 Provider 同步与本地分类设计

日期：2026-10-10
状态：经用户确认后编写，作为实现依据。
范围：把原先仅支持 GitHub 的同步链路扩展为 Git provider 抽象（GitHub、Gitee），并把同步结果落到可在本地管理的分类体系。

## 1. 原始需求与决策

用户提出六项需求，逐条落到设计：

1. GitHub 设置页支持多用户配置 —— 同一 provider 下可连接多个账号，每个账号独立凭证、独立同步状态、独立同步规则。
2. 设置页主标签由 GitHub 改为 Git。
3. Git 设置页包含子标签 GitHub 与 Gitee。
4. 支持 GitHub stars 同步与 Gitee stars 同步。
5. 支持两种同步规则：只同步 stars 不同步 Git Lists；同步 stars 与 Git Lists 并自动把 Lists 建成分类。
6. 同步过的 stars 支持手动建分类、拖拽改变分类、增删改分类说明、改分类名、删除分类（删除后其中的 star 归为未分类）。

已确认的三个决策：

- 规则「只同步 stars」时不触碰任何已有分类与归属。
- 拖拽语义为移动：从原分类移除再加入目标分类。
- 接受 Gitee 的能力边界：Gitee 无 Git Lists 概念，API 也不返回 star 收藏时间。

## 2. 数据模型

现有数据库版本与表结构不升级，只增加可选字段；旧记录缺失字段时按默认值解释，因此不需要迁移。

| 位置 | 变更 |
| --- | --- |
| `Account.provider` | 可选，`'github' \| 'gitee'`；缺失视为 `github` |
| `Account.syncMode` | 可选，`'stars' \| 'stars+lists'`；缺失时 GitHub 视为 `stars+lists`，Gitee 视为 `stars` |
| `List.source` | 可选，`'remote' \| 'manual'`；缺失视为 `remote`（历史数据来自 GitHub Lists） |
| `List.tracked` | 可选，仅 `source='remote'` 有意义；`true` 表示该分类仍跟随远端同步 |
| `Membership.source` | 可选，`'remote' \| 'manual'`；缺失视为 `remote` |

账号边界保持稳定：GitHub 账号 ID 继续使用 GraphQL node id，Gitee 账号 ID 使用 `gitee:<user.id>`，两者不会撞车，也避免 Gitee 数字 ID 与既有记录冲突。

分类 ID 约定：远端导入的分类沿用远端 List ID；手动分类使用 `local:<uuid>`。归属 ID 继续使用 `<listId>:<repositoryId>`。

## 3. 同步规则

### 3.1 规则「只同步 stars」（`stars`）

分页只读取 stars，提交阶段只替换该账号的 repositories。分类、归属完全不动。GitHub 与 Gitee 都支持。

### 3.2 规则「同步 stars 与 Lists」（`stars+lists`）

分页依次读取 stars、Lists、每个 List 的 items，提交阶段同时更新 stars 与分类归属。仅 GitHub 支持，因为 Gitee 没有 Lists。

分类的合并规则（`planCategories`）：

- 远端有、本地没有 —— 新建分类，`source='remote'`、`tracked=true`，归属按远端 items 写入。
- 远端有、本地也有且 `tracked=true` —— 更新名称、说明、可见性与归属，仍跟随远端。
- 远端有、本地也有但 `tracked=false` —— 完全不动。用户改过的名字、说明与归属优先，不再被远端覆盖。
- 远端没有、本地有且 `tracked=true` —— 删除该分类及其归属（远端已删除的事实）。
- 远端没有、本地有且 `tracked=false` —— 保留。
- `source='manual'` 的分类与其归属 —— 始终不动。

用户对某个远端来源分类做本地修改（改名、改说明、拖拽移动归属）时，该分类（以及被拖出的来源分类）置 `tracked=false`，从此脱离远端跟踪。界面对跟随远端的分类显示来源标记并解释这一行为。

### 3.3 取消 star

repositories 是完整快照，未出现在快照中的仓库会被移除；本地标签、维度、手册保留（分属其他表）。保留下来的手动分类归属若指向已移除的仓库，则在提交时清理，避免悬空归属。

## 4. Provider 抽象

新增 `src/git/` 作为 provider 无关的边界，`src/github/` 与 `src/gitee/` 各自负责协议细节。

- `GitAdapter`：`verify(token)` 校验凭证并返回账号；`newJob(accountId, now, mode)` 建立任务；`fetchPage(token, job)` 读取一页。
- `GitService`：凭证保管、连接、断开、取消、分页步进、提交、状态聚合。按账号记录里的 provider 选择适配器。
- `GitHubAdapter` 复用现有 `GitHubClient` 与 `fetchSyncPage`（GraphQL 游标分页）。
- `GiteeAdapter` 使用 `GiteeClient`：`GET https://gitee.com/api/v5/user` 校验身份，`GET https://gitee.com/api/v5/user/starred` 以 `page`/`per_page=100` 分页，认证使用 `Authorization: Bearer`。返回条数少于每页数量即视为结束，并设置页数上限防止失控循环。

消息统一为 `GIT_*`，替代原 `GITHUB_*`（内部接口，无外部调用者）：`GIT_READ`、`GIT_CONNECT{provider,token,remember}`、`GIT_SYNC|GIT_STEP|GIT_CANCEL_SYNC|GIT_DISCONNECT{accountId}`、`GIT_RULE_SAVE{accountId,mode}`、`GIT_CATEGORY_SAVE{accountId,id,name,description}`、`GIT_CATEGORY_DELETE{accountId,categoryId}`、`GIT_CATEGORY_MOVE{accountId,repositoryId,categoryId}`。消息校验沿用现有严格风格：字段数量固定、值必须匹配受限格式。

Gitee 字段映射：`id`、`full_name`、`description`、`private`、`language` 直接映射；`topics` 为空数组（Gitee 无该概念）；`starredAt` 为空字符串，界面显示「暂无记录」；`pushedAt` 取 `pushed_at`，缺失时回退 `updated_at`；`archived` 无可靠来源，固定为 `false`。

## 5. 分类管理

全部为本地操作，不写回远端：扩展仍然只读取远端，不会创建或修改 GitHub Lists。

- 新建：名称必填（1–80 字符，不含控制字符），说明可选（≤500 字符），`source='manual'`。
- 改名与改说明：远端来源分类改动后置 `tracked=false`。
- 删除：删除分类记录与其归属；其中的 star 回到「未分类」。若分类 `tracked=true` 且来源为远端，界面提示下次按规则二同步时可能重新导入。
- 拖拽移动：把 star 从原分类移到目标分类（`GIT_CATEGORY_MOVE`），源分类与目标分类的 `tracked` 都置 `false`；目标是「未分类」时表示移出所有分类。
- 键盘与触摸兜底：star 行提供「移动到分类」下拉，与拖拽等价。

## 6. 界面

设置页：主标签 `02 Git`，内含子标签 GitHub 与 Gitee，两个子面板复用同一个账号面板组件——凭证表单（含「在此设备记住 Token」）、账号列表、每个账号的同步规则选择、同步/取消、进度、移除本机凭证。

收藏页：侧栏 `GitHub Lists` 改为 `分类`，分类行可放置拖拽的 star；分类行提供菜单做重命名、编辑说明、删除；选中分类时标题区展示其说明；star 行提供移动到分类的替代入口。

## 7. 边界与未做

- 分类不写回远端；远端 Lists 仍是只读。
- Gitee 仅有 stars 规则，无分类自动导入，无收藏时间。
- Gitee 分页没有总量交叉校验，仅按返回条数推断结束。
- 未实现 Gitee 的私有仓库额外权限处理与限流退避调度。
- 未实现分类手动排序、多分类拖拽复制、分类合并。

## 8. 验证

- 单元与集成测试：消息边界、Gitee 连接与分页、同步规则分支、`planCategories` 各分支、分类增删改与移动、跨账号隔离。
- 工程验证：`pnpm test`、`pnpm typecheck`、`pnpm build`。
- 不读取或使用真实 Token，不修改任何远端数据。
