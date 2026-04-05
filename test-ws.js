const WebSocket = require('ws');

const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=DUMMY';

const ws = new WebSocket(url);

ws.on('error', console.error);

ws.on('open', function open() {
  console.log('Connected. Sending setup...');
  const setup = {
      setup: {
          model: "models/gemini-2.0-flash-live-001",
          generationConfig: {
              responseModalities: ["AUDIO"]
          }
      }
  };
  ws.send(JSON.stringify(setup));
});

ws.on('message', function message(data) {
  console.log('Received: %s', data);
});

ws.on('close', function close(code, reason) {
    console.log(`Closed: ${code} ${reason.toString()}`);
    process.exit(1);
});
