/** Class based scaffolds, composed explicitly without runtime dependencies. */
import type { TemplateFile, TemplateName } from './types';
import {
  homeController,
  homeModule,
  index,
  minimalApp,
} from './template-common';
import { restFiles } from './template-rest';
import { websocketFiles } from './template-websocket';

function baseFiles(name: string, withDatabase = false): TemplateFile[] {
  const dependencies: Record<string, string> = {
    '@geektech/backone': '^0.4.0',
  };
  if (withDatabase) {
    Object.assign(dependencies, { '@geektech/backone-utils': '^0.5.2' });
  }
  return [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'bun --watch src/index.ts',
            start: 'bun src/index.ts',
            typecheck: 'tsc --noEmit',
          },
          dependencies,
          devDependencies: { '@types/bun': '^1.3.14', typescript: '^5.3.3' },
          engines: { bun: '>=1.3.10' },
        },
        null,
        2
      ),
    },
    {
      path: 'tsconfig.json',
      content: JSON.stringify(
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
            types: ['bun'],
          },
          include: ['src'],
        },
        null,
        2
      ),
    },
    { path: 'src/index.ts', content: index },
    {
      path: '.gitignore',
      content: 'node_modules\ndist\n.env\n*.sqlite\n*.sqlite-*\n.DS_Store\n',
    },
  ];
}

function readme(name: string, template: TemplateName): TemplateFile {
  const details: Record<TemplateName, string> = {
    minimal:
      'Application owns a BackOneServer and registers HomeModule, which groups HomeController. GET / returns Hello, BackOne!.',
    'rest-api': `Application → UsersModule → UsersController → UsersService → UsersRepository → Database/Table.
All users business files live together in src/modules/users/.

GET/POST /api/users and GET/PUT/DELETE /api/users/:id demonstrate SQLite CRUD.
POST and PUT accept JSON with non-empty name and email strings. Invalid input returns 400;
missing users return 404. Validate, Status, Header and Timeout declare HTTP policy.
The service handles business rules; the repository has no HTTP dependency.

SQLite defaults to :memory: and resets on restart. For persistence run
DATABASE_URL=./users.sqlite bun run dev, or new Application({ databaseUrl: './users.sqlite' }).
Only SQLite is configured by this template. Seed users are inserted into an empty table.
Repositories borrow connections; Application closes its owned database.
Transactions create repositories bound to the transaction Database.`,
    websocket: `Application owns a BackOneServer and registers ChatModule.
ChatModule groups ChatGateway and its injected ChatService in src/modules/chat/.
GET / serves public/index.html, WS /chat broadcasts messages to connected clients.
Open http://127.0.0.1:3000 in several browser tabs. Connection state belongs to ChatService.`,
  };
  return {
    path: 'README.md',
    content: `# ${name}

${details[template]}

Requires Bun >=1.3.10 and TypeScript >=5.2.
Use standard decorators; leave experimentalDecorators and emitDecoratorMetadata disabled.

Run bun install, bun run typecheck, then bun run dev.
Start production with bun run start.

src/index.ts creates new Application(). Application is the composition and resource owner.
Business code is grouped by feature under src/modules/<feature>/.
@Module declares module composition; registerModules mounts explicit instances.
Dependencies are passed through constructors; modules do not initialize or close implicitly.
Import src/app.ts without opening ports; construct an application and await initialize()
to test server.handle(new Request(...)) without listening. start() initializes and listens.
Concurrent initialize/start calls share their work. stop() waits for initialization/start,
closes owned resources, and is safe to repeat. Stopped applications cannot restart.
Controllers/services/repositories are reused; request state belongs in ctx.
`,
  };
}

export const TEMPLATES: Record<TemplateName, (name: string) => TemplateFile[]> =
  {
    minimal: (name) => [
      ...baseFiles(name),
      { path: 'src/app.ts', content: minimalApp },
      { path: 'src/modules/home/home-controller.ts', content: homeController },
      { path: 'src/modules/home/home-module.ts', content: homeModule },
      readme(name, 'minimal'),
    ],
    'rest-api': (name) => [
      ...baseFiles(name, true),
      ...restFiles(),
      readme(name, 'rest-api'),
    ],
    websocket: (name) => [
      ...baseFiles(name),
      ...websocketFiles(),
      readme(name, 'websocket'),
    ],
  };

export const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  minimal: 'Minimal — Application, HomeModule and HomeController',
  'rest-api':
    'REST API — UsersModule with Controller, Service, Repository and SQLite CRUD',
  websocket: 'WebSocket — ChatModule with Gateway, Service and browser client',
};
