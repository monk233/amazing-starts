# GitHub OAuth 配置准备

状态：准备说明。M1 尚未实现真实 GitHub 登录，当前不需要把 Client ID 或 Token 放入源码。

## 项目需要什么

使用项目自己的 GitHub OAuth App，并启用 Device Flow。不要使用 GitHub CLI 的 Client ID，不要把个人 gh 登录凭证复制进插件。

注册过程属于账号权限变更，需要用户自行操作或另行明确授权。本轮没有创建 OAuth App。

## 注册字段建议

| 字段 | 内容 |
| --- | --- |
| Application name | amazing-starts |
| Homepage URL | `https://github.com/monk233/amazing-starts` |
| Application description | A local-first Chrome extension for organizing and browsing GitHub Stars. |
| Authorization callback URL | 表单如要求填写，可使用项目主页；Device Flow 不通过该 URL 回调，当前没有实现回调服务器。 |
| Enable Device Flow | 开启 |

注册完成后保留 OAuth App 的 Client ID。Client ID 是公开应用标识，不是 Client Secret。后续 M2 会提供项目 Client ID 的配置方式；当前不要编造一个值来让界面显示已连接。

## 授权行为

真实流程应由用户点击登录后才开始：插件展示 user code、打开 GitHub 验证页，按服务端指定间隔轮询。实现需要处理等待、拒绝、取消、过期和 slow_down。

授权成功后重新读取账号身份，再按稳定用户 ID 隔离缓存和任务。当前账号不得由用户填写的 login 字符串代替。

`createUserList` 的真实接口在前期操作中要求 `user` scope。该权限覆盖范围大于 Lists，需要在授权说明中诚实展示。后续实施按真实请求确认最小 scope，不默认复制本机 CLI 的完整 `repo` 权限。

本项目的 Device Flow 不使用 Client Secret。不要在源码、构建产物、README、聊天或 Git 提交中放入 Client Secret、Access Token 或 Refresh Token。

## 当前边界

M1 的管理页仅展示未接入状态；没有远端请求、模拟账号或自动授权。真实登录验收必须等 M2 接入并提供有效 Client ID 后进行。

参考：`https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`。
