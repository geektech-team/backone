import { Module } from '@geektech/backone/decorators';
import {
  FrameworkController,
  V1Controller,
  V2AdminController,
  V2Controller,
} from './framework-controller';
import { EchoGateway } from './echo-gateway';
import type { StreamsService } from './streams-service';

@Module<V1Module>({
  prefix: '/api/v1',
  controllers: (module) => [module.controller],
})
class V1Module {
  readonly controller = new V1Controller();
}

@Module<V2AdminModule>({
  prefix: '/admin',
  controllers: (module) => [module.controller],
})
class V2AdminModule {
  readonly controller = new V2AdminController();
}

@Module<V2Module>({
  prefix: '/api/v2',
  imports: (module) => [module.admin],
  controllers: (module) => [module.controller],
})
class V2Module {
  readonly admin = new V2AdminModule();
  readonly controller = new V2Controller();
}

@Module<FrameworkModule>({
  imports: (module) => [module.v1, module.v2],
  controllers: (module) => [module.controller],
  gateways: (module) => [module.gateway],
})
export class FrameworkModule {
  readonly v1 = new V1Module();
  readonly v2 = new V2Module();
  readonly controller: FrameworkController;
  readonly gateway = new EchoGateway();

  constructor(streams: StreamsService) {
    this.controller = new FrameworkController(streams);
  }
}
