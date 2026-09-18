/**
 * BackOne 工具包统一错误基类。
 *
 * 各域错误（数据库 / JWT / 校验 / ID 等）继承本类，携带稳定错误码，
 * 便于调用方按 code 分支处理，而非匹配 message 文本。
 *
 * 泛型 `C` 用于在子类上收窄 code 类型；子类不要再重复声明 `code` 字段
 * （`useDefineForClassFields` 下字段声明会用 undefined 覆盖父类赋值）。
 */

export class BackoneError<C extends string = string> extends Error {
  /** 稳定错误码（按域前缀区分，如 DB_ / JWT_ / VALIDATE_ / ID_） */
  readonly code: C;

  constructor(message: string, code: C = 'ERROR' as C) {
    super(message);
    this.name = 'BackoneError';
    this.code = code;
  }
}
