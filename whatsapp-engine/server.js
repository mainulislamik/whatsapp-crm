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
  fetchLatestBaileysVersion,
  getBinaryNodeChild
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Synced contacts and sender pushNames store
const contactsStore = new Map();

function saveContact(c) {
  if (!c || !c.id) return;
  const rawId = c.id;
  const numOnly = rawId.split('@')[0];
  let localNum = numOnly;
  if (numOnly.startsWith('8801')) {
    localNum = '0' + numOnly.slice(2);
  }
  const existing = contactsStore.get(rawId) || {};
  const merged = { ...existing, ...c };
  contactsStore.set(rawId, merged);
  contactsStore.set(numOnly, merged);
  contactsStore.set(localNum, merged);
}

function findContactInStore(phone) {
  const cleaned = String(phone).replace(/\D/g, '');
  let localNum = cleaned;
  let intlNum = cleaned;
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    intlNum = '88' + cleaned;
  } else if (cleaned.startsWith('8801') && cleaned.length === 13) {
    localNum = '0' + cleaned.slice(2);
  }
  const jid = `${intlNum}@s.whatsapp.net`;
  return contactsStore.get(jid) || contactsStore.get(intlNum) || contactsStore.get(localNum) || null;
}

async function connectToWhatsApp() {
  connectionStatus = 'CONNECTING';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

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

  // Handle sync of history (contacts and recent messages)
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
    if (Array.isArray(contacts)) {
      contacts.forEach(saveContact);
    }
    if (Array.isArray(messages)) {
      messages.forEach(m => {
        const sender = m.key?.remoteJid;
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
      });
    }
  });

  // Handle contact sync events
  sock.ev.on('contacts.upsert', (contacts) => {
    if (Array.isArray(contacts)) contacts.forEach(saveContact);
  });

  sock.ev.on('contacts.update', (updates) => {
    if (Array.isArray(updates)) updates.forEach(saveContact);
  });

  // Handle incoming / new messages to capture sender pushNames
  sock.ev.on('messages.upsert', ({ messages }) => {
    if (Array.isArray(messages)) {
      messages.forEach(m => {
        const sender = m.key?.remoteJid;
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
      });
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

// Check contact on WhatsApp (existence, profile picture, about)
app.get('/check-contact', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'phone query param is required' });
    }

    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.json({
        connected: false,
        exists: false,
        phone,
        message: 'WhatsApp engine is not connected. Scan QR code first.'
      });
    }

    const jid = formatJID(phone);
    const results = await sock.onWhatsApp(jid);
    const match = results && results.length > 0 ? results[0] : null;

    if (!match || !match.exists) {
      return res.json({
        connected: true,
        exists: false,
        phone,
        jid,
        message: 'Number is not registered on WhatsApp.'
      });
    }

    let profilePictureUrl = null;
    try {
      profilePictureUrl = await sock.profilePictureUrl(match.jid, 'image');
    } catch (err) {
      // Profile picture is private, contacts-only, or not set
    }

    let about = null;
    try {
      const statusRes = await sock.fetchStatus(match.jid);
      about = statusRes?.status || null;
    } catch (err) {}

    // 1. Check in-memory synced contacts store
    const stored = findContactInStore(phone);
    let contactName = stored?.name || stored?.notify || stored?.verifiedName || stored?.pushName || null;

    // 2. Query Business Profile
    let businessProfile = null;
    try {
      businessProfile = await sock.getBusinessProfile(match.jid);
    } catch (err) {}

    // 3. Raw WhatsApp IQ query for business profile & verified name
    try {
      const bizRes = await sock.query({
        tag: 'iq',
        attrs: {
          to: 's.whatsapp.net',
          type: 'get',
          xmlns: 'w:biz'
        },
        content: [
          {
            tag: 'business_profile',
            attrs: { v: '244' },
            content: [{ tag: 'profile', attrs: { jid: match.jid } }]
          }
        ]
      });
      const profileNode = getBinaryNodeChild(bizRes, 'business_profile');
      const profiles = getBinaryNodeChild(profileNode, 'profile');
      if (profiles) {
        // 1. Check biz_identity_info display_name (official / SMB WhatsApp Business name)
        const bizIdentityNode = getBinaryNodeChild(profiles, 'biz_identity_info');
        if (bizIdentityNode?.attrs?.display_name && !contactName) {
          contactName = bizIdentityNode.attrs.display_name;
        }

        // 2. Check vname / name / tag
        if (!contactName) {
          const vnameNode = getBinaryNodeChild(profiles, 'vname') || 
                            getBinaryNodeChild(profiles, 'name') || 
                            getBinaryNodeChild(profiles, 'tag');
          if (vnameNode && vnameNode.content) {
            const vnameStr = vnameNode.content.toString();
            if (vnameStr) {
              contactName = vnameStr;
            }
          }
        }
      }
    } catch (err) {}

    return res.json({
      connected: true,
      exists: true,
      phone,
      jid: match.jid,
      name: contactName || null,
      pushName: contactName || null,
      businessProfile: businessProfile || null,
      profilePictureUrl,
      about
    });
  } catch (error) {
    console.error('Error checking WhatsApp contact:', error);
    res.status(500).json({ error: error.message || 'Failed to check contact' });
  }
});

// QR Code endpoint
app.get('/qr', (req, res) => {
  res.json({
    status: connectionStatus,
    qrDataUrl: lastQrDataUrl,
    qrRaw: lastQr
  });
});

// Send message (text, image, or document)
app.post('/send', async (req, res) => {
  try {
    const { to, text, mediaBase64, mediaType, fileName, mimeType } = req.body;
    if (!to) {
      return res.status(400).json({ error: '"to" (phone number) is required' });
    }

    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.status(503).json({ error: 'WhatsApp is not connected. Please scan the QR code first.' });
    }

    const jid = formatJID(to);
    let messagePayload = {};

    if (mediaBase64) {
      const buffer = Buffer.from(mediaBase64, 'base64');
      if (mediaType === 'image') {
        messagePayload = {
          image: buffer,
          caption: text || '',
          mimetype: mimeType || 'image/jpeg'
        };
      } else {
        // Document / PDF
        messagePayload = {
          document: buffer,
          mimetype: mimeType || 'application/pdf',
          fileName: fileName || 'document.pdf',
          caption: text || ''
        };
      }
    } else {
      if (!text) {
        return res.status(400).json({ error: 'Either "text" or "mediaBase64" is required' });
      }
      messagePayload = { text };
    }

    const result = await sock.sendMessage(jid, messagePayload);

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
