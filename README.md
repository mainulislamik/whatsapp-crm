# WhatsApp CRM — Bulk Broadcast System

সম্পূর্ণ ফ্রি ও ওপেন-সোর্স টুল দিয়ে তৈরি **WhatsApp CRM** — কন্টাক্ট ম্যানেজমেন্ট, মেসেজ টেমপ্লেট এবং একসাথে একাধিক ইউজারকে বাল্ক মেসেজ পাঠানোর সম্পূর্ণ সিস্টেম।

## আর্কিটেকচার (Architecture)

```
┌──────────────────────────────────────────────────────────────────┐
│                         Docker Compose                            │
│                                                                   │
│  ┌──────────────────┐  ┌────────────────────┐  ┌───────────────┐ │
│  │ Frontend :3000   │  │ Backend :8000      │  │ WhatsApp      │ │
│  │ Next.js 14 + TS  │  │ FastAPI + Django  │  │ Engine :5001  │ │
│  │ MUI (React)      │◄─┤ REST API + SQLite │◄─┤ Baileys (Node)│ │
│  │ API proxy routes │  │ ORM models        │  │ QR + Sender   │ │
│  └──────────────────┘  └────────────────────┘  └───────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **Frontend (Next.js 14 + TypeScript + MUI):** ড্যাশবোর্ড UI — QR স্ক্যান, কন্টাক্ট সিলেকশন, টেমপ্লেট, বাল্ক সেন্ডার, লাইভ ক্যাম্পেইন হিস্ট্রি। Next.js server-side API proxy routes দিয়ে backend-এর সাথে যোগাযোগ (কোনো CORS সমস্যা নেই)।
- **Backend (Python FastAPI + Django ORM):** REST API লেয়ার (FastAPI) + ডাটাবেজ মডেল ও মাইগ্রেশন (Django ORM — Contact, MessageTemplate, Campaign, CampaignLog)। SQLite ডাটাবেজ।
- **WhatsApp Engine (Baileys):** WhatsApp Web সকেট লাইব্রেরি (`@whiskeysockets/baileys`) — QR কোড জেনারেট করে অ্যাকাউন্ট লিংক করে এবং মেসেজ পাঠায়। **সম্পূর্ণ ফ্রি, কোনো Meta API খরচ নেই।**

## মূল ফিচার

1. **QR স্ক্যান করে WhatsApp কানেক্ট** — WhatsApp ➜ Linked Devices ➜ Link a Device
2. **কন্টাক্ট ম্যানেজমেন্ট** — যোগ/মুছা, ট্যাগ, সার্চ, CSV বাল্ক ইমপোর্ট
3. **মেসেজ টেমপ্লেট** — সেভ করা টেমপ্লেট এক ক্লিকে লোড
4. **ডায়নামিক ভ্যারিয়েবল** — `{name}`, `{phone}` স্বয়ংক্রিয়ভাবে গ্রাহকের তথ্য দিয়ে বসে যায়
5. **বাল্ক ব্রডকাস্ট** — চেকবক্সে সিলেক্ট করা সবাইকে একসাথে মেসেজ
6. **অ্যান্টি-ব্যান ডিলে** — প্রতি মেসেজের মাঝে ৩–২৫ সেকেন্ড (অ্যাডজাস্টেবল) ব্যবধান, অ্যাকাউন্ট সুরক্ষা
7. **লাইভ ডেলিভারি ট্র্যাকিং** — প্রতি প্রাপকের Sent/Failed/Pending স্ট্যাটাস

## চালানোর নিয়ম (Getting Started)

### প্রয়োজনীয় সফটওয়্যার
- Docker + Docker Compose

### শুরু করুন

```bash
# 1. সব সার্ভিস বিল্ড ও চালু করুন
docker compose up --build -d

# 2. ব্রাউজারে খুলুন
http://localhost:3050 (অথবা আপনার পিসির IP:3050)
Backend API: http://localhost:8050
WhatsApp Engine: http://localhost:5001
```

### WhatsApp কানেক্ট করুন
1. ড্যাশবোর্ডে QR কোড দেখাবে
2. মোবাইলে WhatsApp খুলুন ➜ Settings ➜ **Linked Devices** ➜ **Link a Device**
3. QR স্ক্যান করুন — ৫ সেকেন্ডে কানেক্ট হয়ে যাবে
4. সবুজ **"সংযুক্ত"** ব্যাজ দেখলেই প্রস্তুত

### ব্যবহারের ধাপ
1. **কন্টাক্ট যোগ করুন** (একট একট বা CSV ফাইল আপলোড করে)
2. চেকবক্স দিয়ে **প্রাপক সিলেক্ট** করুন
3. টেমপ্লেট থেকে মেসেজ লোড করুন বা নতুন লিখুন (`{name}` ট্যাগ ব্যবহার করুন)
4. **অ্যান্টি-ব্যান ডিলে** সেট করুন (ডিফল্ট ৫ সে.)
5. **"বাল্ক মেসেজ শুরু করুন"** চাপুন — ব্যাকগ্রাউন্ডে কিউ চলবে
6. নিচের হিস্ট্রি টেবিলে লাইভ প্রগ্রেস দেখুন

## CSV ফরম্যাট (কন্টাক্ট ইমপোর্ট)

```csv
Name,Phone,Email,Tags,Notes
রাহিম উদ্দিন,01712345678,rahim@mail.com,VIP,পুরাতন ক্রেতা
করিম আহমেদ,01812345678,,Client,
```

- `Phone` কলাম আবশ্যক; BD লোকাল ফরম্যাট (01XXXXXXXXX) হলে অটো 88 প্রিফিক্স যোগ হয়

## সতর্কতা (Anti-Ban)

- ডিলে ৩ সেকেন্ডের নিচে নামাবেন না
- দিনে ১০০–২০০-এর বেশি অপরিচিত নম্বরে মেসেজ পাঠালে WhatsApp ব্লক করতে পারে
- যাদের নম্বর সেভ করা আছে বা আপনার আগের কথোপকথন আছে তাদের পাঠানো সবচেয়ে নিরাপদ

## API এন্ডপয়েন্ট (Backend :8000)

| Method | Endpoint | কাজ |
|--------|----------|-----|
| GET | `/api/health` | Health check |
| GET | `/api/whatsapp/status` | WhatsApp কানেকশন স্ট্যাটাস |
| GET | `/api/whatsapp/qr` | QR কোড (data URL) |
| POST | `/api/whatsapp/logout` | সেশন লগআউট |
| POST | `/api/whatsapp/restart` | ইঞ্জিন রিস্টার্ট |
| GET/POST | `/api/contacts` | কন্টাক্ট তালিকা / তৈরি |
| DELETE | `/api/contacts/{id}` | কন্টাক্ট মুছুন |
| POST | `/api/contacts/import-csv` | CSV ইমপোর্ট |
| GET/POST | `/api/templates` | টেমপ্লেট তালিকা / তৈরি |
| DELETE | `/api/templates/{id}` | টেমপ্লেট মুছুন |
| POST | `/api/messages/send-direct` | সিঙ্গেল মেসেজ |
| GET/POST | `/api/campaigns` | ক্যাম্পেইন তালিকা / বাল্ক সেন্ড শুরু |
| GET | `/api/campaigns/{id}/logs` | ডেলিভারি লগ |

## ফোন নম্বর ফরম্যাট

- লোকাল BD: `01712345678` → অটো `8801712345678`
- ইন্টারন্যাশনাল: `+8801712...` বা `88017...` — যেকোনো ফরম্যাট কাজ করে

## ডাটা স্টোরেজ

- `wa_engine_auth` volume: WhatsApp সেশন (প্রতি বার QR স্ক্যান লাগবে না)
- `wa_backend_data` volume: SQLite ডাটাবেজ (কন্টাক্ট, টেমপ্লেট, ক্যাম্পেইন)

## Tech Stack

| লেয়ার | টেকনোলজি |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, MUI v5 |
| Backend API | Python FastAPI + Django ORM + SQLite |
| WhatsApp | @whiskeysockets/baileys (Node.js, open-source) |
| Runtime | Docker Compose (৩টি কন্টেইনার) |

## ⚠️ আইনগত নোট

এই টুল শুধুমাত্র নিজের গ্রাহক/পরিচিতদের কাছে অনুমতিসহ (opt-in) মেসেজ পাঠানোর জন্য। WhatsApp-এর Terms of Service ভঙ্গ করে স্প্যাম করলে অ্যাকাউন্ট ব্যান হতে পারে।
