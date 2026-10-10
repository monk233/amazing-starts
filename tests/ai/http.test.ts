import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { AiService } from '../../src/ai/service';
import { MemoryStorage } from '../helpers/storage';

describe('本地 HTTP 集成验证（合成 Key，不访问外部服务）', () => {
  it('sends a real GET and never follows a credential-bearing redirect', async () => {
    const requests: { path: string; authorization?: string; method?: string }[] = [];
    const server = createServer((request, response) => {
      requests.push({ path: request.url ?? '', authorization: request.headers.authorization, method: request.method });
      if (request.url === '/redirect/models') {
        response.writeHead(302, { Location: '/unexpected-target' }).end();
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'local-fixture-model' }] }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const service = new AiService(new MemoryStorage(), new MemoryStorage(), async () => true);
    try {
      await service.save({ baseUrl: `${origin}/v1`, apiKey: 'synthetic-integration-key', model: '', remember: false });
      expect(await service.models(`${origin}/v1`)).toEqual(['local-fixture-model']);
      expect(requests[0]).toEqual({ path: '/v1/models', method: 'GET', authorization: 'Bearer synthetic-integration-key' });
      await service.save({ baseUrl: `${origin}/redirect`, apiKey: 'synthetic-redirect-key', model: '', remember: false });
      await expect(service.models(`${origin}/redirect`)).rejects.toThrow('不允许重定向');
      expect(requests.map(request => request.path)).toEqual(['/v1/models', '/redirect/models']);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
