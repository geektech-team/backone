/**
 * BackOne CLI 编程式 API 入口。
 */

export { initProject } from './commands/init';
export { TEMPLATES, TEMPLATE_DESCRIPTIONS } from './templates';
export type {
  InitOptions,
  InitResult,
  TemplateFile,
  TemplateName,
} from './types';
