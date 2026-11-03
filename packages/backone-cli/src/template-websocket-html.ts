export const websocketHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BackOne WebSocket Chat</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #333; }
    #messages { height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; background: #fafafa; }
    #messages div { padding: 0.25rem 0; border-bottom: 1px solid #eee; }
    .input-row { display: flex; gap: 0.5rem; }
    #input { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
    #send { padding: 0.5rem 1.5rem; border: none; border-radius: 4px; background: #333; color: white; cursor: pointer; }
    #send:hover { background: #555; }
  </style>
</head>
<body>
  <h1>BackOne WebSocket Chat</h1>
  <div id="messages"></div>
  <div class="input-row">
    <input id="input" placeholder="Type a message..." autofocus />
    <button id="send">Send</button>
  </div>
  <script>
    const ws = new WebSocket(\`ws://\${location.host}/chat\`);
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    ws.onmessage = (e) => {
      const div = document.createElement('div');
      div.textContent = e.data;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    };

    ws.onclose = () => {
      const div = document.createElement('div');
      div.textContent = 'Disconnected. Refresh to reconnect.';
      div.style.color = '#999';
      messages.appendChild(div);
    };

    const sendMsg = () => {
      if (input.value.trim()) {
        ws.send(input.value);
        input.value = '';
      }
    };
    send.onclick = sendMsg;
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMsg(); };
  </script>
</body>
</html>
`;
