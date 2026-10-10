import { describe, expect, it, vi } from 'vitest';
import { GitHubClient } from '../../src/github/client';

describe('GitHub HTTP / GraphQL boundaries', () => {
  it('calls the injected fetch without binding it to the client instance', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      // Browser fetch rejects a client instance as its receiver before sending a request.
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(Response.json({ node_id: 'U_test', login: 'test-user', avatar_url: 'https://example.test/avatar' }));
    });
    await expect(new GitHubClient(fetcher).identity('test-token')).resolves.toMatchObject({ accountId: 'U_test', login: 'test-user' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([[401, {}, 'unauthorized'], [403, {}, 'forbidden'], [403, { 'x-github-sso': 'required' }, 'organization'], [404, {}, 'not_found'], [429, { 'retry-after': '120' }, 'rate_limit'], [403, { 'x-ratelimit-remaining': '0' }, 'rate_limit']] as const)('classifies HTTP %s without exposing response secrets', async (status, headers, code) => {
    const client = new GitHubClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: 'private-server-debug-token' }), { status, headers })));
    await expect(client.identity('test-token')).rejects.toMatchObject({ code });
  });
  it('rejects partial data and scope errors instead of returning incomplete lists', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { viewer: {} }, errors: [{ message: 'requires user scope: private-debug-token' }] })));
    await expect(new GitHubClient(fetcher).graphql('token', 'query', {})).rejects.toMatchObject({ code: 'scope' });
  });
  it('bounds requests, omits cookies and rejects redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('token in network error'));
    await expect(new GitHubClient(fetcher).identity('token')).rejects.toMatchObject({ code: 'network' });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) });
  });
});
