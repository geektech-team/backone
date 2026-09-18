/**
 * JWT 公开类型。
 *
 * 基于 WebCrypto HMAC 实现（HS256 / HS384 / HS512），零运行时依赖。
 * 载荷为 `Record<string, unknown>` 与标准声明的交叉类型，允许携带任意
 * 自定义字段。
 */

/** 支持的签名算法 */
export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512';

/** JWT 头部（签名前 JSON 序列化并 base64url 编码） */
export interface JwtHeader {
  alg: JwtAlgorithm;
  typ: 'JWT';
}

/** JWT 载荷：标准声明 + 任意自定义字段 */
export type JwtPayload = Record<string, unknown> & {
  /** 签发方 */
  iss?: string;
  /** 主题 */
  sub?: string;
  /** 受众（单个或数组） */
  aud?: string | string[];
  /** 过期时间（Unix 秒） */
  exp?: number;
  /** 生效时间（Unix 秒） */
  nbf?: number;
  /** 签发时间（Unix 秒） */
  iat?: number;
  /** 唯一标识 */
  jti?: string;
};

/** 签发选项 */
export interface JwtSignOptions {
  /** 签名算法（默认使用服务构造时的 algorithm） */
  algorithm?: JwtAlgorithm;
  /** 过期秒数：相对当前时间写入 exp */
  expiresIn?: number;
  /** 生效秒数：相对当前时间写入 nbf */
  notBefore?: number;
}

/** 验证选项 */
export interface JwtVerifyOptions {
  /** 必须匹配的 issuer（载荷 iss 缺失或不一致则失败） */
  issuer?: string;
  /** 必须匹配的 audience（载荷 aud 缺失或未包含则失败） */
  audience?: string | string[];
  /** 时钟容差（秒）：校验 exp/nbf 时的宽松量，默认 0 */
  clockTolerance?: number;
}
