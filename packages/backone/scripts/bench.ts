/**
 * BackOne 基准工具。
 *
 * 运行：
 *   bun run bench            # 微观基准（纯 handle()，不经网络，稳定可靠）
 *   bun run bench --network  # 网络基准（对照裸 Bun.serve，含客户端噪声）
 *
 * 微观基准直接调用 server.handle(request)，测量框架请求管线的纯 CPU 开销，
 * 不受网络栈与 fetch 连接池波动影响，适合版本回归观察。
 */

import { createServer } from '../lib/index.ts';

const ITERATIONS = 100_000;
const WARMUP = 2_000;

async function measureHandle(
  name: string,
  app: ReturnType<typeof createServer>,
  path: string
): Promise<number> {
  const request = new Request(`http://localhost${path}`);
  for (let i = 0; i < WARMUP; i += 1) {
    await app.handle(request);
  }
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    await app.handle(request);
  }
  const elapsed = performance.now() - start;
  const rps = (ITERATIONS / elapsed) * 1000;
  const each = (elapsed / ITERATIONS).toFixed(3);
  console.log(
    `  ${name.padEnd(26)} ${Math.round(rps).toLocaleString().padStart(10)} handle/s  (${each}ms each)`
  );
  return rps;
}

async function runMicroBench(): Promise<void> {
  const bare = createServer();
  bare.get('/hello', () => 'pong');

  const withMiddleware = createServer();
  withMiddleware.use(async (ctx, next) => {
    ctx.state.a = 1;
    return next();
  });
  withMiddleware.use(async (ctx, next) => {
    ctx.state.b = 2;
    return next();
  });
  withMiddleware.use(async (ctx, next) => {
    ctx.state.c = 3;
    return next();
  });
  withMiddleware.get('/hello', () => 'pong');

  const withBuiltins = createServer();
  withBuiltins.useLogger({ out: () => {} });
  withBuiltins.useCors();
  withBuiltins.use(async (ctx, next) => {
    ctx.state.a = 1;
    return next();
  });
  withBuiltins.use(async (ctx, next) => {
    ctx.state.b = 2;
    return next();
  });
  withBuiltins.get('/hello', () => 'pong');

  console.log(`微观基准（${ITERATIONS} 次 handle()，不经网络）：\n`);
  const rBare = await measureHandle('无中间件', bare, '/hello');
  const rMw = await measureHandle('3 个自定义中间件', withMiddleware, '/hello');
  const rBuiltin = await measureHandle(
    'logger+cors+2 中间件',
    withBuiltins,
    '/hello'
  );

  console.log(
    `\n  3 中间件开销:        ${(((rBare - rMw) / rBare) * 100).toFixed(1)}%`
  );
  console.log(
    `  logger+cors 开销:    ${(((rBare - rBuiltin) / rBare) * 100).toFixed(1)}%（含中间件实际工作）`
  );
}

async function runNetworkBench(): Promise<void> {
  const requests = 20_000;
  const concurrency = 16;
  const rounds = 3;

  async function once(url: string): Promise<number> {
    for (let i = 0; i < 5_000; i += 1) {
      await fetch(url);
    }
    const start = performance.now();
    const batches = Math.ceil(requests / concurrency);
    for (let batch = 0; batch < batches; batch += 1) {
      const size = Math.min(concurrency, requests - batch * concurrency);
      await Promise.all(Array.from({ length: size }, () => fetch(url)));
    }
    return (requests / (performance.now() - start)) * 1000;
  }

  async function median(url: string): Promise<number> {
    const samples: number[] = [];
    for (let i = 0; i < rounds; i += 1) {
      samples.push(await once(url));
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  }

  const raw = Bun.serve({ port: 0, fetch: () => new Response('pong') });
  const app = createServer({ port: 0 });
  app.get('/hello', () => 'pong');
  const port = await app.listen();

  try {
    const rawRps = await median(`http://127.0.0.1:${raw.port}/`);
    const backoneRps = await median(`http://127.0.0.1:${port}/hello`);
    const overhead = ((rawRps - backoneRps) / rawRps) * 100;
    console.log(
      `\n网络基准（${requests} req × ${rounds} rounds × ${concurrency} 并发，中位数）：\n`
    );
    console.log(
      `  raw Bun.serve   : ${Math.round(rawRps).toLocaleString()} req/s`
    );
    console.log(
      `  BackOne /hello  : ${Math.round(backoneRps).toLocaleString()} req/s`
    );
    console.log(`  overhead        : ${overhead.toFixed(1)}%`);
    console.log('  note: 含 fetch 客户端与网络栈开销，波动较大，仅供参考。');
  } finally {
    raw.stop(true);
    app.close();
  }
}

const network = process.argv.includes('--network');
await runMicroBench();
if (network) {
  await runNetworkBench();
}
