# GitHub Access Token 配置

当前使用 Personal Access Token（PAT）连接 GitHub。无需注册 OAuth App、填写 Client ID 或 Client Secret，也不再显示 Device Flow 授权码。

## 配置步骤

1. 构建后在 Chrome 扩展管理页重新加载 `.output/chrome-mv3`，再刷新管理页面。
2. 在 GitHub 的 Settings → Developer settings → Personal access tokens 中创建适合当前账号和访问范围的 Token。
3. 打开扩展「设置与偏好 → GitHub」，粘贴到 Access Token 密码输入框。
4. 默认不勾选“在此设备记住 Token”；如需跨浏览器重启保留凭证，可自行勾选。
5. 点击“验证并保存”。后台读取账号身份，并测试 Stars、Lists 和首个可见 List 的 items 读取接口。通过后保存，页面显示实际用户名；输入框不会回填 Token。
6. 点击该账号的“同步收藏”。所有分页完成前继续显示原有本地快照。

Token 仅通过 Authorization 请求头发送到固定的 `https://api.github.com`，不通过 URL、页面跳转或第三方服务发送。

## 权限与有效期

Token 的类型、权限、资源归属和组织策略会影响可见范围。扩展不自动请求更大的 scope，也不默认要求完整 `repo` 权限。

连接验证是少量只读请求，不代表每个 List 或所有私有仓库都已验证。没有 Lists 的账号无法预先验证真实 List items 的权限；后续同步遇到权限不足、组织限制、缺失数据或 GraphQL 部分错误时会停止，保留旧快照。实际最小权限仍需用你的 Token 验收。

Token 过期或撤销后需要手动更换；没有自动刷新机制。401 会清除此账号已失效的本地凭证，保留账号资料、收藏快照和笔记。其他错误显示具体类型，不以空列表代替失败。

## 本地存储与更换

- 默认仅保存在浏览器会话存储中；勾选记住后写入本地存储。两者均限制为受信任的扩展上下文，不是加密保险箱。
- 只有管理页可以发起连接，内容脚本和弹窗不能保存或读取 Token。后台回复不会包含 Token。
- 验证新 Token 失败时保留旧凭证。验证成功后按实际 GitHub node ID 保存，不接受手填账号名决定存储账号。
- 同一账号更换 Token 会取消尚未完成的暂存同步，防止将两种权限范围的分页拼成一个快照。可重新点击同步。
- “移除此设备凭证”只删除指定账号的本地 Token 并取消同步，保留本地资料；在 GitHub 撤销 Token 是另外的操作。
- 历史 OAuth 账号缓存保留。尚有效的旧 Access Token 可继续读取至失效，但不会继续 Device Flow 或自动刷新；成功保存 PAT 后清除旧 Client ID 和待授权记录。

## 当前验收边界

自动化测试使用模拟 HTTP / GraphQL 响应，覆盖验证保存、权限失败保留旧凭证、账号隔离、会话与持久存储切换、失效处理及现有完整分页同步。未使用用户真实 Token，也没有读取真实账户数据。

官方参考：`https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens`。
