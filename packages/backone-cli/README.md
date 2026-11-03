# @geektech/backone-cli

Class-based scaffolding for [BackOne](https://github.com/geektech-team/backone/tree/main/packages/backone) applications. The CLI has zero runtime dependencies and runs on Bun.

## Usage

```bash
bunx @geektech/backone-cli init my-app
bunx @geektech/backone-cli init my-api --template rest-api
bunx @geektech/backone-cli init my-chat --template websocket --no-install
```

Or install with `bun add -d @geektech/backone-cli` and run `backone init`.
All templates use business modules, classes and standard decorators. Requirements: Bun >=1.3.10,
TypeScript >=5.2. Leave `experimentalDecorators` and `emitDecoratorMetadata`
disabled. Run `bun run typecheck` and `bun run dev` after installation.

| Template    | Objects                                                                   | Runtime packages in the generated application |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `minimal`   | Application, HomeModule, HomeController                                   | backone                                       |
| `rest-api`  | Application, UsersModule, Controller, Service, Repository, Database/Table | backone, backone-utils                        |
| `websocket` | Application, ChatModule, Gateway, Service, browser client                 | backone                                       |

Each business lives in `modules/<feature>/`. Its `@Module` class declares Controller,
Gateway and imported module instances through selectors, and Application calls
`registerModules` to mount them. Dependencies are wired through constructors.
Application owns the server and resources; Controllers/Gateways handle protocols, Services handle business rules,
and Repositories handle storage. Request state belongs in `ctx` or `ws.data`.
See the [architecture guide](../../docs/object-first.md).

## Options and migration

- `--template minimal|rest-api|websocket`: choose a template. Without it, a terminal
  prompts for a choice; non-interactive usage selects `minimal`.
- `--no-install`: skip `bun install`.
- `--style controller`: optional explicit alias for the unified class style; works
  with all templates. Used alone, it still selects `rest-api` for compatibility.
- `--style functional`: no longer generates a project; reports a migration error
  before writing files. Omit `--style` to use the class template. BackOne's
  functional framework APIs remain available.
- `--version` / `--help`: show version or help.

Initialization works in existing directories. Each existing template file prompts
`Overwrite? (y/N)`: `y` or `yes` overwrites; Enter keeps it. Skipped files and files
outside the template remain, and missing files are created. Without a terminal,
existing files are kept automatically. Changing a template does not remove old
files; review any retained files when migrating an existing project.

## Generated REST application

```text
src/
  index.ts
  app.ts
  modules/users/
    users-module.ts
    users-controller.ts
    users-service.ts
    users-repository.ts
    user.ts
    user-schema.ts
  middlewares/request-id.ts
```

GET/POST `/api/users` and GET/PUT/DELETE `/api/users/:id` demonstrate CRUD. POST and
PUT require non-empty `name` and `email`. The Controller uses `@Validate` and
`validatedBody`, `@Status(201/204)`, `@Header` and `@Timeout(5000)`. Timeout limits
response waiting and does not cancel ongoing work. Services use domain errors;
Controllers map them to HTTP responses. Repositories compose Database/Table.
UsersModule constructs the repository, service and controller explicitly. Its
initialize method is called by Application; @Module does not initialize or close
resources automatically. Shared request middleware remains in middlewares/.

`src/app.ts` exports the application class:

```ts
import { Application } from './src/app';

const application = new Application({ databaseUrl: ':memory:' });
try {
  await application.initialize();
  const response = await application.server.handle(
    new Request('http://localhost/api/users')
  );
  console.log(await response.json());
} finally {
  await application.stop();
}
```

Constructors do not listen or create tables. `start()` automatically initializes
and returns the listening port. Initialization is shared by concurrent callers;
`stop()` is idempotent and closes owned resources. A stopped application cannot
restart; construct another instance. Each default REST instance owns an in-memory
SQLite database, cleared on shutdown. Use `databaseUrl: './app.db'` for persistence.
The generated DDL targets SQLite; other database dialects need their own DDL.

The WebSocket template serves `public/index.html` and registers `/chat` through a
ChatModule and ChatGateway. ChatService owns its instance's connected clients and broadcasts
messages. Open multiple tabs at `http://127.0.0.1:3000` to try it.

## Programmatic API

```ts
import { initProject } from '@geektech/backone-cli';

await initProject({
  name: 'my-api',
  template: 'rest-api',
  skipInstall: true,
  cwd: process.cwd(),
  confirmOverwrite: async (filePath) => filePath === 'README.md',
});
```

`confirmOverwrite` accepts a boolean or promise. If omitted, the same terminal
prompt and non-interactive preservation behavior apply. `TEMPLATES` exposes the
same class-based file generators used by `initProject`.

## Development

```bash
bun test
bun run build
bun run lint
```

MIT
