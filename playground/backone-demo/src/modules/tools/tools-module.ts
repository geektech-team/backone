import { Module } from '@geektech/backone/decorators';
import { ToolsController } from './tools-controller';
import { ToolsService } from './tools-service';

@Module<ToolsModule>({
  prefix: '/api/tools',
  controllers: (module) => [module.controller],
})
export class ToolsModule {
  readonly controller: ToolsController;

  constructor(baseUrl: () => string) {
    this.controller = new ToolsController(new ToolsService(baseUrl));
  }
}
