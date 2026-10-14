import { useState, useEffect, useRef } from 'react';
import {
  Menu, X, Download, Settings, HelpCircle,
  Home, Crown, Info, AlertCircle, Share2, Play,
  History, Trash2, RotateCcw
} from 'lucide-react';

const PLATFORMS = [
  { id: 'Tiktok', label: 'Tiktok', placeholder: 'Masukkan tautan video Tiktok', pattern: /tiktok\.com/i },
  { id: 'Instagram', label: 'Instagram', placeholder: 'Masukkan tautan video Instagram', pattern: /instagram\.com/i },
  { id: 'Facebook', label: 'Facebook', placeholder: 'Masukkan tautan video Facebook', pattern: /(facebook\.com|fb\.watch)/i },
  { id: 'Twitter', label: 'Twitter', placeholder: 'Masukkan tautan video Twitter', pattern: /(twitter\.com|x\.com)/i },
  { id: 'YouTube', label: 'YouTube', placeholder: 'Masukkan tautan video YouTube', pattern: /(youtube\.com|youtu\.be)/i },
  { id: 'Pinterest', label: 'Pinterest', placeholder: 'Masukkan tautan video Pinterest', pattern: /(pinterest\.com|pin\.it)/i },
];

export default function App() {
  const [activePlatform, setActivePlatform] = useState(PLATFORMS[0]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');

  // Pengaturan UI
  const [themeMode, setThemeMode] = useState('lightBlue');
  const [defaultQuality, setDefaultQuality] = useState('1080');

  const [inputUrl, setInputUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [extractedMeta, setExtractedMeta] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Status Download & Ready File
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const [completedFileUrl, setCompletedFileUrl] = useState(null);
  const pollingRef = useRef(null);

// Riwayat & Dialog Konfirmasi Duplikat (Lazy State Init dari localStorage)
  const [downloadHistory, setDownloadHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('umd_download_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);

  const saveToHistory = (meta, fileUrl) => {
    const historyItem = {
      id: meta.task_id || String(Date.now()),
      title: meta.title,
      platform: meta.platform,
      originalUrl: meta.original_url || inputUrl,
      fileUrl: fileUrl,
      downloadedAt: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    };

    setDownloadHistory((prev) => {
      // Hapus jika sudah ada URL yang sama sebelumnya, taruh yang terbaru paling atas
      const filtered = prev.filter((item) => item.originalUrl !== historyItem.originalUrl);
      const updated = [historyItem, ...filtered].slice(0, 20); // Batasi 20 riwayat terakhir
      try {
        localStorage.setItem('umd_download_history', JSON.stringify(updated));
      } catch {
        // Abaikan jika storage penuh
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setDownloadHistory([]);
    try {
      localStorage.removeItem('umd_download_history');
    } catch {
      // Abaikan
    }
  };

  // Palet Warna Sesuai Pilihan Tema
  const theme = themeMode === 'lightBlue' ? {
    bg: '#f0f7ff',
    card: '#dbeafe',
    sidebar: '#e0f2fe',
    sidebarBorder: '#bae6fd',
    btnPrimary: '#1d4ed8',
    textMain: '#0f172a',
    textMuted: '#475569',
    inputBg: '#ffffff',
    inputText: '#0f172a',
    tabInactive: '#64748b',
    border: '#bfdbfe'
  } : {
    bg: '#0b0f19',
    card: '#1e293b',
    sidebar: '#111827',
    sidebarBorder: '#334155',
    btnPrimary: '#2563eb',
    textMain: '#f8fafc',
    textMuted: '#94a3b8',
    inputBg: '#0f172a',
    inputText: '#f8fafc',
    tabInactive: '#64748b',
    border: '#334155'
  };

  const detectPlatform = (url) => {
    return PLATFORMS.find((p) => p.pattern.test(url)) || null;
  };

  // Cek apakah tautan sudah pernah diunduh
  const checkDuplicate = (url) => {
    return downloadHistory.find((item) => item.originalUrl.trim() === url.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleanUrl = text.trim();
      if (!cleanUrl) return;

      setInputUrl(cleanUrl);
      setErrorMessage('');

      const matched = detectPlatform(cleanUrl);
      if (!matched) {
        setExtractedMeta(null);
        setErrorMessage('Tautan tidak didukung! Masukkan tautan TikTok, IG, FB, Twitter, YouTube, atau Pinterest.');
        return;
      }

      setActivePlatform(matched);

      // CEK APAKAH SUDAH PERNAH DIUNDUH SEBELUMNYA
      const existing = checkDuplicate(cleanUrl);
      if (existing) {
        setDuplicatePrompt({ url: cleanUrl, platform: matched, existingItem: existing });
        return;
      }

      executeExtraction(cleanUrl, matched);
    } catch {
      setErrorMessage('Izinkan akses clipboard di browser atau tempel tautan manual.');
    }
  };

  const handleInputSubmit = () => {
    const cleanUrl = inputUrl.trim();
    if (!cleanUrl) return;

    setErrorMessage('');
    const matched = detectPlatform(cleanUrl);

    if (!matched) {
      setExtractedMeta(null);
      setErrorMessage('Format tautan tidak valid.');
      return;
    }

    if (matched.id !== activePlatform.id) {
      setActivePlatform(matched);
    }

    const existing = checkDuplicate(cleanUrl);
    if (existing) {
      setDuplicatePrompt({ url: cleanUrl, platform: matched, existingItem: existing });
      return;
    }

    executeExtraction(cleanUrl, matched);
  };

  const executeExtraction = async (url, platformObj) => {
    setIsValidating(true);
    setErrorMessage('');
    setExtractedMeta(null);
    setDownloadProgress(0);
    setDownloadStatus('idle');
    setCompletedFileUrl(null);
    setDuplicatePrompt(null);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, target_platform: platformObj.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Gagal mengekstrak media.');

      setExtractedMeta(data);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  const startDownload = async (heightLimit = null) => {
    if (!extractedMeta) return;

    const targetHeight = heightLimit || parseInt(defaultQuality);

    setDownloadStatus('downloading');
    setDownloadProgress(5);
    setErrorMessage('');

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/progress/${extractedMeta.task_id}`);
        const data = await res.json();
        if (data) {
          setDownloadProgress(data.percent || 5);
          if (data.status === 'merging') setDownloadStatus('merging');
          if (data.status === 'completed') {
            clearInterval(pollingRef.current);
            setDownloadProgress(100);
            setDownloadStatus('completed');
            
            const fileUrl = `http://127.0.0.1:8000/api/file/${extractedMeta.task_id}`;
            setCompletedFileUrl(fileUrl);
            saveToHistory(extractedMeta, fileUrl);

            // Buka unduhan langsung
            window.location.href = fileUrl;
          } else if (data.status === 'error') {
            clearInterval(pollingRef.current);
            setDownloadStatus('error');
            setErrorMessage(data.error || 'Gagal memproses unduhan.');
          }
        }
      } catch {
        // Abaikan error jaringan sementara
      }
    }, 700);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/queue-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: extractedMeta.original_url,
          task_id: extractedMeta.task_id,
          height_limit: targetHeight
        })
      });
      if (!res.ok) throw new Error('Gagal mendaftarkan antrean proses ke server.');
    } catch (err) {
      clearInterval(pollingRef.current);
      setDownloadStatus('error');
      setErrorMessage(err.message);
    }
  };

  // Fitur Bagikan Video
  const handleShare = async (title, url) => {
    const shareData = {
      title: title || 'Unduhan Video UMD',
      text: `Tonton/unduh video: ${title || 'Universal Media Downloader'}`,
      url: url || window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Pengguna membatalkan dialog share
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        alert('Tautan berhasil disalin ke papan klip untuk dibagikan!');
      } catch {
        alert('Tidak dapat membagikan tautan secara otomatis.');
      }
    }
  };

  // Fitur Play Video (Membuka via player bawaan perangkat / native player tab)
  const handlePlayVideo = (fileUrl) => {
    if (!fileUrl) return;
    window.open(fileUrl, '_blank');
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div style={{ backgroundColor: theme.bg, color: theme.textMain, minHeight: '100vh', width: '100%' }} className="flex flex-col justify-between transition-colors duration-300">
      
      {/* DRAWER OVERLAY */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)} 
          className="fixed inset-0 bg-black/50 z-40 transition-opacity" 
        />
      )}

      {/* DRAWER MENU */}
      <aside 
        style={{ backgroundColor: theme.sidebar, borderColor: theme.sidebarBorder }}
        className={`fixed top-0 left-0 h-full w-[280px] border-r z-50 transform transition-transform duration-300 ease-in-out flex flex-col justify-between shadow-2xl ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6">
          <div style={{ borderColor: theme.sidebarBorder }} className="flex items-center justify-between pb-5 border-b">
            <div>
              <h2 style={{ color: theme.btnPrimary }} className="text-xl font-bold tracking-tight">UMD</h2>
              <p style={{ color: theme.textMuted }} className="text-[10px] font-semibold leading-tight mt-0.5">
                Universal Media Downloader
              </p>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="p-2 rounded-xl text-slate-400 hover:opacity-80 transition"
              aria-label="Tutup Menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="mt-6 space-y-2">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'history', label: 'Riwayat Unduhan', icon: History },
              { id: 'premium', label: 'Premium', icon: Crown },
              { id: 'about', label: 'About', icon: Info },
              { id: 'setting', label: 'Setting', icon: Settings },
            ].map((menu) => {
              const Icon = menu.icon;
              const isActive = currentView === menu.id;
              return (
                <button
                  key={menu.id}
                  onClick={() => { setCurrentView(menu.id); setSidebarOpen(false); }}
                  style={{
                    backgroundColor: isActive ? theme.btnPrimary : 'transparent',
                    color: isActive ? '#ffffff' : theme.textMain
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-base font-semibold transition"
                >
                  <Icon className="w-5 h-5" />
                  {menu.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div style={{ borderColor: theme.sidebarBorder, color: theme.textMuted }} className="p-5 text-center text-xs border-t">
          UMD • All-in-One HD Media
        </div>
      </aside>

      {/* TOP HEADER */}
      <header className="w-full max-w-md mx-auto pt-6 px-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-xl hover:opacity-80 transition active:scale-95"
            aria-label="Buka Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div 
            onClick={() => setCurrentView('home')} 
            className="flex flex-col cursor-pointer select-none active:scale-95 transition-transform"
            title="Kembali ke Beranda"
          >
            <h1 className="text-2xl font-bold tracking-tight">UMD</h1>
            <span style={{ color: theme.textMuted }} className="text-[10px] font-medium leading-none -mt-0.5">
              Universal Media Downloader
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentView('history')}
            title="Riwayat Unduhan"
            className="hover:opacity-80 transition"
          >
            <History className="w-6 h-6" />
          </button>
          <button onClick={() => setCurrentView('setting')} title="Pengaturan">
            <Settings className="w-6 h-6" />
          </button>
          <button onClick={() => setCurrentView('about')} title="Tentang">
            <HelpCircle className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full max-w-md mx-auto px-5 py-2 flex-1 flex flex-col justify-start space-y-5">
        
        {/* VIEW: HOME */}
        {currentView === 'home' && (
          <>
            <div className="w-full">
              {/* PLATFORM TABS */}
              <div 
                 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                 className="flex overflow-x-auto no-scrollbar scroll-smooth pl-2 gap-1.5 pb-0 [&::-webkit-scrollbar]:hidden"
                  >
                {PLATFORMS.map((plat) => {
                  const isSelected = activePlatform.id === plat.id;
                  return (
                    <button
                      key={plat.id}
                      onClick={() => {
                        setActivePlatform(plat);
                        setInputUrl('');
                        setExtractedMeta(null);
                        setErrorMessage('');
                        setDuplicatePrompt(null);
                      }}
                      style={{
                        backgroundColor: isSelected ? theme.card : 'transparent',
                        color: isSelected ? theme.textMain : theme.tabInactive
                      }}
                      className="px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all whitespace-nowrap"
                    >
                      {plat.label}
                    </button>
                  );
                })}
              </div>

              {/* CARD INPUT CONTAINER */}
              <div 
                style={{ backgroundColor: theme.card, borderRadius: '1rem', borderTopLeftRadius: 0 }} 
                className="p-5 shadow-xs space-y-4"
              >
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                  placeholder={activePlatform.placeholder}
                  style={{ backgroundColor: theme.inputBg, color: theme.inputText }}
                  className="w-full h-14 rounded-xl px-4 text-sm placeholder-slate-400 outline-none shadow-xs border border-transparent transition"
                />

                <button
                  onClick={handlePaste}
                  disabled={isValidating}
                  style={{ backgroundColor: theme.btnPrimary }}
                  className="w-full h-13 hover:opacity-90 active:scale-[0.99] text-white font-bold text-base rounded-xl flex items-center justify-center transition shadow-md disabled:opacity-60"
                >
                  {isValidating ? 'Memeriksa...' : 'Tempel'}
                </button>
              </div>
            </div>

            {/* DIALOG KONFIRMASI DUPLIKASI LINK */}
            {duplicatePrompt && (
              <div style={{ backgroundColor: theme.card }} className="p-4 rounded-2xl border border-amber-300 shadow-md space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Tautan Pernah Diunduh</h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Video ini sudah ada di riwayat lokal ({duplicatePrompt.existingItem.title}). Tetap proses unduh ulang?
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      // Langsung putar file yang sudah ada jika tersedia
                      handlePlayVideo(duplicatePrompt.existingItem.fileUrl);
                      setDuplicatePrompt(null);
                    }}
                    style={{ backgroundColor: theme.inputBg }}
                    className="flex-1 py-2 px-3 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 flex items-center justify-center gap-1.5 hover:bg-slate-100 transition"
                  >
                    <Play className="w-3.5 h-3.5" /> Putar yang Ada
                  </button>

                  <button
                    onClick={() => {
                      executeExtraction(duplicatePrompt.url, duplicatePrompt.platform);
                    }}
                    style={{ backgroundColor: theme.btnPrimary }}
                    className="flex-1 py-2 px-3 text-xs font-bold text-white rounded-xl shadow-xs hover:opacity-90 transition flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Unduh Ulang
                  </button>
                </div>
              </div>
            )}

            {/* NOTIFIKASI ERROR */}
            {errorMessage && (
              <div className="p-3.5 bg-red-100 border border-red-300 rounded-xl text-xs text-red-700 flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* CARD HASIL EKSTRAKSI */}
            {extractedMeta ? (
              <div style={{ backgroundColor: theme.card }} className="p-5 rounded-2xl shadow-xs space-y-4 transition-all">
                <div className="space-y-2">
                  <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold text-white bg-gradient-to-r from-pink-500 to-rose-500 shadow-xs">
                    {extractedMeta.platform}
                  </span>
                  <p className="text-sm font-semibold leading-snug line-clamp-3">
                    {extractedMeta.title}
                  </p>
                </div>

                {downloadStatus !== 'idle' && (
                  <div style={{ backgroundColor: theme.inputBg }} className="p-3.5 rounded-xl space-y-2 border border-black/5">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>
                        {downloadStatus === 'downloading' && 'Mengunduh stream media...'}
                        {downloadStatus === 'merging' && 'Menggabungkan Audio & Video...'}
                        {downloadStatus === 'completed' && 'Selesai! File tersimpan.'}
                        {downloadStatus === 'error' && 'Gagal'}
                      </span>
                      <span style={{ color: theme.btnPrimary }}>{downloadProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200/50 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${downloadProgress}%`, backgroundColor: theme.btnPrimary }}
                        className="h-full transition-all duration-300 rounded-full"
                      />
                    </div>
                  </div>
                )}

                {/* TOMBOL AKSI SETELAH SELESAI: PLAY & SHARE */}
                {downloadStatus === 'completed' && completedFileUrl && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handlePlayVideo(completedFileUrl)}
                      className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      <Play className="w-4 h-4" />
                      <span>Putar Video</span>
                    </button>

                    <button
                      onClick={() => handleShare(extractedMeta.title, completedFileUrl)}
                      style={{ backgroundColor: theme.btnPrimary }}
                      className="h-12 px-5 hover:opacity-90 active:scale-[0.99] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Bagikan</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => startDownload(480)}
                  disabled={downloadStatus === 'downloading' || downloadStatus === 'merging'}
                  style={{ backgroundColor: theme.btnPrimary }}
                  className="w-full h-13 hover:opacity-90 active:scale-[0.99] text-white font-bold text-base rounded-xl flex items-center justify-center transition shadow-md disabled:opacity-60"
                >
                  Unduh video (SD)
                </button>

                <button
                  onClick={() => startDownload(1080)}
                  disabled={downloadStatus === 'downloading' || downloadStatus === 'merging'}
                  style={{ backgroundColor: theme.btnPrimary }}
                  className="w-full h-13 hover:opacity-90 active:scale-[0.99] text-white font-bold text-base rounded-xl flex items-center justify-center transition shadow-md disabled:opacity-60"
                >
                  Unduh video HD
                </button>
              </div>
            ) : (
              /* CARD PANDUAN PENGGUNAAN */
              <div style={{ backgroundColor: theme.card }} className="rounded-2xl p-6 shadow-xs text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-rose-400 rounded-3xl mx-auto flex items-center justify-center shadow-lg text-white">
                  <Download className="w-8 h-8" />
                </div>
                <h2 className="font-bold text-base">Bagaimana cara mengunduh video?</h2>
                <div style={{ color: theme.textMuted }} className="text-left space-y-3.5 text-xs font-medium pt-2">
                  <div className="flex items-center gap-3">
                    <span style={{ backgroundColor: theme.btnPrimary }} className="w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <p>Buka akun media sosial Anda</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ backgroundColor: theme.btnPrimary }} className="w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <p>Salin tautan video yang ingin Anda unduh</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ backgroundColor: theme.btnPrimary }} className="w-6 h-6 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <p>Buka UMD dan ketuk tombol Tempel</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* VIEW: RIWAYAT UNDUHAN (DOWNLOAD HISTORY) */}
        {currentView === 'history' && (
          <div style={{ backgroundColor: theme.card }} className="rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/10">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold">Riwayat Unduhan ({downloadHistory.length})</h2>
              </div>
              {downloadHistory.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Bersihkan
                </button>
              )}
            </div>

            {downloadHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 space-y-2">
                <p>Belum ada media yang diunduh.</p>
                <button 
                  onClick={() => setCurrentView('home')} 
                  style={{ color: theme.btnPrimary }} 
                  className="underline font-bold"
                >
                  Mulai unduh video sekarang
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {downloadHistory.map((item) => (
                  <div 
                    key={item.id}
                    style={{ backgroundColor: theme.inputBg }}
                    className="p-3.5 rounded-xl shadow-xs border border-black/5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {item.platform}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 line-clamp-2 mt-1">
                          {item.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {item.downloadedAt}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => handlePlayVideo(item.fileUrl)}
                        className="flex-1 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                      >
                        <Play className="w-3.5 h-3.5" /> Putar
                      </button>

                      <a
                        href={item.fileUrl}
                        download
                        style={{ backgroundColor: theme.btnPrimary }}
                        className="flex-1 py-2 text-xs font-semibold text-white rounded-lg flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" /> Unduh Lagi
                      </a>

                      <button
                        onClick={() => handleShare(item.title, item.fileUrl)}
                        className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        title="Bagikan Tautan"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={() => setCurrentView('home')} 
              style={{ color: theme.btnPrimary }}
              className="text-xs font-bold underline inline-block pt-1"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

        {/* VIEW: SETTING */}
        {currentView === 'setting' && (
          <div style={{ backgroundColor: theme.card }} className="rounded-2xl p-6 space-y-5 shadow-xs text-sm">
            <h2 className="text-base font-bold">Pengaturan</h2>

            <div style={{ borderColor: theme.border }} className="space-y-2 py-2 border-b">
              <label style={{ color: theme.textMuted }} className="text-xs font-semibold block">
                Tema Tampilan
              </label>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value)}
                style={{ backgroundColor: theme.inputBg, color: theme.inputText, borderColor: theme.border }}
                className="w-full h-11 px-3 text-xs rounded-xl border outline-none font-medium"
              >
                <option value="lightBlue">Default</option>
                <option value="dark">Gelap</option>
              </select>
            </div>

            <div style={{ borderColor: theme.border }} className="space-y-2 py-2 border-b">
              <label style={{ color: theme.textMuted }} className="text-xs font-semibold block">
                Kualitas Unduhan Default
              </label>
              <select
                value={defaultQuality}
                onChange={(e) => setDefaultQuality(e.target.value)}
                style={{ backgroundColor: theme.inputBg, color: theme.inputText, borderColor: theme.border }}
                className="w-full h-11 px-3 text-xs rounded-xl border outline-none font-medium"
              >
                <option value="480">Rendah (480p)</option>
                <option value="720">Menengah (720p)</option>
                <option value="1080">Tinggi (1080p)</option>
                <option value="2160">Ekstrem (2k-4k jika ada, fallback 1080p)</option>
              </select>
            </div>

            <button 
              onClick={() => setCurrentView('home')} 
              style={{ color: theme.btnPrimary }}
              className="text-xs font-bold underline inline-block pt-2"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

        {/* VIEW: PREMIUM */}
        {currentView === 'premium' && (
          <div style={{ backgroundColor: theme.card }} className="rounded-2xl p-6 text-center space-y-4 shadow-xs">
            <Crown className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold">UMD VIP Premium</h2>
            <p style={{ color: theme.textMuted }} className="text-xs leading-relaxed">
              Dukungan server prioritas berkecepatan penuh dan pengunduhan resolusi tinggi tanpa batas harian.
            </p>
            <button 
              onClick={() => setCurrentView('home')} 
              style={{ backgroundColor: theme.btnPrimary }}
              className="w-full h-12 rounded-xl text-white font-bold text-sm transition"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

        {/* VIEW: ABOUT */}
        {currentView === 'about' && (
          <div style={{ backgroundColor: theme.card }} className="rounded-2xl p-6 space-y-3 text-xs shadow-xs">
            <h2 className="text-base font-bold">Tentang UMD</h2>
            <p style={{ color: theme.textMuted }} className="leading-relaxed text-sm">
              Universal Media Downloader (UMD) adalah aplikasi pengunduh media lintas platform (TikTok, Instagram, Facebook, Twitter, YouTube, Pinterest) dengan sistem deteksi tautan otomatis dan pemrosesan audio-video resolusi tinggi.
            </p>
            <button 
              onClick={() => setCurrentView('home')} 
              style={{ color: theme.btnPrimary }}
              className="text-sm underline font-bold mt-3 inline-block"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer style={{ color: theme.textMuted }} className="text-center py-4 text-xs">
        Universal Media Downloader (UMD) • All-in-One HD Media Downloader
      </footer>
    </div>
  );
}