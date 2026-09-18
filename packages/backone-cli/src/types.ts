/** BackOne CLI 公共类型 */

export type TemplateName = 'minimal' | 'rest-api' | 'websocket';

export interface InitOptions {
  /** 项目名称（目录名） */
  name: string;
  /** 模板类型，默认交互式选择 */
  template?: TemplateName;
  /** 是否跳过依赖安装，默认 false */
  skipInstall?: boolean;
  /** 目标父目录，默认 process.cwd() */
  cwd?: string;
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
