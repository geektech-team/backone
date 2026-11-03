import type { BackOneServer } from '@geektech/backone';
import { ControllerDemoModule } from './modules/controller-demo/controller-demo-module';

export { ControllerDemoModule as ControllerDemo } from './modules/controller-demo/controller-demo-module';

/** 兼容旧入口；业务实现与依赖现位于同一模块目录。 */
export function registerControllerDemo(app: BackOneServer): void {
  new ControllerDemoModule().register(app);
}
