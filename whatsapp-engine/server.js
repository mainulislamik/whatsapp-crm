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
  downloadMediaMessage,
  proto
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 5001;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media');
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000';

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Serve downloaded media files statically
app.use('/media', express.static(MEDIA_DIR));

let sock = null;
let lastQr = null;
let lastQrDataUrl = null;
let connectionStatus = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, SCAN_QR, CONNECTED
let connectedUser = null;

// Contacts & LID store
const contactsStore = new Map();
const lidToPhoneMap = new Map();
const groupsStore = new Map();

function saveContact(c) {
  if (!c || !c.id) return;
  const rawId = c.id;
  const numOnly = rawId.split('@')[0];
  let localNum = numOnly;
  if (numOnly.startsWith('8801')) {
    localNum = '0' + numOnly.slice(2);
  }

  // Handle LID mapping
  if (c.lid) {
    const lidNum = c.lid.split('@')[0];
    lidToPhoneMap.set(lidNum, localNum);
    lidToPhoneMap.set(c.lid, rawId);
  }

  const existing = contactsStore.get(rawId) || {};
  const merged = { ...existing, ...c };
  contactsStore.set(rawId, merged);
  contactsStore.set(numOnly, merged);
  contactsStore.set(localNum, merged);
  if (c.lid) {
    contactsStore.set(c.lid, merged);
  }
}

function resolvePhoneAndName(remoteJid, participantJid, pushName) {
  let jid = remoteJid || '';
  let phone = jid.split('@')[0];
  let isGroup = jid.endsWith('@g.us');
  let senderName = pushName || '';

  if (isGroup) {
    const groupInfo = groupsStore.get(jid);
    const groupTitle = groupInfo?.subject || 'WhatsApp Group';
    return {
      phone: jid,
      jid,
      isGroup: true,
      senderName: senderName || (participantJid ? participantJid.split('@')[0] : 'Member'),
      groupTitle
    };
  }

  if (jid.endsWith('@lid')) {
    const lidNum = jid.split('@')[0];
    const mappedPhone = lidToPhoneMap.get(lidNum) || lidToPhoneMap.get(jid);
    if (mappedPhone) {
      phone = mappedPhone;
      jid = `${phone.startsWith('01') ? '88' + phone : phone}@s.whatsapp.net`;
    }
  }

  let localPhone = phone;
  if (phone.startsWith('8801') && phone.length === 13) {
    localPhone = '0' + phone.slice(2);
  }

  const stored = contactsStore.get(jid) || contactsStore.get(phone) || contactsStore.get(localPhone);
  if (stored) {
    senderName = senderName || stored.name || stored.notify || stored.verifiedName || '';
  }

  return {
    phone: localPhone,
    jid,
    isGroup: false,
    senderName: senderName || localPhone,
    groupTitle: ''
  };
}

// Forward single received message to FastAPI backend
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
          timeout: 5000
        }, (res) => {});
        req.on('error', () => {});
        req.write(postData);
        req.end();
        break;
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error forwarding message to backend:', err.message);
  }
}

// Forward batch messages to FastAPI backend
async function forwardBatchToBackend(messagesArray) {
  if (!messagesArray || messagesArray.length === 0) return;
  try {
    const postData = JSON.stringify({ messages: messagesArray });
    const urls = [
      `${BACKEND_URL}/api/chats/incoming/batch`,
      'http://localhost:8050/api/chats/incoming/batch'
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
          timeout: 15000
        }, (res) => {});
        req.on('error', () => {});
        req.write(postData);
        req.end();
        break;
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error forwarding batch messages to backend:', err.message);
  }
}

// Download & save media files from message
async function saveMediaLocally(m, msgId, type) {
  try {
    const buffer = await downloadMediaMessage(
      m,
      'buffer',
      {},
      {
        logger: pino({ level: 'silent' }),
        reuploadRequest: sock?.updateMediaMessage
      }
    );

    let ext = 'bin';
    if (type === 'image') ext = 'jpg';
    else if (type === 'audio') ext = 'ogg';
    else if (type === 'video') ext = 'mp4';
    else if (type === 'document') {
      const fn = m.message?.documentMessage?.fileName;
      ext = fn ? path.extname(fn).replace('.', '') || 'pdf' : 'pdf';
    } else if (type === 'sticker') ext = 'webp';

    const filename = `${type}_${msgId.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const filePath = path.join(MEDIA_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    return `/media/${filename}`;
  } catch (err) {
    console.error(`Failed to download ${type} media:`, err.message);
    return '';
  }
}

// Extract clean text and media info from a Baileys message object
async function extractMessageInfo(m) {
  if (!m || !m.message) return null;
  const msg = m.message;
  let text = '';
  let mediaType = '';
  let mediaUrl = '';
  let fileName = '';

  const msgId = m.key?.id || `msg_${Date.now()}_${Math.random()}`;

  if (msg.conversation) {
    text = msg.conversation;
  } else if (msg.extendedTextMessage?.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    mediaType = 'image';
    text = msg.imageMessage.caption || '';
    mediaUrl = await saveMediaLocally(m, msgId, 'image');
  } else if (msg.documentMessage) {
    mediaType = 'document';
    text = msg.documentMessage.caption || '';
    fileName = msg.documentMessage.fileName || 'document.pdf';
    mediaUrl = await saveMediaLocally(m, msgId, 'document');
  } else if (msg.videoMessage) {
    mediaType = 'video';
    text = msg.videoMessage.caption || '';
    mediaUrl = await saveMediaLocally(m, msgId, 'video');
  } else if (msg.audioMessage) {
    mediaType = 'audio';
    text = '🎵 Voice Note';
    mediaUrl = await saveMediaLocally(m, msgId, 'audio');
  } else if (msg.stickerMessage) {
    mediaType = 'sticker';
    text = '🎨 Sticker';
    mediaUrl = await saveMediaLocally(m, msgId, 'sticker');
  } else if (msg.templateButtonReplyMessage) {
    text = msg.templateButtonReplyMessage.selectedDisplayText || '';
  } else if (msg.buttonsResponseMessage) {
    text = msg.buttonsResponseMessage.selectedDisplayText || '';
  } else if (msg.listResponseMessage) {
    text = msg.listResponseMessage.title || '';
  }

  const rawJid = m.key?.remoteJid || '';
  if (!rawJid || rawJid === 'status@broadcast') {
    return null;
  }

  const participantJid = m.key?.participant || m.participant || '';
  const resolved = resolvePhoneAndName(rawJid, participantJid, m.pushName);

  const timestamp = m.messageTimestamp
    ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  let status = 'DELIVERED';
  if (m.key?.fromMe) {
    if (m.status === 4) status = 'READ';
    else if (m.status === 3) status = 'DELIVERED';
    else status = 'SENT';
  } else {
    status = 'RECEIVED';
  }

  return {
    whatsapp_msg_id: msgId,
    phone: resolved.phone,
    jid: resolved.jid,
    sender_name: resolved.isGroup ? `${resolved.senderName} (${resolved.groupTitle})` : resolved.senderName,
    is_from_me: Boolean(m.key?.fromMe),
    message_text: text || (mediaType ? `[${mediaType}]` : ''),
    media_type: mediaType,
    media_url: mediaUrl,
    media_caption: text,
    file_name: fileName,
    status,
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
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
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

  // Handle sync of history
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
    console.log(`[History Sync] Received: ${contacts?.length || 0} contacts, ${chats?.length || 0} chats, ${messages?.length || 0} messages. isLatest: ${isLatest}`);
    if (Array.isArray(contacts)) {
      contacts.forEach(saveContact);
    }
    if (Array.isArray(chats)) {
      chats.forEach(c => {
        if (c.id?.endsWith('@g.us') && c.name) {
          groupsStore.set(c.id, { subject: c.name });
        }
      });
    }
    if (Array.isArray(messages) && messages.length > 0) {
      const parsedBatch = [];
      for (const m of messages) {
        const sender = m.key?.remoteJid;
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
        const parsed = await extractMessageInfo(m);
        if (parsed) {
          parsedBatch.push(parsed);
        }
      }
      
      // Chunk batches of 50
      for (let i = 0; i < parsedBatch.length; i += 50) {
        const chunk = parsedBatch.slice(i, i + 50);
        await forwardBatchToBackend(chunk);
      }
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
  // Sync read receipts when read on main WhatsApp phone / web
  sock.ev.on('chats.update', async (updates) => {
    if (Array.isArray(updates)) {
      for (const u of updates) {
        if (u.unreadCount === 0 || u.read === true) {
          const rawId = u.id;
          const { phone } = resolvePhoneAndName(rawId, null, null);
          if (phone) {
            try {
              const req = http.request({
                hostname: 'backend',
                port: 8000,
                path: `/api/chats/${encodeURIComponent(phone)}/read`,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': 2
                },
                timeout: 3000
              }, () => {});
              req.on('error', () => {});
              req.write('{}');
              req.end();
            } catch (e) {}
          }
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (Array.isArray(messages)) {
      for (const m of messages) {
        const sender = m.key?.remoteJid;
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
        const parsed = await extractMessageInfo(m);
        if (parsed) {
          await forwardMessageToBackend(parsed);
        }
      }
    }
  });

  // Handle message delivery & read status updates (ticks)
  sock.ev.on('messages.update', async (updates) => {
    if (Array.isArray(updates)) {
      for (const u of updates) {
        if (u.key?.id && u.update?.status) {
          let status = 'SENT';
          if (u.update.status === 4) status = 'READ';
          else if (u.update.status === 3) status = 'DELIVERED';
          
          try {
            const postData = JSON.stringify({
              whatsapp_msg_id: u.key.id,
              status
            });
            const req = http.request({
              hostname: 'backend',
              port: 8000,
              path: '/api/chats/status-update',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              },
              timeout: 3000
            }, () => {});
            req.on('error', () => {});
            req.write(postData);
            req.end();
          } catch (e) {}
        }
      }
    }
  });
}

// Format phone number to WhatsApp JID
function formatJID(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (phone.includes('@g.us')) {
    return phone;
  }
  if (cleaned.startsWith('01') && cleaned.length === 11) {
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

// Check contact on WhatsApp
// Get chat profile picture and real name
app.get('/chat-profile', async (req, res) => {
  try {
    const { jid } = req.query;
    if (!jid || !sock) {
      return res.status(400).json({ error: 'jid is required and socket must be active' });
    }

    let profilePictureUrl = null;
    try {
      profilePictureUrl = await sock.profilePictureUrl(jid, 'image');
    } catch (err) {}

    let name = null;
    let isGroup = jid.endsWith('@g.us');

    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(jid);
        name = meta.subject;
      } catch (err) {
        const stored = groupsStore.get(jid);
        name = stored?.subject || 'WhatsApp Group';
      }
    } else {
      const stored = contactsStore.get(jid) || contactsStore.get(jid.split('@')[0]);
      name = stored?.name || stored?.notify || stored?.verifiedName || null;
    }

    res.json({
      jid,
      name,
      profilePictureUrl,
      isGroup
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    const stored = contactsStore.get(jid) || contactsStore.get(phone);
    let contactName = stored?.name || stored?.notify || stored?.verifiedName || stored?.pushName || null;

    let businessProfile = null;
    try {
      businessProfile = await sock.getBusinessProfile(match.jid);
    } catch (err) {}

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
        const bizIdentityNode = getBinaryNodeChild(profiles, 'biz_identity_info');
        if (bizIdentityNode?.attrs?.display_name && !contactName) {
          contactName = bizIdentityNode.attrs.display_name;
        }
        if (!contactName) {
          const vnameNode = getBinaryNodeChild(profiles, 'vname') || 
                            getBinaryNodeChild(profiles, 'name') || 
                            getBinaryNodeChild(profiles, 'tag');
          if (vnameNode && vnameNode.content) {
            const vnameStr = vnameNode.content.toString();
            if (vnameStr) contactName = vnameStr;
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

// Send Message Endpoint (supports text, image, audio, document, video)
// Mark messages as read on WhatsApp
app.post('/mark-read', async (req, res) => {
  try {
    const { jid, phone, keys } = req.body;
    if (!sock) {
      return res.status(400).json({ error: 'WhatsApp socket not connected' });
    }

    if (Array.isArray(keys) && keys.length > 0) {
      const formattedKeys = keys.map(k => ({
        remoteJid: k.remoteJid || (k.jid ? k.jid : formatJID(phone || jid)),
        id: k.id || k.whatsapp_msg_id,
        participant: k.participant || undefined
      }));
      await sock.readMessages(formattedKeys);
    } else if (jid || phone) {
      const targetJid = jid || formatJID(phone);
      await sock.chatModify({ markRead: true, lastMessages: [] }, targetJid);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /mark-read:', err);
    res.status(500).json({ error: err.message || 'Failed to mark read' });
  }
});

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
    let savedMediaUrl = mediaUrl || '';

    if (mediaType === 'image' && (mediaBase64 || mediaUrl)) {
      let imgBuffer;
      if (mediaBase64) {
        imgBuffer = Buffer.from(mediaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const fn = `out_img_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(MEDIA_DIR, fn), imgBuffer);
        savedMediaUrl = `/media/${fn}`;
      } else {
        imgBuffer = { url: mediaUrl };
      }
      sentResult = await sock.sendMessage(jid, {
        image: imgBuffer,
        caption: messageText || undefined
      });
    } else if (mediaType === 'audio' && (mediaBase64 || mediaUrl)) {
      let audioBuffer;
      if (mediaBase64) {
        audioBuffer = Buffer.from(mediaBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
        const fn = `out_audio_${Date.now()}.mp3`;
        fs.writeFileSync(path.join(MEDIA_DIR, fn), audioBuffer);
        savedMediaUrl = `/media/${fn}`;
      } else {
        audioBuffer = { url: mediaUrl };
      }
      sentResult = await sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mimeType || 'audio/mp4',
        ptt: true // Voice note mode
      });
    } else if (mediaType === 'document' && (mediaBase64 || mediaUrl)) {
      let docBuffer;
      if (mediaBase64) {
        docBuffer = Buffer.from(mediaBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
        const fn = fileName || `out_doc_${Date.now()}.pdf`;
        fs.writeFileSync(path.join(MEDIA_DIR, fn), docBuffer);
        savedMediaUrl = `/media/${fn}`;
      } else {
        docBuffer = { url: mediaUrl };
      }
      sentResult = await sock.sendMessage(jid, {
        document: docBuffer,
        fileName: fileName || 'document.pdf',
        mimetype: mimeType || 'application/pdf',
        caption: messageText || undefined
      });
    } else {
      sentResult = await sock.sendMessage(jid, { text: messageText });
    }

    const timestamp = new Date().toISOString();
    const msgId = sentResult?.key?.id || `out_${Date.now()}`;

    let localPhone = phone.replace(/\D/g, '');
    if (phone.includes('@g.us')) {
      localPhone = phone;
    } else if (localPhone.startsWith('8801')) {
      localPhone = '0' + localPhone.slice(2);
    }

    // Forward to backend
    forwardMessageToBackend({
      whatsapp_msg_id: msgId,
      phone: localPhone,
      jid,
      sender_name: 'Me',
      is_from_me: true,
      message_text: messageText,
      media_type: mediaType || '',
      media_url: savedMediaUrl,
      media_caption: messageText,
      file_name: fileName || '',
      status: 'SENT',
      timestamp
    });

    return res.json({
      success: true,
      phone: localPhone,
      jid,
      whatsapp_msg_id: msgId,
      media_url: savedMediaUrl,
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
