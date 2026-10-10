import { describe, expect, it } from 'vitest';
import { CredentialVault } from '../../src/data/credentials';
import { ACCESS_TOKEN, probe, rig, stars, user } from './helpers';

const REPLACEMENT = 'test_replacement_access_token_456';

describe('GitHub Personal Access Token', () => {
  it('verifies identity and read access before storing a session-only credential', async () => {
    const r = rig(); const state = await r.connect();
    expect(state.accounts[0]?.connected).toBe(true);
    expect(state.accounts[0]?.account.accountId).toBe('U_a');
    expect(JSON.stringify(state)).not.toContain(ACCESS_TOKEN);
    expect(state).not.toHaveProperty('pending'); expect(state).not.toHaveProperty('clientId');
    expect(r.local.items).toEqual({});
    expect(r.session.items['credential:U_a:github']).toContain(ACCESS_TOKEN);
    expect(r.fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.github.com/user', 'https://api.github.com/graphql']);
    expect(r.fetcher.mock.calls[1]?.[1]?.body).toContain('query VerifyAccess');
  });
  it('accepts an account with no visible Stars or Lists', async () => {
    const r = rig(); r.add(user());
    r.add({ data: { viewer: { id: 'U_a', starredRepositories: { totalCount: 0 }, lists: { totalCount: 0, nodes: [] } } } });
    expect((await r.service.handle({ type: 'GITHUB_CONNECT', token: ACCESS_TOKEN, remember: false })).accounts[0]?.connected).toBe(true);
  });
  it('keeps an existing credential and snapshot when replacement validation fails', async () => {
    const r = rig(); await r.connect('U_a', true);
    const before = structuredClone(r.local.items);
    r.add(user()); r.add({ data: { viewer: {} }, errors: [{ message: 'requires scope: secret-server-text' }] });
    await expect(r.service.handle({ type: 'GITHUB_CONNECT', token: REPLACEMENT, remember: false })).rejects.toMatchObject({ code: 'scope' });
    expect(r.local.items).toEqual(before);
    expect(JSON.stringify(await r.service.handle({ type: 'GITHUB_READ' }))).not.toContain(REPLACEMENT);
  });
  it.each([401, 403, 404, 429, 500])('does not save a credential when identity returns HTTP %s', async status => {
    const r = rig(); r.add({ message: ACCESS_TOKEN }, status); r.add(probe());
    const result = r.service.handle({ type: 'GITHUB_CONNECT', token: ACCESS_TOKEN, remember: true });
    await expect(result).rejects.toThrow();
    await result.catch(error => expect(error.message).not.toContain(ACCESS_TOKEN));
    expect(r.local.items).toEqual({}); expect(r.session.items).toEqual({});
    expect((await r.service.handle({ type: 'GITHUB_READ' })).accounts).toEqual([]);
  });
  it('requires the same account in REST and GraphQL', async () => {
    const r = rig(); r.add(user('U_a')); r.add(probe('U_b'));
    await expect(r.service.handle({ type: 'GITHUB_CONNECT', token: ACCESS_TOKEN, remember: false })).rejects.toMatchObject({ code: 'account' });
    expect(r.session.items).toEqual({});
  });
  it.each(['missing', 'null-list', 'missing-items', 'bad-count'])('rejects incomplete access probes: %s', async mode => {
    const r = rig(); r.add(user()); const data = probe() as any;
    if (mode === 'missing') delete data.data.viewer.starredRepositories;
    if (mode === 'null-list') data.data.viewer.lists.nodes = [null];
    if (mode === 'missing-items') delete data.data.viewer.lists.nodes[0].items;
    if (mode === 'bad-count') data.data.viewer.starredRepositories.totalCount = -1;
    r.add(data);
    await expect(r.service.handle({ type: 'GITHUB_CONNECT', token: ACCESS_TOKEN, remember: false })).rejects.toThrow();
    expect(r.local.items).toEqual({}); expect(r.session.items).toEqual({});
  });
  it('replaces durable credentials with session-only storage when unchecked', async () => {
    const r = rig(); await r.connect('U_a', true); await r.connect('U_a', false, REPLACEMENT);
    expect(r.local.items['credential:U_a:github']).toBeUndefined();
    expect(r.session.items['credential:U_a:github']).toContain(REPLACEMENT);
    expect(r.session.items['credential:U_a:github']).not.toContain(ACCESS_TOKEN);
  });
  it('isolates credentials and removes only the selected account while retaining local accounts', async () => {
    const r = rig(); await r.connect('U_a', true); await r.connect('U_b', false, REPLACEMENT);
    const state = await r.service.handle({ type: 'GITHUB_DISCONNECT', accountId: 'U_a' });
    expect(state.accounts.map(item => item.connected)).toEqual([false, true]);
    expect(state.accounts).toHaveLength(2);
    expect(r.local.items['credential:U_a:github']).toBeUndefined();
    expect(r.session.items['credential:U_b:github']).toContain(REPLACEMENT);
  });
  it('cancels incomplete pages when replacing an account credential', async () => {
    const r = rig(); await r.connect(); await r.start(); r.add(stars([], 0)); await r.step();
    const state = await r.connect('U_a', false, REPLACEMENT);
    expect(state.accounts[0]?.sync?.state).toBe('cancelled');
    const count = r.fetcher.mock.calls.length; await r.step(); expect(r.fetcher).toHaveBeenCalledTimes(count);
  });
  it('clears an invalidated saved token without deleting the account', async () => {
    const r = rig(); await r.connect(); r.add({ message: 'Bad credentials' }, 401);
    await expect(r.service.handle({ type: 'GITHUB_SYNC', accountId: 'U_a' })).rejects.toMatchObject({ code: 'unauthorized' });
    const state = await r.service.handle({ type: 'GITHUB_READ' });
    expect(state.accounts[0]?.connected).toBe(false); expect(state.accounts).toHaveLength(1);
  });
  it('expires legacy OAuth credentials without requesting or exposing a refresh token', async () => {
    const r = rig(); await r.connect();
    const vault = new CredentialVault(r.local, r.session);
    await vault.save('U_a', 'github', JSON.stringify({ accessToken: ACCESS_TOKEN, remember: false, expiresAt: 1, clientId: 'legacy-client', refreshToken: 'legacy-refresh' }));
    const state = await r.restart().handle({ type: 'GITHUB_READ' });
    expect(state.accounts[0]?.connected).toBe(false); expect(JSON.stringify(state)).not.toContain('legacy-refresh');
    const count = r.fetcher.mock.calls.length;
    await expect(r.service.handle({ type: 'GITHUB_SYNC', accountId: 'U_a' })).rejects.toThrow('过期'); expect(r.fetcher).toHaveBeenCalledTimes(count);
  });
  it('removes obsolete OAuth configuration after a successful token connection', async () => {
    const r = rig(); await r.local.set({ 'github-client-id': 'legacy-client' }); await r.session.set({ 'github-device-flow': { deviceCode: 'legacy-secret' } });
    await r.connect(); expect(r.local.items['github-client-id']).toBeUndefined(); expect(r.session.items['github-device-flow']).toBeUndefined();
  });
});
