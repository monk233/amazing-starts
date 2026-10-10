import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { GitState } from '../../src/git/types';
import { GitSettings } from '../../src/ui/GitSettings';
import { Library } from '../../src/ui/Library';
import type { GitController } from '../../src/ui/use-git';

const controller = (state: GitState | null, patch: Partial<GitController> = {}): GitController => ({
  state, busy: false, loading: false, error: '', refreshKey: 'render-test', clearError: () => undefined, send: async () => true, ...patch,
});
/** React 在文本插值边界插入注释节点，断言渲染结果前先剥离。 */
const visible = (html: string) => html.replace(/<!-- -->/g, '');
const giteeState: GitState = {
  kind: 'git',
  accounts: [{
    account: { id: 'gitee:1', accountId: 'gitee:1', login: 'gitee-user', avatarUrl: '', provider: 'gitee', syncMode: 'stars' },
    provider: 'gitee', syncMode: 'stars', connected: true, remember: false, sync: null,
  }],
};

describe('管理页渲染路径', () => {
  it('renders the Git panel with both platform sub-tabs', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(null, { loading: true }) })));
    expect(html).toContain('Git');
    expect(html).toContain('GitHub');
    expect(html).toContain('Gitee');
    expect(html).toContain('Access Token');
    expect(html).toContain('正在读取 GitHub 连接状态…');
    expect(html).toContain('settings-subtabs');
  });
  it('keeps Gitee accounts out of the GitHub panel and reports its fixed rule', () => {
    const html = visible(renderToString(createElement(GitSettings, { git: controller(giteeState) })));
    expect(html).toContain('还没有连接 GitHub 账号。');
    expect(html).not.toContain('只同步 Stars（Gitee 没有 Lists）');
  });
  it('renders the library shell with the category rail while data loads', () => {
    const html = renderToString(createElement(Library, {
      git: controller(null), route: 'library', notice: null,
      children: createElement(GitSettings, { git: controller(null) }),
    }));
    expect(html).toContain('分类');
    expect(html).toContain('新建分类');
    expect(html).toContain('未分类');
    expect(html).toContain('正在读取本地收藏');
  });
  it('renders the settings route with the Git panel mounted', () => {
    const html = renderToString(createElement(Library, {
      git: controller(giteeState), route: 'settings', notice: null,
      children: createElement(GitSettings, { git: controller(giteeState) }),
    }));
    expect(html).toContain('设置与偏好');
    expect(html).toContain('管理外观、Git 连接、AI 服务与数据边界。');
    expect(html).toContain('Gitee');
  });
});
