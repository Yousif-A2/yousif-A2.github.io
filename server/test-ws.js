const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:3001');

ws.on('open', function open() {
    console.log('connected');
    ws.close();
});

ws.on('error', function error(err) {
    console.error('Connection error:', err);
});
