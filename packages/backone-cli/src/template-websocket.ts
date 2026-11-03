import type { TemplateFile } from './types';
import { lifecycleFields, lifecycleMethods } from './template-common';
import { websocketHtml } from './template-websocket-html';

const app = `import { fileURLToPath } from 'node:url';
import { BackOneServer, type AppOptions } from '@geektech/backone';
import { registerModules } from '@geektech/backone/decorators';
import { ChatModule } from './modules/chat/chat-module';

export type ApplicationOptions = AppOptions;

export class Application {
  readonly server: BackOneServer;
${lifecycleFields}
  constructor(options: ApplicationOptions = {}) {
    this.server = new BackOneServer({ port: 3000, development: true, ...options });
    this.server.serveStatic(
      '/',
      fileURLToPath(new URL('../public/', import.meta.url)),
      { index: 'index.html' }
    );
    registerModules(this.server, [new ChatModule()]);
  }

${lifecycleMethods}
  private async initializeResources(): Promise<void> {}

  private dispose(): Promise<void> {
    return this.disposing ??= this.server.close();
  }
}
`;

const gateway = `import type { BackOneWebSocket } from '@geektech/backone';
import { WebSocket, OnOpen, OnMessage, OnClose } from '@geektech/backone/decorators';
import { ChatService } from './chat-service';

@WebSocket('/chat')
export class ChatGateway {
  constructor(private readonly chat: ChatService) {}

  @OnOpen()
  open(ws: BackOneWebSocket): void {
    this.chat.join(ws);
  }

  @OnMessage()
  message(_ws: BackOneWebSocket, message: string | Uint8Array): void {
    this.chat.broadcast(\`User: \${String(message)}\`);
  }

  @OnClose()
  close(ws: BackOneWebSocket): void {
    this.chat.leave(ws);
  }
}
`;

const service = `import type { BackOneWebSocket } from '@geektech/backone';

export class ChatService {
  private readonly clients = new Set<BackOneWebSocket>();

  join(client: BackOneWebSocket): void {
    this.clients.add(client);
    this.broadcast(\`System: a new user joined (\${this.clients.size} online)\`);
  }

  leave(client: BackOneWebSocket): void {
    this.clients.delete(client);
    this.broadcast(\`System: a user left (\${this.clients.size} online)\`);
  }

  broadcast(message: string): void {
    for (const client of this.clients) client.send(message);
  }
}
`;

const chatModule = `import { Module } from '@geektech/backone/decorators';
import { ChatGateway } from './chat-gateway';
import { ChatService } from './chat-service';

@Module<ChatModule>({ gateways: (module) => [module.gateway] })
export class ChatModule {
  readonly gateway = new ChatGateway(new ChatService());
}
`;

export function websocketFiles(): TemplateFile[] {
  return [
    { path: 'src/app.ts', content: app },
    { path: 'src/modules/chat/chat-module.ts', content: chatModule },
    { path: 'src/modules/chat/chat-gateway.ts', content: gateway },
    { path: 'src/modules/chat/chat-service.ts', content: service },
    { path: 'public/index.html', content: websocketHtml },
  ];
}
