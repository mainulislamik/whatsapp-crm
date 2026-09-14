const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let lastQr = null;
let lastQrDataUrl = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, SCAN_QR, CONNECTED
let connectedUser = null;

async function connectToWhatsApp() {
  connectionStatus = 'CONNECTING';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    generateHighQualityLinkPreview: true,
    browser: ['WhatsApp CRM', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQr = qr;
      try {
        lastQrDataUrl = await QRCode.toDataURL(qr);
        connectionStatus = 'SCAN_QR';
      } catch (err) {
        console.error('Failed to generate QR Code data URL:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'DISCONNECTED';
      connectedUser = null;
      lastQr = null;
      lastQrDataUrl = null;

      console.log(`Connection closed due to: ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log('Logged out. Cleaning credentials...');
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {
          console.error('Failed to clear auth dir:', e);
        }
        setTimeout(connectToWhatsApp, 2000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'CONNECTED';
      lastQr = null;
      lastQrDataUrl = null;
      connectedUser = sock.user;
      console.log('WhatsApp connection opened successfully for user:', connectedUser?.id);
    }
  });
}

// Format phone number to WhatsApp JID
function formatJID(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    // Bangladesh local format (e.g. 017...) -> prefix 88
    cleaned = '88' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Status check
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    user: connectedUser,
    hasQr: !!lastQrDataUrl
  });
});

// QR Code endpoint
app.get('/qr', (req, res) => {
  res.json({
    status: connectionStatus,
    qrDataUrl: lastQrDataUrl,
    qrRaw: lastQr
  });
});

// Send single message
app.post('/send', async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: 'Both "to" (phone number) and "text" are required' });
    }

    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.status(503).json({ error: 'WhatsApp is not connected. Please scan the QR code first.' });
    }

    const jid = formatJID(to);
    const result = await sock.sendMessage(jid, { text });

    res.json({
      success: true,
      messageId: result.key.id,
      to: jid,
      timestamp: result.messageTimestamp
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message'
    });
  }
});

// Logout
app.post('/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (e) {}
    connectionStatus = 'DISCONNECTED';
    connectedUser = null;
    lastQr = null;
    lastQrDataUrl = null;
    setTimeout(connectToWhatsApp, 1000);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart socket
app.post('/restart', async (req, res) => {
  try {
    if (sock) {
      sock.end(undefined);
    }
    setTimeout(connectToWhatsApp, 1000);
    res.json({ success: true, message: 'Reconnecting...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WhatsApp Engine running on port ${PORT}`);
  connectToWhatsApp();
});
