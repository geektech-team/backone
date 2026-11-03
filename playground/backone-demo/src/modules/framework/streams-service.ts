/** 应用负责关闭流；客户端取消或断开也会释放各自定时器。 */
export class StreamsService {
  private readonly closeStreams = new Set<() => void>();

  events(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        const messages = [
          { id: 1, event: 'greeting', data: 'hello from backone' },
          {
            id: 2,
            event: 'update',
            data: JSON.stringify({ status: 'ok', ts: Date.now() }),
          },
          { id: 3, event: 'done', data: 'stream complete' },
        ];
        for (const message of messages) {
          controller.enqueue(
            encoder.encode(
              `id: ${message.id}\nevent: ${message.event}\ndata: ${message.data}\n\n`
            )
          );
        }
        controller.close();
      },
    });
  }

  clock(signal: AbortSignal): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let cleanup = () => {};
    return new ReadableStream({
      start: (controller) => {
        let closed = false;
        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          signal.removeEventListener('abort', close);
          this.closeStreams.delete(close);
        };
        const close = () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* 已由客户端取消 */
          }
        };
        const send = () =>
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                time: new Date().toISOString(),
                local: new Date().toLocaleTimeString(),
              })}\n\n`
            )
          );
        const timer = signal.aborted ? undefined : setInterval(send, 1000);
        if (signal.aborted) {
          close();
          return;
        }
        send();
        this.closeStreams.add(close);
        signal.addEventListener('abort', close, { once: true });
      },
      cancel: () => cleanup(),
    });
  }

  close(): void {
    for (const close of this.closeStreams) close();
  }
}
