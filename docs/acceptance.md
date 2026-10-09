# M0 / M1 验证记录

日期：2026-10-09。范围：视觉候选与基础工程，不是完整产品验收。

## 已实际执行

| 项目 | 结果 | 边界 |
| --- | --- | --- |
| 依赖安装 | 已生成 pnpm-lock.yaml，最终安装成功 | 初次 postinstall 早于入口文件创建而失败；入口齐备后 wxt prepare 成功 |
| `pnpm typecheck` | 通过 | 首次缺少 JSX 编译选项；配置 react-jsx 后通过 |
| `pnpm test` | 5 个文件、36 个测试全部通过 | 使用 fake-indexeddb 和内存 StorageArea，不是 Chrome 真实权限验收 |
| `pnpm build` | 通过，构建产物总计约 259.76 kB | 未压缩的文件合计，不等于商店安装包大小 |
| `git diff --check` | 通过 | 没有执行提交或推送 |
| Manifest 内容检查 | storage 与 github.com 主机范围，四类入口已生成 | 尚未加载到真实 Chrome 扩展环境 |
| 视觉浏览器操作 | 两个方向的收藏、详情、设置页已查看和截图 | 运行于 Codex 内置浏览器中的独立 HTML 预览 |
| 搜索 | 输入 syncthing 仅显示一条演示结果 | 本地关键词搜索，不是 AI 自然语言检索 |
| 分类筛选 | 选择“设计”仅显示 penpot 演示项 | 不代表远端分类已实现 |
| 主题 | 两种方向均能分别切换亮色和暗色 | 系统变化逻辑有单元测试；未修改操作系统外观来做端到端测试 |
| 响应式 | 1440×900、1366×768 与 390×844 检查，无观察到的横向溢出 | 窄屏额外检查详情与设置 |
| 浏览器控制台 | 检查时未记录 error 日志 | 仅代表本次预览交互 |

## 测试覆盖

- 所有计划数据表初始化为空，不注入模拟账号。
- 相同记录 ID 在不同账号间隔离。
- 拒绝跨账号写入和替换。
- 快照替换为单一事务，重复 ID 和不能序列化的数据不会破坏旧快照。
- 不能写入的数据不会留下未处理的事务 Promise 拒绝。
- 不支持的数据库和设置版本不会被自动重置。
- 默认凭证只进入 session，取消记住凭证会移除持久副本。
- 并发凭证写入按顺序处理，账号和凭证类型隔离。
- UI 与内容脚本消息能力分离，任意 URL 请求、伪造来源、额外字段均被拒绝。
- 系统模式解析与手动明暗设置保持一致。

## 视觉证据

截图保存在本机 `artifacts/visual/`，该目录被 Git 忽略；可版本化的视觉来源是 `docs/design/preview.html`、CSS、JS 与字体资源。

- `folio-library.jpg`、`folio-detail.jpg`、`folio-settings.jpg`
- `observatory-library.jpg`、`observatory-detail.jpg`、`observatory-settings.jpg`
- `folio-narrow.jpg`

截图为浏览器真实渲染结果，不是 AI 生成图片。

Impeccable 机械检查因缺少 HTML/CSS 解析模块而降级为正则扫描，报告了一项 Fraunces 常见字体警告。没有安装额外解析器，也没有把降级结果当作对比度或可访问性通过证明。完整无障碍审计仍未执行。

## 尚未验证或实现

- Chrome 中实际加载扩展、工具栏弹窗与 Service Worker 生命周期。
- 真实 GitHub OAuth、scope 最小化、完整分页、Lists 读写。
- 真实 AI 兼容性、费用、Token/API Key 输入、主机权限请求。
- 自动分类、任务队列、手册、语义检索、项目对比、动态跟踪。
- 最终艺术方向和全部生产界面。

没有创建 OAuth App，没有修改任何 GitHub Stars/Lists，没有执行付费请求，没有推送代码或发布扩展。
