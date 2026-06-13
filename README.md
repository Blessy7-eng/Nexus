# 🏨 NEXUS — Hospitality Crisis Command Center

> Every Second Counts. Every Life Matters.

## 🚨 About NEXUS

NEXUS is a real-time AI-powered emergency 
response and crisis coordination system 
built for hospitality venues like hotels, 
resorts, malls, and airports.

Traditional hotel emergency systems rely 
on phone calls, walkie-talkies, and manual 
logs — wasting critical minutes when every 
second matters. NEXUS replaces all of that 
with a single intelligent command center 
that detects, classifies, and responds to 
emergencies automatically using Google 
Gemini AI.

Built for the Build with AI Solution 
Challenge by Team Delta Techies.

---

## ✨ Key Features

### 🤖 AI-Powered Emergency Response
- One-tap SOS trigger with voice input 
  in any language
- Google Gemini AI automatically classifies 
  incident type (Medical, Fire, Security etc.)
- AI assigns severity score from 1 to 10 
  based on urgency
- Staff auto-assigned based on severity 
  and availability
- Multilingual support — guests can speak 
  or type in any language and AI translates 
  and responds in their language

### 🗺️ Live Command Center Dashboard
- Real-time venue map showing all active 
  incidents across all floors
- Live incident feed sorted by priority
- Personnel status panel showing all staff 
  availability and assignments
- Communication log with full audit trail 
  of every action timestamped

### 🚪 Dynamic Evacuation Routing
- AI-generated evacuation routes unique 
  to each floor layout
- Routes automatically avoid blocked zones 
  and active incident locations
- Animated visual paths on venue map
- Updates in real time as new incidents 
  are reported

### 👤 Separate Guest and Staff Interfaces
- Staff dashboard — full command center 
  with tactical actions, personnel control, 
  and AI assistant
- Guest portal — simple panic-friendly SOS 
  interface with room selection, voice input, 
  and staff notification alerts
- Password protected staff access

### 💬 NEXUS AI Assistant
- Floating AI chat available on both 
  guest and staff dashboards
- Staff can ask about protocols, 
  active incidents, and system status
- Guests can ask safety questions 
  in any language
- Powered by Google Gemini 2.0 Flash

### 📢 Staff to Guest Notifications
- Staff can send real-time notifications 
  directly to specific guest rooms
- Guests receive messages instantly 
  on their portal
- Quick templates for common situations 
  like "Help is on the way" and 
  "Please stay in your room"

### 🔄 Real-Time Everything
- WebSocket powered live updates 
  across all connected devices
- Incident appears on staff dashboard 
  the moment guest triggers SOS
- Staff assignments reflected instantly 
  on both dashboards
- Auto-resolve for low priority incidents 
  with staff freed automatically

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4 |
| Backend | Node.js, Express |
| Real-time | Socket.IO, WebSockets |
| Database | Firebase Firestore |
| AI | Google Gemini 2.0 Flash |
| Notifications | Firebase Cloud Messaging |
| Hosting | Netlify + Firebase |
| Build Tool | Vite |
| Language | TypeScript |

---

## 🤖 AI Features Powered by Gemini

NEXUS uses Google Gemini API across 
8 different tasks:

1. SOS voice classification and translation
2. Incident type and severity scoring
3. Dynamic evacuation route generation
4. Background evacuation monitoring
5. Guest guidance and reassurance
6. Staff command assistant chatbot
7. Simulation data generation
8. Retry-safe API wrapper for reliability

---

## 🏗️ Architecture
Guest Portal (/guest)

↓ SOS Trigger

Backend (Node.js + Express)

↓ Gemini AI Classification

Firebase Firestore

↓ WebSocket Event

Staff Dashboard (/staff)

↓ Auto Assignment

Staff Member Responds

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Google Gemini API key 
  from aistudio.google.com
- Firebase project with Firestore enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/Blessy7-eng/Nexus

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your API keys to .env file

# Start development server
npm run dev
```

### Environment Variables
GEMINI_API_KEY=your_gemini_key

GEMINI_API_KEY_SOS=your_sos_key

GEMINI_API_KEY_INCIDENTS=your_incidents_key

GEMINI_API_KEY_USERS=your_users_key

GEMINI_API_KEY_BACKGROUND=your_background_key

---

## 👥 Team

**Team Name:** Delta Techies

**Team Leader:** Blessy Ashish Waydande

**Hackathon:** Build with AI — 
Hack2Skill Solution Challenge

**Problem Statement:** Accelerated Emergency 
Response and Crisis Coordination 
in Hospitality

---

## 🌍 Real World Impact

Existing hotel emergency tools like 
Amadeus HotSOS and Alice Technologies 
are basic task management systems with 
no AI, no real-time classification, 
and no guest-facing portal.

NEXUS is the first system to combine:
- AI incident classification
- Automatic staff dispatch by severity
- Multilingual voice SOS
- Guest-facing emergency portal
- Real-time venue map with live tracking
- AI-powered evacuation routing

All in one unified platform built on 
Google AI technology.

---

## 📄 License

MIT License — feel free to use and 
build upon this project.

---

## 🔗 Links

- 🌐 Live Demo: [nexus-demo.netlify.app]
- 🎥 Demo Video: [screenpal link]
- 📊 Presentation: [pdf link]

---

*Built with ❤️ by Delta Techies 
using Google Gemini AI*
