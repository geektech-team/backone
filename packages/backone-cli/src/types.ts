/** BackOne CLI 公共类型 */

export type TemplateName = 'minimal' | 'rest-api' | 'websocket';
export type ProjectStyle = 'functional' | 'controller';

export interface InitOptions {
  /** 项目名称（目录名） */
  name: string;
  /** 模板类型，默认交互式选择 */
  template?: TemplateName;
  /** 业务代码风格，默认 functional；controller 仅支持 rest-api */
  style?: ProjectStyle;
  /** 是否跳过依赖安装，默认 false */
  skipInstall?: boolean;
  /** 目标父目录，默认 process.cwd() */
  cwd?: string;
  /** 确认覆盖已有文件（路径相对项目根）；默认 TTY 询问，非 TTY 保留 */
  confirmOverwrite?: (filePath: string) => boolean | Promise<boolean>;
}

export interface InitResult {
  /** 项目绝对路径 */
  projectPath: string;
  /** 使用的模板 */
  template: TemplateName;
  /** 是否安装了依赖 */
  installed: boolean;
}

export interface TemplateFile {
  /** 相对项目根的路径 */
  path: string;
  /** 文件内容 */
  content: string;
}
