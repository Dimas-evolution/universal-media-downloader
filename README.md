Universal Media Downloader (UMD)
> **All-in-One HD Media Downloader for Every Platform**
Universal Media Downloader (UMD) is a high-performance web application designed to download media from multiple popular platforms (TikTok, Instagram, Facebook, Twitter/X, YouTube, and Pinterest) with clean UI themes, automatic platform routing, and local FFmpeg audio-video muxing.
---
🚀 Key Features
Auto-Routing & Platform Validation: Automatically detects the domain when you paste a link and instantly switches to the correct platform tab (e.g., pasting a YouTube link jumps straight to the YouTube tab).
Anti-Double Download Protection: Automatically checks local history and warns users if a URL has already been downloaded, offering options to Play Existing or Re-download.
Download History (`localStorage`): Keeps a persistent log of previously downloaded media so users can replay, share, or re-download without re-extracting links.
Native Player & Web Share API: Instant playback using native device players and quick sharing to messaging apps (WhatsApp, Telegram, etc.) or clipboard copy.
Dual Theme Support: Switch seamlessly between Default (Clean/Fresh Light Blue) and Dark (Night Mode) themes with cohesive color palettes.
Flexible Quality Options: Simple and clear quality preferences: Low (480p), Medium (720p), High (1080p), and Extreme (2K-4K with fallback).
---
🛠️ Tech Stack
Frontend: React (Vite), Tailwind CSS v4 (`@tailwindcss/postcss`), Lucide Icons.
Backend: Python FastAPI, `yt-dlp` (Stream Extraction), `FFmpeg` (Audio-Video Transmuxing).
Storage: Browser `localStorage` for UI preferences and download history.
---
⚙️ Project Structure
```text
all-downloader/
├── backend/
│   ├── downloads/          # Temporary processed media files
│   ├── venv/               # Python Virtual Environment
│   └── main.py             # FastAPI server & yt-dlp / FFmpeg logic
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main UI component & state management
    │   ├── index.css       # Tailwind v4 entry point
    │   └── main.jsx        # React DOM renderer
    ├── package.json        # Frontend dependencies
    ├── tailwind.config.js  # Tailwind configuration
    └── postcss.config.js   # PostCSS configuration
```
---
📦 Installation & Running Locally
1. Backend Setup (FastAPI)
Open a terminal in the `backend` directory and run:
```powershell
# Activate virtual environment
venv\Scripts\activate

# Run FastAPI server
uvicorn main:app --reload --port 8000
```
2. Frontend Setup (React Vite)
Open a separate terminal in the `frontend` directory and run:
```powershell
# Install dependencies (if not already installed)
npm install

# Start development server
npm run dev
```
Open your browser at `http://localhost:5173/`.
---
🗺️ Roadmap / Future Improvements
Optional User Authentication (Email/Password & Google OAuth) to sync VIP status across devices.
Automated background cleanup scripts in FastAPI for temporary files in `downloads/`.
