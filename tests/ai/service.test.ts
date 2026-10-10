import { describe, expect, it, vi } from 'vitest';
import { AiService } from '../../src/ai/service';
import { isAiInput, normalizeBaseUrl, permissionOrigin } from '../../src/ai/config';
import { MemoryStorage } from '../helpers/storage';

const baseUrl = 'https://provider.example/v1';
const input = { baseUrl, apiKey: 'secret-test-key', model: '', remember: false };
function fixture(fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] }))) {
  const local = new MemoryStorage(), session = new MemoryStorage();
  const permission = vi.fn(async () => true);
  return { local, session, fetcher, permission, service: new AiService(local, session, permission, fetcher) };
}

describe('AI 配置与地址边界', () => {
  it('normalizes HTTPS and permits only explicit HTTP loopback', () => {
    expect(normalizeBaseUrl(' https://provider.example/v1/ ')).toBe(baseUrl);
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
    expect(permissionOrigin('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1/*');
    for (const url of ['http://provider.example/v1', 'file:///x', 'https://user:password@provider.example', 'https://provider.example/?key=x', 'https://provider.example/#x', 'invalid']) {
      expect(() => normalizeBaseUrl(url)).toThrow();
    }
  });
  it('rejects extra message fields, malformed credentials and oversized values', () => {
    expect(isAiInput(input)).toBe(true);
    expect(isAiInput({ ...input, apiKey: 'key\r\nInjected: value' })).toBe(false);
    expect(isAiInput({ ...input, extra: true })).toBe(false);
    expect(isAiInput({ ...input, model: 'a'.repeat(257) })).toBe(false);
  });
  it('defaults to session-only storage and never returns the API Key', async () => {
    const f = fixture();
    expect(await f.service.read()).toEqual({ config: null, hasApiKey: false });
    const saved = await f.service.save(input);
    expect(JSON.stringify(f.local.items)).not.toContain(input.apiKey);
    expect(JSON.stringify(f.session.items)).toContain(input.apiKey);
    expect(JSON.stringify(saved)).not.toContain(input.apiKey);
    const restarted = new AiService(f.local, new MemoryStorage(), f.permission, f.fetcher);
    expect((await restarted.read()).hasApiKey).toBe(false);
    await expect(restarted.models(baseUrl)).rejects.toThrow('当前会话没有 API Key');
  });
  it('persists only by explicit opt-in and removes the durable copy when disabled', async () => {
    const f = fixture();
    await f.service.save({ ...input, remember: true });
    expect(JSON.stringify(f.local.items)).toContain(input.apiKey);
    expect(JSON.stringify(f.session.items)).not.toContain(input.apiKey);
    await f.service.save({ ...input, apiKey: '', model: 'chosen', remember: false });
    expect(JSON.stringify(f.local.items)).not.toContain(input.apiKey);
    expect((await f.service.read()).config?.model).toBe('chosen');
    expect(JSON.stringify(f.session.items)).toContain(input.apiKey);
  });
  it('requires a new explicit key when either origin or API path changes', async () => {
    const f = fixture();
    await f.service.save(input);
    for (const target of ['https://other.example/v1', 'https://provider.example/v2']) {
      await expect(f.service.save({ ...input, baseUrl: target, apiKey: '' })).rejects.toThrow('请输入 API Key');
    }
    const target = 'https://other.example/v1';
    await f.service.save({ ...input, baseUrl: target, apiKey: 'replacement-secret' });
    expect(JSON.stringify(f.session.items)).not.toContain(input.apiKey);
    await expect(f.service.models(baseUrl)).rejects.toThrow('其他页面修改');
    await f.service.models(target);
    expect(f.fetcher).toHaveBeenCalledWith(`${target}/models`, expect.objectContaining({ headers: { Authorization: 'Bearer replacement-secret', Accept: 'application/json' } }));
  });
  it('does not send a newly entered key to the old endpoint when config persistence fails', async () => {
    const f = fixture(); await f.service.save(input);
    vi.spyOn(f.local, 'set').mockRejectedValueOnce(new Error('disk failure'));
    await expect(f.service.save({ ...input, baseUrl: 'https://other.example/v1', apiKey: 'replacement-secret' })).rejects.toThrow();
    await f.service.models(baseUrl);
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/models`, expect.objectContaining({ headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json' } }));
  });
});

describe('真实模型目录请求', () => {
  it('only makes a bounded GET without cookies, redirects or a generation body', async () => {
    const f = fixture(); await f.service.save(input);
    expect(await f.service.models(baseUrl)).toEqual(['model-a', 'model-b']);
    expect(f.permission).toHaveBeenCalledWith('https://provider.example/*');
    expect(f.fetcher).toHaveBeenCalledWith(`${baseUrl}/models`, expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' }));
    expect(f.fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
  it('does not send any request when permission is denied', async () => {
    const f = fixture(); await f.service.save(input); f.permission.mockResolvedValue(false);
    await expect(f.service.models(baseUrl)).rejects.toThrow('尚未授权');
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 429, 500])('handles HTTP %s without exposing the upstream error body', async status => {
    const f = fixture(vi.fn(async () => new Response(input.apiKey, { status }))); await f.service.save(input);
    const error = await f.service.models(baseUrl).catch(error => error as Error);
    if (!(error instanceof Error)) throw new Error('预期服务请求失败。');
    expect(error.message).toContain(`HTTP ${status}`); expect(error.message).not.toContain(input.apiKey);
  });
  it.each([{ data: [] }, { data: [{ id: 'valid' }] }])('accepts a valid or empty model catalog', async body => {
    const f = fixture(vi.fn(async () => Response.json(body))); await f.service.save(input);
    expect(await f.service.models(baseUrl)).toEqual(body.data.map(model => model.id));
  });
  it.each(['not JSON', '{}', '{"data":[{}]}', '{"data":[{"id":""}]}', JSON.stringify({ data: [{ id: input.apiKey }] })])('rejects incompatible or sensitive response %s', async body => {
    const f = fixture(vi.fn(async () => new Response(body))); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow();
  });
  it('bounds the response size', async () => {
    const f = fixture(vi.fn(async () => new Response('x'.repeat(1_048_577)))); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow('响应过大');
  });
  it('reports network errors without reflecting secrets', async () => {
    const f = fixture(vi.fn(async () => { throw new Error(input.apiKey); })); await f.service.save(input);
    await expect(f.service.models(baseUrl)).rejects.toThrow('网络请求失败');
  });
  it('aborts after 15 seconds and releases the operation queue', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })));
      await f.service.save(input);
      const pending = expect(f.service.models(baseUrl)).rejects.toThrow('请求超时');
      await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(15_001); await pending;
      expect((await f.service.read()).hasApiKey).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('serializes config changes with in-flight requests so endpoints and keys do not mix', async () => {
    let respond!: (response: Response) => void;
    const f = fixture(vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    await f.service.save(input);
    const pending = f.service.models(baseUrl);
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
    const save = f.service.save({ ...input, baseUrl: 'https://other.example/v1', apiKey: 'replacement-secret' });
    respond(Response.json({ data: [] }));
    await pending; await save;
    expect(f.fetcher.mock.calls[0]?.[0]).toBe(`${baseUrl}/models`);
    expect((await f.service.read()).config?.baseUrl).toBe('https://other.example/v1');
  });
});
