# 🚀 WhatsApp CRM PRO v2.0 — Bulk Marketing & Lead Machine

সম্পূর্ণ ফ্রি ও ওপেন-সোর্স ফুল-স্ট্যাক **WhatsApp CRM PRO** — বাল্ক ব্রডকাস্ট, ডিপ লিড স্ক্র্যাপার (Google, Maps, FB, B2B ডিরেক্টরি), মেসেজ টেমপ্লেট (ছবি, ১০০MB ভিডিও ও ডকুমেন্ট সাপোর্ট), লাইভ অ্যান্টি-ব্যান হিউম্যান প্রেজেন্স সিমুলেশন এবং ওয়ান-টু-ওয়ান লাইভ চ্যাট সিস্টেম।

---

## 🏗️ আর্কিটেকচার (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                 │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────┐ │
│  │ Frontend (:3050)      │  │ Backend (:8050)       │  │ WhatsApp Engine  │ │
│  │ Next.js 14 + TS + MUI │  │ FastAPI + Django ORM  │  │ (:5001) Baileys  │ │
│  │ Web Dashboard & Proxy │◄─┤ REST API + Lead Core  │◄─┤ WhatsApp Web WS  │ │
│  └───────────────────────┘  └───────────┬───────────┘  └──────────────────┘ │
│                                         │                                   │
│                             ┌───────────┴───────────┐                       │
│                             │ SearXNG Search Engine │                       │
│                             │ (:8888) 100+ Deep OSINT                      │
│                             └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Windows পিসিতে Docker দিয়ে ইনস্টল ও চালানোর নিয়ম (Windows Installation Guide)

### ১. যা যা প্রয়োজন (Prerequisites):
1. **Windows 10 / 11 (64-bit)**
2. **[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)** ইনস্টল করা এবং চালু (Running) থাকতে হবে।
3. **[Git for Windows](https://git-scm.com/download/win)** (অথবা PowerShell / Command Prompt)।

---

### ২. ধাপ অনুযায়ী ইনস্টলেশন (Step-by-Step Installation):

#### ধাপ ১: গিট থেকে রিপোজিটরি ক্লোন করুন (Clone Repository)
Windows-এ **PowerShell** অথবা **Git Bash** ওপেন করে রান করুন:

```bash
git clone https://github.com/mainulislamik/whatsapp-crm.git
cd whatsapp-crm
```

---

#### ধাপ ২: পাসওয়ার্ড ও কনফিগারেশন সেট করুন (Set Admin Username & Password)
রিপোজিটরির `.env.example` ফাইলটি কপি করে `.env` ফাইল তৈরি করুন:

**PowerShell-এ:**
```powershell
Copy-Item .env.example .env
```

**অথবা Git Bash / CMD-তে:**
```bash
cp .env.example .env
```

এখন `.env` ফাইলটি Notepad বা VS Code দিয়ে খুলে আপনার পছন্দমতো ইউজারনেম ও পাসওয়ার্ড সেট করুন:

```env
# 🔑 Admin Login Credentials
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_strong_password

# 🌐 Ports (যদি পোর্ট পরিবর্তন করতে চান)
FRONTEND_PORT=3050
BACKEND_PORT=8050
WA_PORT=5001
SEARXNG_PORT=8888
```

> **ডিফল্ট লগইন ক্রেডেনশিয়াল (যদি .env পরিবর্তন না করেন):**
> - **Username:** `stockwhisk`
> - **Password:** `imontouhid4992`

---

#### ধাপ ৩: ডকার কন্টেইনার বিল্ড ও চালু করুন (Start Docker Containers)

```bash
docker compose up -d --build
```

*(প্রথমবার বিল্ড হতে ২–৪ মিনিট সময় লাগতে পারে। সব কন্টেইনার চালু হয়ে গেলে কম্যান্ড প্রম্পট ফ্রি হয়ে যাবে।)*

---

#### ধাপ ৪: ব্রাউজারে অ্যাপ ওপেন করুন (Open Web Dashboard)

ব্রাউজার (Chrome/Edge/Brave) খুলে প্রবেশ করুন:
👉 **`http://localhost:3050`**

- আপনার সেট করা **Username** ও **Password** দিয়ে লগইন করুন।
- **WhatsApp Connect** ট্যাবে গিয়ে QR কোডটি আপনার মোবাইলের WhatsApp (Linked Devices) দিয়ে স্ক্যান করুন।

---

## 🛠️ প্রয়োজনীয় ডকার কম্যান্ডস (Helpful Docker Commands)

| কাজ | কম্যান্ড |
| :--- | :--- |
| **সার্ভার চালু করা (Run in background)** | `docker compose up -d` |
| **কোড আপডেট বা রিবিল্ড করা (Rebuild)** | `docker compose up -d --build` |
| **সার্ভার বন্ধ করা (Stop all)** | `docker compose down` |
| **লাইভ লগ দেখা (View live logs)** | `docker compose logs -f` |
| **হোয়াটসঅ্যাপ সেশন রিসেট করা (Reset WA Auth)** | `docker compose stop whatsapp-engine && rm -rf wa_auth_data/* && docker compose start whatsapp-engine` |

---

## 🌟 স্পেশাল ফিচারসমূহ (Key Features):

1. **🚀 100+ Deep AI Lead Generator:**
   - যেকোনো কি-ওয়ার্ড (যেমন: `Real Estate Dhaka`, `Doctors Chittagong`) দিয়ে এক ক্লিকে ১০০+ ভেরিফাইড হোয়াটসঅ্যাপ নম্বর, নাম, ইমেইল, ফেসবুক ও ওয়েবসাইটসহ স্ক্র্যাপ করে সিআরএমে ইমপোর্ট করার সুবিধা।
2. **🛡️ Ultra Strong Anti-Ban Engine:**
   - মানুষের মতো লাইভ টাইপিং প্রেজেন্স (`composing`), ব্যাচ কুল-ডাউন রেস্টিং পজ (প্রতি ১২ মেসেজে ২৫ সেকেন্ড বিরতি), স্পিনট্যাক্স ভ্যারিয়েশন ও ডিসকানেক্ট হলে স্বয়ংক্রিয় সেফটি পজ।
3. **🎬 100MB ভিডিও, ছবি ও ডকুমেন্ট সাপোর্ট:**
   - MP4, MKV, AVI, MOV, WEBM, 3GP ভিডিও ফাইল সরাসরি আপলোড ও প্রিভিউ প্লেয়ারের মাধ্যমে ব্রডকাস্ট ক্যাম্পেইনে পাঠানো।
4. **💬 লাইভ চ্যাট ও কুইক মেসেঞ্জার:**
   - সরাসরি ড্যাশবোর্ড থেকেই কাস্টমারদের সাথে ওয়ান-টু-ওয়ান চ্যাট করা।
5. **🔁 ১-ক্লিকে ফেইল্ড মেসেজ রিট্রাই:**
   - সংযোগ বিচ্ছিন্ন হলে ফেইল হওয়া নম্বরগুলোতে পুনরায় এক ক্লিকে মেসেজ পাঠানোর সুবিধা।

---

## 🔒 নিরাপত্তা সতর্কতা (Safety & Anti-Ban Best Practices)
- ক্যাম্পেইন পাঠানোর সময় মেসেজ ইন্টারভ্যাল কমপক্ষে **১০–১৫ সেকেন্ড** রাখুন।
- মেসেজে স্পিনট্যাক্স `{নমস্কার|হ্যালো|আসসালামু আলাইকুম} {name}` ব্যবহার করুন যাতে প্রতি মেসেজ ইউনিক হয়।
- নতুন কোনো নম্বরে মেসেজ পাঠানোর আগে প্রতিদিন অল্প অল্প করে ক্যাম্পেইন সাইজ বৃদ্ধি করুন।
