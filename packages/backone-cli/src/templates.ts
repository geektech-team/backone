/**
 * 项目模板定义。
 * 每个模板是一组 TemplateFile，内容用 {{name}} 占位项目名。
 */

import type { TemplateFile, TemplateName } from './types';

const GITIGNORE = `node_modules
dist
.env
.DS_Store
`;

function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        types: ['bun-types'],
      },
      include: ['src'],
    },
    null,
    2
  );
}

function packageJson(
  name: string,
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'bun --watch src/index.ts',
        start: 'bun src/index.ts',
      },
      dependencies: {
        '@geektech/backone': '^0.1.0',
      },
      ...extra,
    },
    null,
    2
  );
}

// ---- minimal ----

const minimalIndex = `import { createServer } from '@geektech/backone';

const app = createServer({ port: 3000 });

app.get('/', () => 'Hello, BackOne!');

const port = await app.listen();
console.log(\`Server running at http://127.0.0.1:\${port}\`);
`;

const minimalReadme = (name: string) => `# ${name}

Minimal BackOne application.

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

Open http://127.0.0.1:3000

## Scripts

- \`bun run dev\` — Start development server with hot reload
- \`bun run start\` — Start production server
`;

// ---- rest-api ----

const restApiIndex = `import { createServer, HttpError } from '@geektech/backone';

const app = createServer({ port: 3000, development: true });

app.useLogger();
app.useCors();

interface User {
  id: number;
  name: string;
  email: string;
}

let users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
];
let nextId = 3;

app.group('/api', (api) => {
  api.get('/users', () => users);

  api.get<{ id: string }>('/users/:id', (ctx) => {
    const user = users.find((u) => u.id === Number(ctx.params.id));
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  });

  api.post('/users', async (ctx) => {
    const body = await ctx.bodyJson<{ name: string; email: string }>();
    const user: User = { id: nextId++, name: body.name, email: body.email };
    users.push(user);
    return ctx.json(user, 201);
  });

  api.delete<{ id: string }>('/users/:id', (ctx) => {
    const idx = users.findIndex((u) => u.id === Number(ctx.params.id));
    if (idx === -1) throw new HttpError(404, 'User not found');
    users.splice(idx, 1);
    return ctx.noContent();
  });
});

const port = await app.listen();
console.log(\`REST API running at http://127.0.0.1:\${port}\`);
`;

const restApiReadme = (name: string) => `# ${name}

BackOne REST API template with in-memory user CRUD.

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

## API Endpoints

- \`GET /api/users\` — List all users
- \`GET /api/users/:id\` — Get a user by ID
- \`POST /api/users\` — Create a user (JSON body: name, email)
- \`DELETE /api/users/:id\` — Delete a user

## Example

\`\`\`bash
curl http://127.0.0.1:3000/api/users
curl -X POST http://127.0.0.1:3000/api/users \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Charlie","email":"charlie@example.com"}'
\`\`\`
`;

// ---- websocket ----

const websocketIndex = `import { createServer } from '@geektech/backone';
import type { BackOneWebSocket } from '@geektech/backone';

const app = createServer({ port: 3000, development: true });

app.serveStatic('/', './public');

const clients = new Set<BackOneWebSocket>();

app.ws('/chat', {
  open(ws) {
    clients.add(ws);
    broadcast(\`System: a new user joined (\${clients.size} online)\`);
  },
  message(_ws, message) {
    broadcast(\`User: \${String(message)}\`);
  },
  close(ws) {
    clients.delete(ws);
    broadcast(\`System: a user left (\${clients.size} online)\`);
  },
});

function broadcast(message: string) {
  for (const client of clients) {
    client.send(message);
  }
}

const port = await app.listen();
console.log(\`WebSocket chat running at http://127.0.0.1:\${port}\`);
`;

const websocketHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BackOne WebSocket Chat</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #333; }
    #messages { height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; background: #fafafa; }
    #messages div { padding: 0.25rem 0; border-bottom: 1px solid #eee; }
    .input-row { display: flex; gap: 0.5rem; }
    #input { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
    #send { padding: 0.5rem 1.5rem; border: none; border-radius: 4px; background: #333; color: white; cursor: pointer; }
    #send:hover { background: #555; }
  </style>
</head>
<body>
  <h1>BackOne WebSocket Chat</h1>
  <div id="messages"></div>
  <div class="input-row">
    <input id="input" placeholder="Type a message..." autofocus />
    <button id="send">Send</button>
  </div>
  <script>
    const ws = new WebSocket(\`ws://\${location.host}/chat\`);
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    ws.onmessage = (e) => {
      const div = document.createElement('div');
      div.textContent = e.data;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    };

    ws.onclose = () => {
      const div = document.createElement('div');
      div.textContent = 'Disconnected. Refresh to reconnect.';
      div.style.color = '#999';
      messages.appendChild(div);
    };

    const sendMsg = () => {
      if (input.value.trim()) {
        ws.send(input.value);
        input.value = '';
      }
    };
    send.onclick = sendMsg;
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMsg(); };
  </script>
</body>
</html>
`;

const websocketReadme = (name: string) => `# ${name}

BackOne WebSocket chat template with a browser client.

## Getting Started

\`\`\`bash
bun install
bun run dev
\`\`\`

Open http://127.0.0.1:3000 in multiple browser tabs to chat.

## How it works

- \`GET /\` — Serves the chat UI from \`./public/index.html\`
- \`WS /chat\` — WebSocket endpoint, broadcasts messages to all connected clients
`;

// ---- 模板注册表 ----

export const TEMPLATES: Record<TemplateName, (name: string) => TemplateFile[]> =
  {
    minimal: (name) => [
      { path: 'package.json', content: packageJson(name) },
      { path: 'tsconfig.json', content: tsconfig() },
      { path: 'src/index.ts', content: minimalIndex },
      { path: 'README.md', content: minimalReadme(name) },
      { path: '.gitignore', content: GITIGNORE },
    ],
    'rest-api': (name) => [
      { path: 'package.json', content: packageJson(name) },
      { path: 'tsconfig.json', content: tsconfig() },
      { path: 'src/index.ts', content: restApiIndex },
      { path: 'README.md', content: restApiReadme(name) },
      { path: '.gitignore', content: GITIGNORE },
    ],
    websocket: (name) => [
      { path: 'package.json', content: packageJson(name) },
      { path: 'tsconfig.json', content: tsconfig() },
      { path: 'src/index.ts', content: websocketIndex },
      { path: 'public/index.html', content: websocketHtml },
      { path: 'README.md', content: websocketReadme(name) },
      { path: '.gitignore', content: GITIGNORE },
    ],
  };

export const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  minimal: 'Minimal — single route, zero extras',
  'rest-api': 'REST API — CRUD example with route groups and middleware',
  websocket: 'WebSocket — real-time chat with browser client',
};
