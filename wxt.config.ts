import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'amazing-starts',
    description: '更从容地浏览、分类和整理 GitHub Stars。',
    permissions: ['storage'],
    host_permissions: ['https://github.com/*'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
    },
  },
});
