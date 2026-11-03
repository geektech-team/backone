import { TEMPLATES } from './templates';
import type { TemplateFile } from './types';

/** Compatibility entrypoint; all scaffolds now use classes. */
export function controllerRestTemplate(name: string): TemplateFile[] {
  return TEMPLATES['rest-api'](name);
}
