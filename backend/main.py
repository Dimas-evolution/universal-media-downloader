import os
from pathlib import Path 
import re
import glob
import uuid
import asyncio
from typing import Dict, List, Optional
import yt_dlp
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

app = FastAPI(title="SnapTik Pro Enterprise Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = os.path.join(Path.home(), "Downloads", "UMD")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# State Store untuk Progress Tracking Real-Time
tasks_db: Dict[str, dict] = {}

PLATFORM_PATTERNS = {
    "YouTube": r"(youtube\.com|youtu\.be)",
    "TikTok": r"(tiktok\.com)",
    "Instagram": r"(instagram\.com)",
    "Facebook": r"(facebook\.com|fb\.watch)",
    "Twitter/X": r"(twitter\.com|x\.com)",
    "Pinterest": r"(pinterest\.com|pin\.it)",
}

class ExtractRequest(BaseModel):
    url: str
    target_platform: Optional[str] = "Auto"

class DownloadTaskRequest(BaseModel):
    url: str
    task_id: str
    format_id: Optional[str] = "best"
    height_limit: Optional[int] = 1080

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[^\w\s.-]', '', name).strip()
    return cleaned if cleaned else f"media_{uuid.uuid4().hex[:6]}.mp4"

@app.post("/api/extract")
async def extract_media(payload: ExtractRequest):
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL tidak boleh kosong.")

    # Validasi platform jika ditentukan
    matched_platform = "Unknown"
    for plat, pattern in PLATFORM_PATTERNS.items():
        if re.search(pattern, url, re.IGNORECASE):
            matched_platform = plat
            break

    meta_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'http_headers': {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            'Accept-Language': 'en-US,en;q=0.9',
        }
    }

    try:
        loop = asyncio.get_event_loop()
        def run_extract():
            with yt_dlp.YoutubeDL(meta_opts) as ydl:
                return ydl.extract_info(url, download=False)
        
        info = await loop.run_in_executor(None, run_extract)
        task_id = str(uuid.uuid4())[:8]

        # Ekstraksi daftar opsi resolusi riil yang tersedia
        formats = info.get("formats", [])
        available_qualities = []
        seen_heights = set()

        for f in formats:
            height = f.get("height")
            vcodec = f.get("vcodec", "none")
            ext = f.get("ext", "mp4")
            if height and vcodec != "none" and height not in seen_heights:
                seen_heights.add(height)
                available_qualities.append({
                    "height": height,
                    "label": f"{height}p" + (" (HD)" if height >= 720 else "") + (" (4K UHD)" if height >= 2160 else ""),
                    "format_id": f.get("format_id"),
                    "ext": ext
                })

        # Urutkan dari resolusi tertinggi ke terendah
        available_qualities.sort(key=lambda x: x["height"], reverse=True)

        if not available_qualities:
            available_qualities = [{"height": 1080, "label": "Original HD", "format_id": "best", "ext": "mp4"}]

        tasks_db[task_id] = {
            "percent": 0,
            "status": "idle",
            "title": info.get("title", "Video Media"),
            "file_path": None,
            "error": None
        }

        return {
            "success": True,
            "task_id": task_id,
            "platform": matched_platform if matched_platform != "Unknown" else info.get("extractor_key", "Video"),
            "title": info.get("title", "Unduhan Video"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "qualities": available_qualities,
            "original_url": url
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses sumber: {str(e)}")

@app.get("/api/progress/{task_id}")
async def get_task_progress(task_id: str):
    task = tasks_db.get(task_id)
    if not task:
        return JSONResponse({"status": "idle", "percent": 0, "error": None})
    return JSONResponse(task)

def process_worker(task_id: str, url: str, height_limit: int):
    out_tmpl = os.path.join(DOWNLOAD_DIR, f"{task_id}_%(title).60s.%(ext)s")

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 1
            downloaded = d.get('downloaded_bytes', 0)
            percent = int((downloaded / total) * 90)
            tasks_db[task_id]["percent"] = max(5, percent)
            tasks_db[task_id]["status"] = "downloading"
        elif d['status'] == 'finished':
            tasks_db[task_id]["percent"] = 92
            tasks_db[task_id]["status"] = "merging"

    if height_limit:
        format_rule = f"bestvideo[height<={height_limit}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={height_limit}]+bestaudio/best[height<={height_limit}]/best"
    else:
        format_rule = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"

    ydl_opts = {
        'ffmpeg_location': r'C:\ffmpeg\bin',
        'format': format_rule,
        'outtmpl': out_tmpl,
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
        'http_headers': {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            )
        }
    }

    try:
        tasks_db[task_id]["status"] = "validating"
        tasks_db[task_id]["percent"] = 5
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        matched = glob.glob(os.path.join(DOWNLOAD_DIR, f"{task_id}_*"))
        if not matched:
            tasks_db[task_id]["status"] = "error"
            tasks_db[task_id]["error"] = "File tidak ditemukan setelah konversi."
            return

        tasks_db[task_id]["file_path"] = matched[0]
        tasks_db[task_id]["percent"] = 100
        tasks_db[task_id]["status"] = "completed"

    except Exception as e:
        tasks_db[task_id]["status"] = "error"
        tasks_db[task_id]["error"] = str(e)

@app.post("/api/queue-download")
async def queue_download(payload: DownloadTaskRequest, bg: BackgroundTasks):
    task_id = payload.task_id
    if task_id not in tasks_db:
        tasks_db[task_id] = {"percent": 0, "status": "idle", "file_path": None, "error": None}
    
    bg.add_task(process_worker, task_id, payload.url, payload.height_limit or 1080)
    return {"status": "enqueued", "task_id": task_id}

@app.get("/api/file/{task_id}")
async def serve_file(task_id: str):
    task = tasks_db.get(task_id)
    if not task or not task.get("file_path") or not os.path.exists(task["file_path"]):
        raise HTTPException(status_code=404, detail="File belum siap atau sudah kedaluwarsa.")
    
    raw_name = os.path.basename(task["file_path"]).replace(f"{task_id}_", "")
    safe_name = sanitize_filename(raw_name)

    return FileResponse(
        path=task["file_path"],
        filename=safe_name,
        media_type="video/mp4"
    )