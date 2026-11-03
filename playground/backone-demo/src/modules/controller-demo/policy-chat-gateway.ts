import type { BackOneWebSocket, WebSocketData } from '@geektech/backone';
import {
  Authorize,
  OnMessage,
  OnOpen,
  RateLimit,
  Timeout,
  WebSocket,
  getPrincipal,
} from '@geektech/backone/decorators';
import type {
  ControllerPolicyService,
  DemoPrincipal,
} from './controller-policy-service';

export class PolicyChatGateway {
  @OnOpen()
  open(ws: BackOneWebSocket<WebSocketData>) {
    ws.send(
      JSON.stringify({ connected: true, principal: ws.data.state?.principal })
    );
  }
  @OnMessage()
  message(ws: BackOneWebSocket<WebSocketData>, message: string | Uint8Array) {
    ws.send(`echo: ${String(message)}`);
  }
}

/** 工厂只绑定标准装饰器的声明期策略，不包含业务状态或行为。 */
export function bindPolicyChatGateway(
  policy: ControllerPolicyService
): PolicyChatGateway {
  @WebSocket('/chat')
  @Authorize({ authenticate: (ctx) => policy.verify(ctx.query.get('token')) })
  @RateLimit(policy.limiter, {
    key: (ctx) => `upgrade:${getPrincipal<DemoPrincipal>(ctx).id}`,
  })
  @Timeout(5000)
  class BoundPolicyChatGateway extends PolicyChatGateway {}
  return new BoundPolicyChatGateway();
}
