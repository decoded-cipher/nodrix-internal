// Several ESP32 + DHT11 boards, each its own device, speaking the SDK's
// WebSocket protocol: hello with a device key, then temperature/humidity.
//
//   NODRIX_HOST=… NODRIX_TOKEN=… bun dht-boards.js
//   BOARDS=dht-kitchen,dht-garage   device keys, one board each (default)
//   INTERVAL_MS=5000

const HOST = required('NODRIX_HOST');
const TOKEN = required('NODRIX_TOKEN');
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 5000);
const KEYS = (process.env.BOARDS ?? 'dht-kitchen,dht-garage').split(',').map((k) => k.trim()).filter(Boolean);
const URL = `wss://${HOST}/v1/control/ws?token=${encodeURIComponent(TOKEN)}`;

function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`[dht] missing env var: ${name}`); process.exit(1); }
  return v;
}

// DHT11 reads whole degrees and whole percent.
function drift(prev, min, max, step) {
  const v = prev + Math.round((Math.random() - 0.5) * 2 * step);
  return Math.max(min, Math.min(max, v));
}

function board(key, i) {
  const state = { temperature: 24 + i * 3, humidity: 55 - i * 8 };
  let ws = null;
  let tick = null;

  const send = (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

  function connect() {
    ws = new WebSocket(URL);
    ws.onopen = () => {
      console.log(`[${key}] connected`);
      send({ type: 'hello', device: key, chip: 'esp32-d0wd-v3', firmware: '1.0.0' });
      report();
      tick = setInterval(report, INTERVAL_MS);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.type === 'control') {
        console.log(`[${key}] control ${msg.variable}=${JSON.stringify(msg.value)}`);
        if (msg.id) send({ type: 'ack', ids: [msg.id] });
      } else if (msg.type === 'ota') {
        console.log(`[${key}] update nudge (ignored by the simulator)`);
      } else if (msg.type === 'error') {
        console.error(`[${key}] server error ${msg.code}`);
      }
    };
    ws.onclose = (e) => {
      clearInterval(tick);
      console.log(`[${key}] disconnected (${e.code}), retrying in 5s`);
      setTimeout(connect, 5000);
    };
    ws.onerror = () => {};
  }

  function report() {
    state.temperature = drift(state.temperature, 0, 50, 1);
    state.humidity = drift(state.humidity, 20, 90, 2);
    send({ type: 'telemetry', metrics: { temperature: state.temperature, humidity: state.humidity } });
    console.log(`[${key}] temperature=${state.temperature}°C humidity=${state.humidity}%`);
  }

  connect();
}

console.log(`▶ ${KEYS.length} DHT11 boards → ${HOST} every ${INTERVAL_MS}ms`);
KEYS.forEach(board);
