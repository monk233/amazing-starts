# Git 多 Provider 同步与本地分类实施计划

日期：2026-10-10
设计依据：`../specs/2026-10-10-git-providers-and-categories-design.md`。
目标：把仅支持 GitHub 的同步链路扩展为 Git provider 抽象，并让同步结果成为可本地管理的分类体系。

## 执行原则

- 按依赖顺序推进，每一步都保持 `pnpm test` 与 `pnpm typecheck` 可运行。
- 不引入新的第三方依赖，不为单一实现建立抽象层。
- 不读取真实 Token，不修改任何远端数据，不执行提交或推送。

## 阶段 1：数据模型与分类逻辑

文件：`src/data/types.ts`、`src/library/categories.ts`。

1. `Account` 增加可选 `provider`、`syncMode`；`List` 增加可选 `source`、`tracked`；`Membership` 增加可选 `source`。
2. 提供默认值解释函数：缺失 `provider` 视为 `github`，缺失 `syncMode` 按 provider 取值，缺失 `source` 视为 `remote`。
3. `src/library/categories.ts` 实现纯函数 `planCategories`：按设计 §3.2 的合并规则计算分类与归属的增删改。
4. 同文件实现分类校验与 ID 生成：名称 1–80 字符、说明 ≤500 字符、手动分类 ID 为 `local:<uuid>`。

验收：`planCategories` 六个分支各有单测；非法名称、超长说明被拒绝。

## 阶段 2：增量提交

文件：`src/data/database.ts`。

1. `commitGitHubSnapshot` 改名为 `commitSyncSnapshot`，接收账号、任务与快照。
2. 提交前用只读事务读取现有分类与归属，调用 `planCategories` 得到计划。
3. 单写事务内替换 repositories，按计划写入/删除分类与归属，保留手动分类、`tracked=false` 分类及其归属。
4. 规则为「只同步 stars」时跳过分类与归属写入。
5. 清理指向已移除仓库的保留归属。

验收：既有快照测试改用新方法后继续通过；新增测试覆盖手动分类保留、本地改名保留、远端删除分类、stars 模式不触碰分类。

## 阶段 3：Git 消息与服务

文件：`src/git/types.ts`、`src/git/service.ts`、`src/github/*`、`src/gitee/*`。

1. `src/git/types.ts` 定义 provider、`SyncMode`、`GitState`、`GIT_*` 消息与严格校验函数。
2. `GitService` 接管凭证保管、连接、断开、取消、分页步进、提交与状态聚合，按账号 provider 选择适配器。
3. `GitHubAdapter` 复用现有 client 与分页函数；`sync.ts` 增加规则分支：`stars` 模式在 stars 之后直接进入提交。
4. `GiteeClient` 实现身份校验与 stars 分页，`GiteeAdapter` 实现单页读取与任务建立。
5. 删除被取代的 `src/github/service.ts` 与其消息类型。

验收：原有 GitHub 同步测试迁移到新服务后通过；新增 Gitee 测试覆盖身份校验、分页结束、重复记录、401/403/429、页数上限。

## 阶段 4：后台接入

文件：`src/messaging.ts`、`entrypoints/background.ts`、`wxt.config.ts`。

1. 消息授权改用 `gitMessage`，管理页消息集合加入分类命令。
2. 后台实例化为 `GitService`，分类命令走同一服务。
3. manifest 增加 `https://gitee.com/*` 主机权限。

验收：消息边界测试覆盖新命令、非法分类名、伪造来源；`pnpm build` 生成的 manifest 只含预期权限。

## 阶段 5：界面

文件：`src/ui/use-git.ts`、`src/ui/GitSettings.tsx`、`src/ui/SettingsTabs.tsx`、`src/ui/Library.tsx`、`src/ui/library.css`、`src/ui/settings.css`、`src/ui/DataBoundary.tsx`、`entrypoints/manager/main.tsx`。

1. 控制器改用 `GIT_*`；同步阶段展示按 provider 与规则过滤。
2. 设置页主标签改为 Git，新增子标签 GitHub 与 Gitee，两个子面板复用账号面板组件：凭证表单、账号列表、规则选择、同步操作、移除凭证。
3. 收藏页侧栏改为分类，分类行支持放置拖拽、菜单改名/说明/删除；star 行可拖拽并提供等价的移动下拉。
4. 选中分类时展示说明；分类操作失败时显示错误而不静默。
5. 数据边界页补充 Gitee 与「分类仅本地」的说明。

验收：`pnpm typecheck` 通过；分类增删改、拖拽与移动下拉在管理页可用；空态、错误态与禁用态齐备。

## 阶段 6：验证

1. `pnpm test`：全部通过，并覆盖新增分支。
2. `pnpm typecheck`：通过。
3. `pnpm build`：通过，产物 `.output/chrome-mv3`。
4. 更新 `docs/acceptance.md`，记录本轮实际执行的验证与未验证项（真实 Gitee 账号、真实多账号联调仍未执行）。
