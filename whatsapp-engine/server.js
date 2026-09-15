const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const http = require('http');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getBinaryNodeChild,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 5001;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');
const BACKEND_URL = process.env.BACKEND_URL || 'http://wa-backend:8050';

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

// Forward received message to FastAPI backend
async function forwardMessageToBackend(msgData) {
  try {
    const postData = JSON.stringify(msgData);
    const urls = [
      `${BACKEND_URL}/api/chats/incoming`,
      'http://localhost:8050/api/chats/incoming'
    ];

    for (const targetUrl of urls) {
      try {
        const u = new URL(targetUrl);
        const req = http.request({
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 4000
        }, (res) => {
          // Success
        });
        req.on('error', () => {});
        req.write(postData);
        req.end();
        break; // request dispatched
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error forwarding message to backend:', err.message);
  }
}

// Extract clean text and media info from a Baileys message object
function extractMessageInfo(m) {
  if (!m || !m.message) return null;
  const msg = m.message;
  let text = '';
  let mediaType = '';
  let mediaUrl = '';
  let fileName = '';

  if (msg.conversation) {
    text = msg.conversation;
  } else if (msg.extendedTextMessage?.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    mediaType = 'image';
    text = msg.imageMessage.caption || '';
    mediaUrl = msg.imageMessage.url || '';
  } else if (msg.documentMessage) {
    mediaType = 'document';
    text = msg.documentMessage.caption || '';
    fileName = msg.documentMessage.fileName || 'document';
    mediaUrl = msg.documentMessage.url || '';
  } else if (msg.videoMessage) {
    mediaType = 'video';
    text = msg.videoMessage.caption || '';
    mediaUrl = msg.videoMessage.url || '';
  } else if (msg.audioMessage) {
    mediaType = 'audio';
    text = '🎵 Audio Voice Note';
  } else if (msg.templateButtonReplyMessage) {
    text = msg.templateButtonReplyMessage.selectedDisplayText || '';
  } else if (msg.buttonsResponseMessage) {
    text = msg.buttonsResponseMessage.selectedDisplayText || '';
  } else if (msg.listResponseMessage) {
    text = msg.listResponseMessage.title || '';
  }

  const rawJid = m.key?.remoteJid || '';
  if (!rawJid || rawJid.includes('@g.us') || rawJid === 'status@broadcast') {
    // Skip group chats or broadcast status updates
    return null;
  }

  const phone = rawJid.split('@')[0];
  let localPhone = phone;
  if (phone.startsWith('8801')) {
    localPhone = '0' + phone.slice(2);
  }

  const timestamp = m.messageTimestamp
    ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  return {
    whatsapp_msg_id: m.key?.id || '',
    phone: localPhone,
    jid: rawJid,
    sender_name: m.pushName || '',
    is_from_me: Boolean(m.key?.fromMe),
    message_text: text,
    media_type: mediaType,
    media_url: mediaUrl,
    media_caption: text,
    file_name: fileName,
    timestamp
  };
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
    browser: ['WhatsApp CRM Pro', 'Chrome', '124.0.0']
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
        const parsed = extractMessageInfo(m);
        if (parsed) {
          forwardMessageToBackend(parsed);
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

  // Handle real-time incoming and outgoing messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (Array.isArray(messages)) {
      for (const m of messages) {
        const sender = m.key?.remoteJid;
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
        const parsed = extractMessageInfo(m);
        if (parsed) {
          await forwardMessageToBackend(parsed);
        }
      }
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

// Check contact on WhatsApp (existence, profile picture, about, name)
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
    } catch (err) {}

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
        // Check biz_identity_info display_name
        const bizIdentityNode = getBinaryNodeChild(profiles, 'biz_identity_info');
        if (bizIdentityNode?.attrs?.display_name && !contactName) {
          contactName = bizIdentityNode.attrs.display_name;
        }

        // Check vname / name / tag
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

// Send Message Endpoint (supports text + media)
app.post('/send-message', async (req, res) => {
  try {
    const { phone, message, text, mediaType, mediaUrl, mediaBase64, fileName, mimeType } = req.body;
    const messageText = text || message || '';

    if (!phone || (!messageText && !mediaBase64 && !mediaUrl)) {
      return res.status(400).json({ error: 'phone and message or media are required' });
    }

    if (connectionStatus !== 'CONNECTED' || !sock) {
      return res.status(503).json({ error: 'WhatsApp engine is not connected. Scan QR code first.' });
    }

    const jid = formatJID(phone);

    let sentResult = null;

    if (mediaType === 'image' && (mediaBase64 || mediaUrl)) {
      const imgBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : { url: mediaUrl };
      sentResult = await sock.sendMessage(jid, {
        image: imgBuffer,
        caption: messageText || undefined
      });
    } else if (mediaType === 'document' && (mediaBase64 || mediaUrl)) {
      const docBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : { url: mediaUrl };
      sentResult = await sock.sendMessage(jid, {
        document: docBuffer,
        fileName: fileName || 'document.pdf',
        mimetype: mimeType || 'application/pdf',
        caption: messageText || undefined
      });
    } else {
      // Plain text message
      sentResult = await sock.sendMessage(jid, { text: messageText });
    }

    const timestamp = new Date().toISOString();
    const msgId = sentResult?.key?.id || `out_${Date.now()}`;

    // Clean local phone
    let localPhone = phone.replace(/\D/g, '');
    if (localPhone.startsWith('8801')) {
      localPhone = '0' + localPhone.slice(2);
    }

    // Immediately forward outgoing record to backend
    forwardMessageToBackend({
      whatsapp_msg_id: msgId,
      phone: localPhone,
      jid,
      sender_name: 'Me',
      is_from_me: true,
      message_text: messageText,
      media_type: mediaType || '',
      media_url: mediaUrl || '',
      media_caption: messageText,
      file_name: fileName || '',
      timestamp
    });

    return res.json({
      success: true,
      phone: localPhone,
      jid,
      whatsapp_msg_id: msgId,
      timestamp,
      message: 'Message sent successfully'
    });
  } catch (err) {
    console.error('Error in send-message endpoint:', err);
    return res.status(500).json({ error: err.message || 'Failed to send message' });
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

// Start WhatsApp socket & server
connectToWhatsApp();

app.listen(PORT, () => {
  console.log(`WhatsApp Engine running on port ${PORT}`);
});
