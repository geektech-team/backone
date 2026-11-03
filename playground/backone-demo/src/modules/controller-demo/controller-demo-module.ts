import type { BackOneServer } from '@geektech/backone';
import { Module, registerModules } from '@geektech/backone/decorators';
import {
  DemoUsersController,
  SessionController,
  bindPolicyController,
} from './decorators-controller';
import { bindPolicyChatGateway } from './policy-chat-gateway';
import { DemoUsersRepository } from './demo-users-repository';
import { ControllerPolicyService } from './controller-policy-service';
import { DemoUsersService } from './demo-users-service';

@Module<ControllerDemoModule>({
  prefix: '/controller-api',
  controllers: (module) => module.controllers,
  gateways: (module) => module.gateways,
})
export class ControllerDemoModule {
  readonly controllers: readonly object[];
  readonly gateways: readonly object[];

  constructor() {
    const policy = new ControllerPolicyService();
    const users = new DemoUsersService(new DemoUsersRepository());
    this.controllers = [
      new DemoUsersController(users),
      new SessionController(policy),
      bindPolicyController(policy),
    ];
    this.gateways = [bindPolicyChatGateway(policy)];
  }

  /** 兼容既有显式注册，推荐由 Application 统一 registerModules。 */
  register(server: BackOneServer): void {
    registerModules(server, [this]);
  }
}
