/**
 * WebSocket 支持：基于 Bun.serve 原生 WebSocket，薄壳封装。
 * 通过 app.ws(path, handler) 注册，请求期自动升级。
 */

import type { ServerWebSocket } from 'bun';

/** BackOne WebSocket 连接（Bun ServerWebSocket 的直接别名） */
export type BackOneWebSocket<T = unknown> = ServerWebSocket<T>;

/** 注册在路径上的 WebSocket 处理器 */
export interface WebSocketHandler<T = unknown> {
  /** 连接建立 */
  open?(ws: BackOneWebSocket<T>): void;
  /** 收到消息（文本或二进制） */
  message?(ws: BackOneWebSocket<T>, message: string | Uint8Array): void;
  /** 连接关闭 */
  close?(ws: BackOneWebSocket<T>, code: number, reason: string): void;
  /** 连接可写（背压缓解） */
  drain?(ws: BackOneWebSocket<T>): void;
}

/** 升级时附加到 WebSocket 连接的数据，用于路径分发 */
export interface WebSocketData {
  path: string;
}
