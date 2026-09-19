const express = require('express');
const cors = require('cors');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  proto
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const http = require('http');
const path = require('path');
const fs = require('fs');
const Boom = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 5001;
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

app.use(cors());
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Shared media directory
const MEDIA_DIR = process.env.MEDIA_DIR || '/app/media';
const AUTH_DIR = process.env.AUTH_DIR || '/app/auth_info_baileys';

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use('/media', express.static(MEDIA_DIR));

let sock = null;
let lastQr = null;
let lastQrDataUrl = null;
let connectionStatus = 'DISCONNECTED';
let connectedUser = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// In-memory caches for fast lookup
const contactsStore = new Map();
const lidToPhoneMap = new Map();
const groupsStore = new Map();
const profilePicsCache = new Map();
const unreadCountsMap = new Map();

const LID_MAP_FILE = path.join(AUTH_DIR, 'lid_mapping.json');

function loadLidMapping() {
  try {
    if (fs.existsSync(LID_MAP_FILE)) {
      const data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'string' && !k.endsWith('_jid')) {
          lidToPhoneMap.set(k, v);
          const cleanKey = k.replace('@lid', '');
          lidToPhoneMap.set(cleanKey, v);
        }
      }
      console.log();
    }
  } catch (err) {
    console.warn('[LID Mapping] Load warning:', err.message);
  }
}

function saveLidMapping(lid, phone, verifiedJid) {
  if (!lid || !phone) return;
  try {
    const cleanLid = String(lid).replace('@lid', '').trim();
    const cleanPhone = normalizePhone(phone);
    if (!cleanLid || !cleanPhone) return;

    lidToPhoneMap.set(cleanLid, cleanPhone);
    lidToPhoneMap.set(cleanLid + '@lid', cleanPhone);

    let data = {};
    if (fs.existsSync(LID_MAP_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
      } catch (e) {
        data = {};
      }
    }
    data[cleanLid] = cleanPhone;
    data[cleanLid + '@lid'] = cleanPhone;
    if (verifiedJid) {
      data[cleanLid + '_jid'] = verifiedJid;
    }
    fs.writeFileSync(LID_MAP_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[LID Mapping] Save warning:', err.message);
  }
}

loadLidMapping();

function normalizePhone(raw) {
  if (!raw) return '';
  if (raw.includes('@g.us')) return raw.split('@')[0];
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length >= 13) {
    digits = '0' + digits.slice(2);
  }
  while (digits.startsWith('00')) {
    digits = digits.slice(1);
  }
  return digits;
}

function saveContact(c) {
  if (!c || !c.id) return;
  const rawId = c.id;
  const numOnly = rawId.split('@')[0];
  const normalized = normalizePhone(numOnly);

  if (c.lid) {
    const lidNum = c.lid.split('@')[0];
    const mappedPhone = normalized || numOnly;
    lidToPhoneMap.set(lidNum, mappedPhone);
    lidToPhoneMap.set(c.lid, rawId);
    contactsStore.set(c.lid, c);
    contactsStore.set(lidNum, c);
    saveLidMapping(c.lid, mappedPhone, rawId);
  }

  const existing = contactsStore.get(rawId) || {};
  const merged = { ...existing, ...c };
  contactsStore.set(rawId, merged);
  contactsStore.set(numOnly, merged);
  if (normalized) {
    contactsStore.set(normalized, merged);
  }
}

function resolvePhoneAndName(remoteJid, participantJid, pushName, senderPn) {
  let jid = remoteJid || '';
  let isGroup = jid.endsWith('@g.us');
  let senderName = pushName || '';

  if (isGroup) {
    const gid = jid.split('@')[0];
    const groupInfo = groupsStore.get(jid) || groupsStore.get(gid);
    const groupTitle = groupInfo?.subject || 'WhatsApp Group';
    return {
      phone: gid,
      jid,
      isGroup: true,
      senderName: senderName || (participantJid ? normalizePhone(participantJid.split('@')[0]) : 'Member'),
      groupTitle
    };
  }

  let phone = jid.split('@')[0];

  if (senderPn) {
    const cleanPn = normalizePhone(senderPn);
    if (cleanPn) {
      phone = cleanPn;
      if (jid.endsWith('@lid')) {
        const lidNum = jid.split('@')[0];
        saveLidMapping(lidNum, cleanPn, (cleanPn.startsWith('01') ? '88' + cleanPn : cleanPn) + '@s.whatsapp.net');
      }
      jid = (phone.startsWith('01') ? '88' + phone : phone) + '@s.whatsapp.net';
    }
  }

  if (jid.endsWith('@lid') || (phone.length >= 14 && !phone.startsWith('8801'))) {
    const lidNum = jid.split('@')[0];
    const mappedPhone = lidToPhoneMap.get(lidNum) || lidToPhoneMap.get(jid);
    if (mappedPhone) {
      phone = mappedPhone;
      jid = (phone.startsWith('01') ? '88' + phone : phone) + '@s.whatsapp.net';
    }
  }

  const normalized = normalizePhone(phone);

  const stored = contactsStore.get(jid) || contactsStore.get(phone) || contactsStore.get(normalized) || (remoteJid.endsWith('@lid') ? contactsStore.get(remoteJid) : null);
  if (stored) {
    senderName = stored.name || stored.notify || stored.verifiedName || senderName || '';
  }

  return {
    phone: normalized || phone,
    jid,
    isGroup: false,
    senderName: senderName || (normalized || phone),
    groupTitle: ''
  };
}

async function extractMessageInfo(m) {
  if (!m.message) return null;
  const msgKey = m.key;
  const remoteJid = msgKey.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return null;

  const isFromMe = Boolean(msgKey.fromMe);
  const participant = msgKey.participant || '';
  const pushName = m.pushName || '';
  const senderPn = msgKey.senderPn || msgKey.participantPn || m.senderPn || '';

  const { phone, jid, isGroup, senderName, groupTitle } = resolvePhoneAndName(remoteJid, participant, pushName, senderPn);

  let messageText = '';
  let mediaType = '';
  let mediaUrl = '';
  let fileName = '';
  let fileSize = 0;

  const msgContent = m.message;

  if (msgContent.conversation) {
    messageText = msgContent.conversation;
  } else if (msgContent.extendedTextMessage) {
    messageText = msgContent.extendedTextMessage.text || '';
  } else if (msgContent.imageMessage) {
    mediaType = 'image';
    messageText = msgContent.imageMessage.caption || '';
    fileName = `img_${msgKey.id}.jpg`;
    fileSize = Number(msgContent.imageMessage.fileLength || 0);
  } else if (msgContent.videoMessage) {
    mediaType = 'video';
    messageText = msgContent.videoMessage.caption || '';
    fileName = `vid_${msgKey.id}.mp4`;
    fileSize = Number(msgContent.videoMessage.fileLength || 0);
  } else if (msgContent.audioMessage) {
    mediaType = 'audio';
    fileName = `audio_${msgKey.id}.${msgContent.audioMessage.ptt ? 'ogg' : 'mp3'}`;
    fileSize = Number(msgContent.audioMessage.fileLength || 0);
  } else if (msgContent.documentMessage) {
    mediaType = 'document';
    messageText = msgContent.documentMessage.caption || '';
    fileName = msgContent.documentMessage.fileName || `doc_${msgKey.id}.pdf`;
    fileSize = Number(msgContent.documentMessage.fileLength || 0);
  }

  // Media download handling
  if (mediaType && fileName) {
    const filePath = path.join(MEDIA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      try {
        const buffer = await downloadMediaMessage(m, 'buffer', {}, {
          logger: pino({ level: 'silent' }),
          reuploadRequest: sock ? sock.updateMediaMessage : undefined
        });
        if (buffer && buffer.length > 0) {
          fs.writeFileSync(filePath, buffer);
          mediaUrl = `/media/${fileName}`;
        }
      } catch (err) {
        console.warn(`[Media Download Warning] ${fileName}: ${err.message}`);
      }
    } else {
      mediaUrl = `/media/${fileName}`;
    }
  }

  let timestamp = new Date().toISOString();
  if (m.messageTimestamp) {
    const tsNumber = typeof m.messageTimestamp === 'object' && m.messageTimestamp.low 
      ? m.messageTimestamp.low 
      : Number(m.messageTimestamp);
    if (!isNaN(tsNumber) && tsNumber > 0) {
      timestamp = new Date(tsNumber * 1000).toISOString();
    }
  }

  return {
    whatsapp_msg_id: msgKey.id,
    phone,
    jid,
    sender_name: isFromMe ? 'Me' : (isGroup ? `${senderName} (${groupTitle})` : senderName),
    is_from_me: isFromMe,
    message_text: messageText,
    media_type: mediaType,
    media_url: mediaUrl,
    file_name: fileName,
    file_size: fileSize,
    timestamp,
    is_group: isGroup,
    group_name: groupTitle,
    is_read: isFromMe || m.status === 4
  };
}

async function fetchGroupsAndPictures() {
  if (!sock) return;
  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const [gid, gmeta] of Object.entries(groups)) {
      const num = gid.split('@')[0];
      groupsStore.set(gid, { subject: gmeta.subject, participants: gmeta.participants });
      groupsStore.set(num, { subject: gmeta.subject, participants: gmeta.participants });

      // Fetch group pic in background
      try {
        const pic = await sock.profilePictureUrl(gid, 'image');
        if (pic) {
          profilePicsCache.set(gid, pic);
          profilePicsCache.set(num, pic);
        }
      } catch (e) {}
    }
    console.log(`[WhatsApp Engine] Cached ${Object.keys(groups).length} groups successfully`);
  } catch (err) {
    console.warn('[WhatsApp Engine] groupFetchAllParticipating error:', err.message);
  }
}

async function connectToWhatsApp() {
  connectionStatus = 'CONNECTING';
  let state, saveCreds;
  try {
    const auth = await useMultiFileAuthState(AUTH_DIR);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } catch (e) {
    console.error('Failed to load multi file auth state:', e);
    return;
  }

  let version;
  try {
    const vInfo = await fetchLatestBaileysVersion();
    version = vInfo.version;
  } catch (e) {
    version = [2, 3000, 1015901307];
  }

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    browser: ['Ubuntu', 'Chrome', '124.0.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 3000,
    maxMsgRetryCount: 5
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
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isQrTimeout = statusCode === 408 || String(lastDisconnect?.error).includes('QR refs attempts ended');
      connectionStatus = 'DISCONNECTED';
      connectedUser = null;
      lastQr = null;
      lastQrDataUrl = null;

      console.log(`[WhatsApp Engine] Connection closed. StatusCode: ${statusCode}. LoggedOut: ${isLoggedOut}. isQrTimeout: ${isQrTimeout}. Error:`, lastDisconnect?.error);

      const hasCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));

      if (isLoggedOut) {
        console.log('[WhatsApp Engine] Session logged out by WhatsApp server. Resetting auth credentials...');
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {}
        contactsStore.clear();
        lidToPhoneMap.clear();
        groupsStore.clear();
        profilePicsCache.clear();
        unreadCountsMap.clear();
        reconnectAttempts = 0;
        connectionStatus = 'DISCONNECTED';
      } else if (isQrTimeout || (!hasCreds && reconnectAttempts >= 3)) {
        console.log('[WhatsApp Engine] QR pairing timed out or max retry reached. Pausing auto-reconnect until user requests QR.');
        connectionStatus = 'QR_TIMEOUT';
        reconnectAttempts = 0;
      } else {
        reconnectAttempts++;
        const delay = Math.min(3000 * reconnectAttempts, 20000);
        console.log(`[WhatsApp Engine] Attempting reconnect in ${delay / 1000}s (Attempt ${reconnectAttempts})...`);
        setTimeout(connectToWhatsApp, delay);
      }
    } else if (connection === 'open') {
      connectionStatus = 'CONNECTED';
      reconnectAttempts = 0;
      lastQr = null;
      lastQrDataUrl = null;
      connectedUser = sock.user;
      console.log('[WhatsApp Engine] Connection opened successfully for user:', connectedUser?.id);
      setTimeout(fetchGroupsAndPictures, 2000);
    }
  });

  // Handle sync of history
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
    console.log(`[History Sync] Received: ${contacts?.length || 0} contacts, ${chats?.length || 0} chats, ${messages?.length || 0} messages.`);
    
    if (Array.isArray(contacts)) {
      contacts.forEach(saveContact);
    }

    if (Array.isArray(chats)) {
      chats.forEach(c => {
        if (c.id?.endsWith('@g.us') && c.name) {
          const gid = c.id.split('@')[0];
          groupsStore.set(c.id, { subject: c.name });
          groupsStore.set(gid, { subject: c.name });
        }
        unreadCountsMap.set(c.id, c.unreadCount || 0);
        unreadCountsMap.set(c.id.split('@')[0], c.unreadCount || 0);
      });
    }

    if (Array.isArray(messages) && messages.length > 0) {
      const parsedBatch = [];
      for (const m of messages) {
        const sender = m.key?.remoteJid;
        const senderPn = m.key?.senderPn || m.key?.participantPn || m.senderPn || '';
        if (sender && senderPn && sender.endsWith('@lid')) {
          saveLidMapping(sender, senderPn);
        }
        if (sender && m.pushName) {
          saveContact({ id: sender, notify: m.pushName, pushName: m.pushName });
        }
        const parsed = await extractMessageInfo(m);
        if (parsed) {
          const chatUnread = unreadCountsMap.get(parsed.jid) || unreadCountsMap.get(parsed.phone) || 0;
          parsed.is_read = (chatUnread === 0) || Boolean(m.key?.fromMe) || m.status === 4 || m.status === 'READ';
          parsedBatch.push(parsed);
        }
      }
      
      for (let i = 0; i < parsedBatch.length; i += 50) {
        const chunk = parsedBatch.slice(i, i + 50);
        await forwardBatchToBackend(chunk);
      }
    }

    setTimeout(fetchGroupsAndPictures, 2000);
  });

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
        const parsed = await extractMessageInfo(m);
        if (parsed) {
          if (parsed.is_from_me) parsed.is_read = true;
          await forwardMessageToBackend(parsed);
        }
      }
    }
  });

  // Sync read receipts
  sock.ev.on('chats.update', async (updates) => {
    if (Array.isArray(updates)) {
      for (const u of updates) {
        if (u.unreadCount === 0 || u.read === true) {
          const rawId = u.id;
          const { phone } = resolvePhoneAndName(rawId, null, null);
          unreadCountsMap.set(rawId, 0);
          unreadCountsMap.set(phone, 0);
          try {
            const postData = JSON.stringify({});
            const req = http.request({
              hostname: 'backend',
              port: 8000,
              path: `/api/chats/${encodeURIComponent(phone)}/read`,
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
              timeout: 3000
            }, () => {});
            req.on('error', () => {});
            req.write('{}');
            req.end();
          } catch (e) {}
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
            const postData = JSON.stringify({ whatsapp_msg_id: u.key.id, status });
            const req = http.request({
              hostname: 'backend',
              port: 8000,
              path: '/api/chats/status-update',
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
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

// Forward single received message to FastAPI backend
async function forwardMessageToBackend(msgData) {
  try {
    const postData = JSON.stringify(msgData);
    const req = http.request({
      hostname: 'backend',
      port: 8000,
      path: '/api/chats/incoming',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 5000
    }, () => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (err) {}
}

// Forward batch of history messages to FastAPI backend
async function forwardBatchToBackend(msgBatch) {
  try {
    const postData = JSON.stringify({ messages: msgBatch });
    const req = http.request({
      hostname: 'backend',
      port: 8000,
      path: '/api/chats/incoming/batch',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 10000
    }, () => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (err) {}
}

// Format phone number to WhatsApp JID
function formatJID(phone) {
  if (!phone) return '';
  let str = String(phone).trim();
  if (str.includes('@g.us') || str.includes('@s.whatsapp.net') || str.includes('@lid')) {
    return str;
  }
  const cleanDigits = str.replace(/\D/g, '');
  const mapped = lidToPhoneMap.get(cleanDigits) || lidToPhoneMap.get(str);
  if (mapped) {
    const norm = normalizePhone(mapped);
    return (norm.startsWith('01') ? '88' + norm : norm) + '@s.whatsapp.net';
  }
  if (cleanDigits.length >= 14 && !cleanDigits.startsWith('8801')) {
    return cleanDigits + '@lid';
  }
  let cleaned = cleanDigits;
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
    hasQr: Boolean(lastQrDataUrl)
  });
});

// QR Code endpoint
app.get('/qr', (req, res) => {
  if (!sock || connectionStatus === 'QR_TIMEOUT' || connectionStatus === 'DISCONNECTED') {
    const hasCreds = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
    if (!hasCreds) {
      console.log('[WhatsApp Engine] User requested /qr while inactive. Initializing QR generation...');
      reconnectAttempts = 0;
      connectToWhatsApp();
    }
  }
  res.json({
    status: connectionStatus,
    hasQr: Boolean(lastQrDataUrl),
    qrDataUrl: lastQrDataUrl,
    rawQr: lastQr
  });
});

// Logout endpoint
app.post('/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (e) {}
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch (e) {}
  contactsStore.clear();
  lidToPhoneMap.clear();
  groupsStore.clear();
  profilePicsCache.clear();
  unreadCountsMap.clear();
  connectionStatus = 'DISCONNECTED';
  connectedUser = null;
  lastQr = null;
  lastQrDataUrl = null;
  reconnectAttempts = 0;
  setTimeout(connectToWhatsApp, 1000);
  res.json({ success: true, message: 'Logged out successfully' });
});

// Restart endpoint
app.post('/restart', async (req, res) => {
  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (e) {}
  connectionStatus = 'CONNECTING';
  reconnectAttempts = 0;
  setTimeout(connectToWhatsApp, 1000);
  res.json({ success: true, message: 'WhatsApp engine restarted' });
});

// 1-to-1 Send Direct & Bulk Send Message endpoint with humanized presence
app.post('/send', async (req, res) => {
  try {
    if (!sock || connectionStatus !== 'CONNECTED') {
      return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Please scan QR code.' });
    }

    const { to, text, mediaBase64, mediaType, fileName, mimeType } = req.body;
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const jid = formatJID(to);
    let sentMsg;

    // Simulate natural typing presence before sending
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise(r => setTimeout(r, 1200));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {}

    if (mediaBase64) {
      const buffer = Buffer.from(mediaBase64, 'base64');
      if (mediaType === 'image' || (mimeType && mimeType.startsWith('image/'))) {
        sentMsg = await sock.sendMessage(jid, {
          image: buffer,
          caption: text || undefined,
          mimetype: mimeType || 'image/jpeg'
        });
      } else if (mediaType === 'video' || (mimeType && mimeType.startsWith('video/'))) {
        sentMsg = await sock.sendMessage(jid, {
          video: buffer,
          caption: text || undefined,
          mimetype: mimeType || 'video/mp4'
        });
      } else if (mediaType === 'audio' || (mimeType && mimeType.startsWith('audio/'))) {
        sentMsg = await sock.sendMessage(jid, {
          audio: buffer,
          mimetype: mimeType || 'audio/mp4',
          ptt: false
        });
      } else {
        sentMsg = await sock.sendMessage(jid, {
          document: buffer,
          caption: text || undefined,
          fileName: fileName || 'document.pdf',
          mimetype: mimeType || 'application/octet-stream'
        });
      }
    } else {
      if (!text || !String(text).trim()) {
        return res.status(400).json({ success: false, error: 'Message text or attachment is required.' });
      }
      sentMsg = await sock.sendMessage(jid, { text: String(text) });
    }

    const messageId = sentMsg?.key?.id || `msg_${Date.now()}`;
    return res.json({
      success: true,
      messageId,
      whatsapp_msg_id: messageId,
      jid,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in /send:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to send WhatsApp message' });
  }
});

// Live Chat Send Message endpoint
app.post('/send-message', async (req, res) => {
  try {
    if (!sock || connectionStatus !== 'CONNECTED') {
      return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Please scan QR code.' });
    }

    const { phone, text, mediaType, mediaUrl, fileName } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const jid = formatJID(phone);
    let sentMsg;

    // Simulate typing
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise(r => setTimeout(r, 800));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {}

    if (mediaUrl) {
      let localPath = mediaUrl;
      if (mediaUrl.startsWith('/media/')) {
        localPath = path.join(MEDIA_DIR, mediaUrl.replace('/media/', ''));
      }
      if (fs.existsSync(localPath)) {
        const fileBuffer = fs.readFileSync(localPath);
        if (mediaType === 'image') {
          sentMsg = await sock.sendMessage(jid, { image: fileBuffer, caption: text || undefined });
        } else if (mediaType === 'video') {
          sentMsg = await sock.sendMessage(jid, { video: fileBuffer, caption: text || undefined });
        } else if (mediaType === 'audio') {
          sentMsg = await sock.sendMessage(jid, { audio: fileBuffer, mimetype: 'audio/mp4' });
        } else {
          sentMsg = await sock.sendMessage(jid, { document: fileBuffer, fileName: fileName || 'file.pdf', caption: text || undefined });
        }
      } else {
        sentMsg = await sock.sendMessage(jid, { text: `${text || ''} ${mediaUrl}`.trim() });
      }
    } else {
      sentMsg = await sock.sendMessage(jid, { text: String(text || '') });
    }

    const messageId = sentMsg?.key?.id || `msg_${Date.now()}`;
    return res.json({
      success: true,
      whatsapp_msg_id: messageId,
      jid,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in /send-message:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to send chat message' });
  }
});

// Mark messages as read endpoint
app.post('/mark-read', async (req, res) => {
  try {
    const { keys } = req.body;
    if (sock && Array.isArray(keys) && keys.length > 0) {
      await sock.readMessages(keys);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chat profile lookup
app.get('/chat-profile', async (req, res) => {
  try {
    const jid = req.query.jid;
    if (!jid || !sock) {
      return res.status(400).json({ error: 'JID required or socket disconnected' });
    }
    let pic = profilePicsCache.get(jid) || null;
    if (!pic) {
      try {
        pic = await sock.profilePictureUrl(jid, 'image');
        if (pic) profilePicsCache.set(jid, pic);
      } catch (e) {}
    }
    let about = null;
    try {
      const st = await sock.fetchStatus(jid);
      about = st?.status || null;
    } catch (e) {}
    res.json({ jid, profilePictureUrl: pic, about });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch resolve contact names & profile pictures for chat list
app.post('/api/resolve-chats', async (req, res) => {
  try {
    const { chats } = req.body;
    if (!Array.isArray(chats) || !sock) {
      return res.json({ results: {} });
    }

    const results = {};
    const promises = chats.map(async (c) => {
      let rawJid = c.jid || '';
      const phone = c.phone || '';
      if (!rawJid && phone) {
        rawJid = phone.includes('@') ? phone : (phone.endsWith('.us') ? phone + '@g.us' : (phone.startsWith('01') ? '88' + phone + '@s.whatsapp.net' : phone + '@s.whatsapp.net'));
      }
      if (!rawJid) return;

      const isGroup = rawJid.includes('@g.us') || phone.includes('@g.us') || (rawJid.startsWith('120363') && !rawJid.includes('@'));
      let name = null;
      let pic = profilePicsCache.get(rawJid) || profilePicsCache.get(rawJid.split('@')[0]) || profilePicsCache.get(phone) || null;

      if (isGroup) {
        const gKey = rawJid.includes('@g.us') ? rawJid : rawJid + '@g.us';
        const ginfo = groupsStore.get(gKey) || groupsStore.get(rawJid) || groupsStore.get(rawJid.split('@')[0]) || groupsStore.get(phone);
        name = ginfo?.subject || null;

        if (!name) {
          try {
            const gmeta = await sock.groupMetadata(gKey);
            if (gmeta && gmeta.subject) {
              name = gmeta.subject;
              groupsStore.set(gKey, { subject: gmeta.subject, participants: gmeta.participants });
              groupsStore.set(rawJid, { subject: gmeta.subject });
              groupsStore.set(phone, { subject: gmeta.subject });
            }
          } catch (e) {}
        }
      } else {
        const mappedPhone = lidToPhoneMap.get(rawJid) || lidToPhoneMap.get(phone) || rawJid;
        const cinfo = contactsStore.get(rawJid) || contactsStore.get(rawJid.split('@')[0]) || contactsStore.get(phone) || contactsStore.get(mappedPhone);
        name = cinfo?.name || cinfo?.notify || cinfo?.verifiedName || cinfo?.pushName || null;
      }

      if (!pic) {
        try {
          const fetchJid = isGroup && !rawJid.includes('@g.us') ? rawJid + '@g.us' : rawJid;
          pic = await sock.profilePictureUrl(fetchJid, 'image');
          if (pic) {
            profilePicsCache.set(rawJid, pic);
            profilePicsCache.set(rawJid.split('@')[0], pic);
            profilePicsCache.set(phone, pic);
          }
        } catch (e) {}
      }

      const resObj = {
        name,
        profile_picture: pic,
        profilePictureUrl: pic,
        isGroup
      };
      results[phone] = resObj;
      results[rawJid] = resObj;
      results[rawJid.split('@')[0]] = resObj;
    });

    await Promise.allSettled(promises);
    res.json({ results, resolved: Object.entries(results).map(([k, v]) => ({ phone: k, ...v })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if a phone number exists on WhatsApp + fetch live details
app.get('/check-contact', async (req, res) => {
  try {
    const rawPhone = req.query.phone;
    if (!rawPhone || !sock) {
      return res.status(400).json({ error: 'Phone parameter required or socket not ready', exists: false });
    }

    let phone = String(rawPhone).replace(/\D/g, '');
    let jidsToCheck = [];

    if (phone.startsWith('01') && phone.length === 11) {
      jidsToCheck.push('88' + phone + '@s.whatsapp.net');
    } else if (phone.startsWith('8801') && phone.length === 13) {
      jidsToCheck.push(phone + '@s.whatsapp.net');
      jidsToCheck.push('0' + phone.slice(2) + '@s.whatsapp.net');
    } else {
      jidsToCheck.push(phone + '@s.whatsapp.net');
      if (phone.startsWith('01')) {
        jidsToCheck.push('88' + phone + '@s.whatsapp.net');
      }
    }

    let exists = false;
    let verifiedJid = null;
    let foundLid = null;

    try {
      const results = await sock.onWhatsApp(...jidsToCheck);
      if (Array.isArray(results) && results.length > 0) {
        const found = results.find(r => r && r.exists);
        if (found) {
          exists = true;
          verifiedJid = found.jid;
          if (found.lid) {
            foundLid = found.lid;
            saveLidMapping(found.lid, phone, verifiedJid);
          }
        }
      }
    } catch (e) {
      console.warn('sock.onWhatsApp check error:', e.message);
    }

    let profilePictureUrl = null;
    let name = null;
    let about = null;
    let businessProfile = null;

    if (exists && verifiedJid) {
      try {
        profilePictureUrl = await sock.profilePictureUrl(verifiedJid, 'image');
      } catch (e) {}

      try {
        const statusObj = await sock.fetchStatus(verifiedJid);
        about = statusObj?.status || null;
      } catch (e) {}

      try {
        businessProfile = await sock.getBusinessProfile(verifiedJid);
      } catch (e) {}

      const normPhone = normalizePhone(phone);
      const cinfo = contactsStore.get(verifiedJid) || contactsStore.get(phone) || contactsStore.get(normPhone);
      name = cinfo?.name || cinfo?.notify || cinfo?.verifiedName || businessProfile?.description || null;
    }

    res.json({
      connected: connectionStatus === 'CONNECTED',
      exists,
      jid: verifiedJid || (phone.startsWith('01') ? '88' + phone + '@s.whatsapp.net' : phone + '@s.whatsapp.net'),
      lid: foundLid,
      name,
      profilePictureUrl,
      about,
      businessProfile
    });
  } catch (err) {
    console.error('Error in /check-contact:', err);
    res.status(500).json({ error: err.message, exists: false });
  }
});

// Bulk sync LIDs for phone numbers
app.post('/api/sync-lids', async (req, res) => {
  try {
    if (!sock || connectionStatus !== 'CONNECTED') {
      return res.status(400).json({ error: 'WhatsApp is not connected' });
    }
    const { phones } = req.body;
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: 'Array of phones required' });
    }

    const discovered = {};
    for (const raw of phones) {
      let p = String(raw).replace(/\D/g, '');
      if (!p) continue;
      let checkList = [];
      if (p.startsWith('01') && p.length === 11) {
        checkList.push('88' + p + '@s.whatsapp.net');
      } else if (p.startsWith('8801') && p.length === 13) {
        checkList.push(p + '@s.whatsapp.net');
      } else {
        checkList.push(p + '@s.whatsapp.net');
      }

      try {
        const results = await sock.onWhatsApp(...checkList);
        if (Array.isArray(results)) {
          const found = results.find(r => r && r.exists);
          if (found && found.lid) {
            const cleanLid = found.lid.split('@')[0];
            const normPhone = normalizePhone(p);
            saveLidMapping(cleanLid, normPhone, found.jid);
            discovered[cleanLid] = normPhone;
          }
        }
      } catch (err) {}
    }

    res.json({ success: true, count: Object.keys(discovered).length, discovered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set manual LID mapping
app.post('/api/set-lid-mapping', (req, res) => {
  const { lid, phone } = req.body;
  if (!lid || !phone) {
    return res.status(400).json({ error: 'lid and phone required' });
  }
  const normPhone = normalizePhone(phone);
  saveLidMapping(lid, normPhone);
  res.json({ success: true, lid, phone: normPhone });
});

// Get all LID mappings
app.get('/api/lid-mappings', (req, res) => {
  let data = {};
  if (fs.existsSync(LID_MAP_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
    } catch (e) {}
  }
  res.json({ count: Object.keys(data).length, mappings: data });
});

// Start WhatsApp socket & server
connectToWhatsApp();

app.listen(PORT, () => {
  console.log(`WhatsApp Baileys Engine running on port ${PORT}`);
});