import { DemoApplication } from './app';

const app = new DemoApplication();
const port = await app.start();
console.log(`BackOne playground: http://127.0.0.1:${port}`);
console.log(
  '  db demo: /api/tasks /api/tasks/:id /api/tasks/batch /api/audit /api/db'
);
console.log(
  '  utils demo: /api/tools/config /api/tools/ids /api/tools/rank /api/tools/token /api/tools/me /api/tools/limited /api/tools/http /api/tools/city'
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.stop();
  });
}
