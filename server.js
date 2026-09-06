require('dotenv').config();
const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
// On Render, mount a persistent disk at this path (see render.yaml) so the
// session survives restarts/redeploys. Locally it just uses a folder in the project.
const SESSION_PATH = process.env.SESSION_PATH || './.wwebjs_auth';
// Optional: forward every incoming message as a POST to this URL (e.g. Zapier,
// your own API, n8n, etc). Leave blank to just log messages.
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
// Simple shared secret so randoms on the internet can't view your QR/status page.
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';

// ---- In-memory state (fine for a single instance) ----
let latestQr = null;       // raw QR string, re-generated roughly every ~20-60s until scanned
let status = 'starting';   // starting | qr | authenticated | ready | auth_failure | disconnected
let clientInfo = null;     // populated once ready
let lastMessages = [];     // small rolling log for the dashboard, most recent first
const MAX_LOGGED_MESSAGES = 50;

function requireToken(req, res, next) {
  if (!DASHBOARD_TOKEN) return next(); // no token configured = open access, only do this for testing
  const provided = req.query.token || req.headers['x-dashboard-token'];
  if (provided === DASHBOARD_TOKEN) return next();
  return res.status(401).send('Unauthorized. Add ?token=YOUR_TOKEN to the URL.');
}

// ---- WhatsApp client ----
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  latestQr = qr;
  status = 'qr';
  console.log('New QR code generated. Visit /qr to scan it.');
});

client.on('authenticated', () => {
  status = 'authenticated';
  console.log('Authenticated. Session will be saved to', SESSION_PATH);
});

client.on('ready', () => {
  status = 'ready';
  latestQr = null;
  clientInfo = client.info;
  console.log('Client is ready. Logged in as', clientInfo && clientInfo.pushname);
});

client.on('auth_failure', (msg) => {
  status = 'auth_failure';
  console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
  status = 'disconnected';
  clientInfo = null;
  console.log('Client disconnected:', reason);
  // Try to reinitialize so the service self-heals instead of staying dead.
  client.initialize();
});

// ---- The actual "listener" part ----
client.on('message', async (msg) => {
  const entry = {
    time: new Date().toISOString(),
    from: msg.from,
    author: msg.author || null,
    body: msg.body,
    hasMedia: msg.hasMedia,
    type: msg.type,
  };

  lastMessages.unshift(entry);
  if (lastMessages.length > MAX_LOGGED_MESSAGES) lastMessages.pop();

  console.log(`[message] ${entry.from}: ${entry.body}`);

  if (WEBHOOK_URL) {
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      console.error('Failed to forward message to webhook:', err.message);
    }
  }

  // Example auto-reply — comment out or customize as needed.
  // if (msg.body.toLowerCase() === 'ping') {
  //   await msg.reply('pong');
  // }
});

client.initialize();

// ---- Web dashboard ----

app.get('/', requireToken, (req, res) => {
  res.send(`
    <html>
      <head><title>WhatsApp Listener</title><meta http-equiv="refresh" content="5"></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto;">
        <h2>WhatsApp Listener</h2>
        <p><strong>Status:</strong> ${status}</p>
        ${status === 'ready' && clientInfo ? `<p>Logged in as <strong>${clientInfo.pushname}</strong> (${clientInfo.wid.user})</p>` : ''}
        ${status === 'qr' ? `<p><a href="/qr${DASHBOARD_TOKEN ? '?token=' + DASHBOARD_TOKEN : ''}">Click here to view the QR code</a></p>` : ''}
        <h3>Recent messages</h3>
        <ul>
          ${lastMessages.map(m => `<li>[${m.time}] ${m.from}: ${m.body}</li>`).join('') || '<li>None yet</li>'}
        </ul>
      </body>
    </html>
  `);
});

app.get('/qr', requireToken, async (req, res) => {
  if (status === 'ready') {
    return res.send('<p>Already authenticated — no QR code needed. <a href="/">Back</a></p>');
  }
  if (!latestQr) {
    return res.send('<p>No QR code yet, still starting up. Refresh in a few seconds.</p>');
  }
  const qrImageDataUrl = await qrcode.toDataURL(latestQr);
  res.send(`
    <html>
      <head><title>Scan QR</title><meta http-equiv="refresh" content="20"></head>
      <body style="font-family: sans-serif; text-align: center; margin-top: 40px;">
        <h2>Scan with WhatsApp → Linked Devices → Link a Device</h2>
        <img src="${qrImageDataUrl}" alt="WhatsApp QR code" />
        <p>This page auto-refreshes. The code expires periodically until scanned.</p>
      </body>
    </html>
  `);
});

app.get('/status', requireToken, (req, res) => {
  res.json({ status, clientInfo, recentMessageCount: lastMessages.length });
});

app.get('/messages', requireToken, (req, res) => {
  res.json(lastMessages);
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
