/** 可选的标准装饰器入口，不依赖反射或全局应用实例。 */
export {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Options,
  Head,
  All,
  Use,
} from './metadata';
export type { RouteDecorator } from './metadata';
export { registerControllers } from './register';
export type { ControllerRoute } from './register';
