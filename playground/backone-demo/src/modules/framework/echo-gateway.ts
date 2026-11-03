import type { BackOneWebSocket } from '@geektech/backone';
import {
  OnClose,
  OnMessage,
  OnOpen,
  WebSocket,
} from '@geektech/backone/decorators';

@WebSocket('/ws')
export class EchoGateway {
  @OnOpen()
  open(ws: BackOneWebSocket) {
    ws.send('connected to backone websocket');
  }

  @OnMessage()
  message(ws: BackOneWebSocket, message: string | Uint8Array) {
    ws.send(`echo: ${String(message)}`);
  }

  @OnClose()
  close() {
    console.log('ws client closed');
  }
}
