import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  MessageSquare, 
  Volume2, 
  Sparkles, 
  Coins, 
  Eye, 
  ShieldCheck, 
  Mic, 
  Send, 
  HelpCircle,
  RefreshCw,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { processVision, cleanChatSemantics, OperationMode } from "./services/geminiService";
import { speakText, triggerHaptic } from "./services/ttsService";

// Chat message format for Bridge mode
interface ChatMessage {
  id: string;
  sender: "netra" | "wicara_rungu";
  originalText: string;
  cleanedText?: string;
  timestamp: string;
  isCleaning?: boolean;
}

// Simulated demo currency bills for easier browser demonstration
const DEMO_CURRENCY_PRESETS = [
  { name: "Rp 100.000", value: "Rp 100.000 (Seratus Ribu Rupiah)", image: "https://images.unsplash.com/photo-1621259182978-f09e5e2b07ae?auto=format&fit=crop&w=400&q=80" },
  { name: "Rp 50.000", value: "Rp 50.000 (Lima Puluh Ribu Rupiah)", image: "https://images.unsplash.com/photo-1589758438368-0ad531db3366?auto=format&fit=crop&w=400&q=80" },
  { name: "Rp 20.000", value: "Rp 20.000 (Dua Puluh Ribu Rupiah)", image: "https://images.unsplash.com/photo-1602525663765-48358ef922d9?auto=format&fit=crop&w=400&q=80" }
];

export default function App() {
  // Navigation tabs: 'vision' | 'bridge' | 'guide'
  const [activeTab, setActiveTab] = useState<"vision" | "bridge" | "guide">("vision");

  // Vision variables
  const [visionMode, setVisionMode] = useState<OperationMode>(OperationMode.CURRENCY_READER);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<string>("");
  const [isProcessingVision, setIsProcessingVision] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [flashOn, setFlashOn] = useState<boolean>(false);

  // References for camera capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Bridge variables
  const [bridgeMode, setBridgeMode] = useState<"netra-wicara" | "netra-rungu">("netra-wicara");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "netra",
      originalText: "Halo, saya tuna netra. Apa kamu bisa membantu saya?",
      timestamp: "07:50"
    },
    {
      id: "welcome-2",
      sender: "wicara_rungu",
      originalText: "Bisa, senang bertemu kamu. Aku disini siap membantu mengobrol.",
      timestamp: "07:51"
    }
  ]);
  const [typeInput, setTypeInput] = useState<string>("");
  const [cleanInRealTime, setCleanInRealTime] = useState<boolean>(true);
  
  // Custom Speech-to-Text State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sttStatus, setSttStatus] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  // Auto scroll reference for chat
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Speak initial tab guide on mount & switches to improve accessibility
  useEffect(() => {
    // Speak welcoming voice indicators when switching tabs
    let introText = "";
    if (activeTab === "vision") {
      introText = "Mode penglihatan aktif. Ketuk tombol di layar untuk membaca uang kertas atau koin.";
    } else if (activeTab === "bridge") {
      introText = "Mode jembatan komunikasi aktif. Sediakan layar bagi satu penyandang rungu wicara dan penyandang netra.";
    } else if (activeTab === "guide") {
      introText = "Mode panduan pengguna aktif. Pelajari cara menggunakan aplikasi helfen secara ramah suara.";
    }
    speakText(introText);
  }, [activeTab]);

  // Auto-scroll chat window
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "id-ID"; // Set to Indonesian

      rec.onstart = () => {
        setIsRecording(true);
        setSttStatus("Sedang merekam suaramu...");
        triggerHaptic();
      };

      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          triggerHaptic();
          addNewMessage("netra", transcript);
          // Let mute/deaf user know what was said visually
          speakText(`Suara terekam: ${transcript}`);
        }
      };

      rec.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setSttStatus("Koneksi gagal atau tidak ada suara.");
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
        setSttStatus("");
      };

      recognitionRef.current = rec;
    }
  }, []);

  // --- CAMERA LOGIC ---
  const startCamera = async (mode = facingMode) => {
    triggerHaptic();
    try {
      setCapturedImage(null);
      setVisionResult("");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      speakText(mode === "environment" ? "Kamera belakang berhasil diaktifkan. Arahkan pada objek atau uang." : "Kamera depan berhasil diaktifkan.");
    } catch (err) {
      console.warn("Camera streaming not supported or blocked in this environment.", err);
      // Activate demo mode fallback
      setCameraActive(false);
      speakText("Akses kamera tidak aktif di peramban ini. Mengaktifkan Mode Demo Interaktif.");
    }
  };

  const toggleFacingMode = () => {
    triggerHaptic();
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);
    if (cameraActive) {
      startCamera(newMode);
    } else {
      speakText(newMode === "environment" ? "Beralih ke Kamera Belakang" : "Beralih ke Kamera Depan");
    }
  };

  const toggleFlash = async () => {
    triggerHaptic();
    const newFlash = !flashOn;
    setFlashOn(newFlash);
    speakText(newFlash ? "Lampu kilat menyala." : "Lampu kilat mati.");
    
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities() as any;
          if (capabilities && capabilities.torch) {
            await videoTrack.applyConstraints({
              advanced: [{ torch: newFlash } as any]
            });
          } else {
            console.warn("Torch constraint not supported on this track.");
          }
        } catch (e) {
          console.warn("Failed to apply torch constraints", e);
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setFlashOn(false);
  };

  const handleCapture = () => {
    triggerHaptic();
    if (!cameraActive) {
      // Trigger random mock detection
      handleSimulatedCapture(
        "Kombinasi Koin Rp 500 dan Uang kertas warna biru Rp 50.000 di atas meja kayu."
      );
      return;
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setCapturedImage(dataUrl);
        stopCamera();
        analyzeVisionImage(dataUrl);
      }
    }
  };

  const handleSimulatedCapture = (description: string) => {
    triggerHaptic();
    // Use an elegant, high contrast placeholder
    setCapturedImage("https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=400&q=80");
    analyzeVisionImage(description, true);
  };

  const analyzeVisionImage = async (imageSource: string, isDemo: boolean = false) => {
    setIsProcessingVision(true);
    setVisionResult("Menghubungi AI Asisten untuk melihat...");
    speakText("Sedang memproses gambar dengan kecerdasan Buatan...");

    try {
      if (isDemo) {
        // Run simulated detection parsing or actual request
        setTimeout(async () => {
          let outputText = "";
          if (visionMode === OperationMode.CURRENCY_READER) {
            outputText = "Uang kertas Rp 50.000 Rupiah terbaca dengan jelas. Kondisi uang sedikit kusut di pojok kanan bawah.";
          } else if (visionMode === OperationMode.TEXT_READER) {
            outputText = "Teks terbaca: 'PRODUK MINUMAN 250ML - SIMPAN DI SEJUK'.";
          } else {
            outputText = `AI mendeteksi objek: ${imageSource}`;
          }
          setVisionResult(outputText);
          setIsProcessingVision(false);
          speakText(outputText);
        }, 1500);
      } else {
        const response = await processVision(imageSource, visionMode);
        setVisionResult(response);
        setIsProcessingVision(false);
        speakText(response);
      }
    } catch (e) {
      console.error(e);
      const errTxt = "Maaf, sistem vision gagal memproses gambar saat ini.";
      setVisionResult(errTxt);
      setIsProcessingVision(false);
      speakText(errTxt);
    }
  };

  // --- SPEECH RECOGNITION (STT) BRIDGE ---
  const startRecording = () => {
    triggerHaptic();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn("Recognition already active", e);
      }
    } else {
      speakText("Perekam suara tidak didukung di peramban ini. Mengaktifkan demo ketikan.");
      // Simulated voice typing
      const mockCaptures = [
        "Minta tolong ambilkan segelas air",
        "Di mana pintu keluar terdekat?",
        "Berapa harga buah mangga ini?",
        "Terima kasih atas bantuanmu",
      ];
      const randomText = mockCaptures[Math.floor(Math.random() * mockCaptures.length)];
      setTimeout(() => {
        addNewMessage("netra", randomText + " (Suara Terbaca)");
        speakText(`Suara simulasi: ${randomText}`);
      }, 1000);
    }
  };

  const stopRecording = () => {
    triggerHaptic();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // --- CHAT LOGIC ---
  const addNewMessage = (sender: "netra" | "wicara_rungu", text: string) => {
    const newMessage: ChatMessage = {
      id: Math.random().toString(),
      sender,
      originalText: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, newMessage]);
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeInput.trim()) return;

    triggerHaptic();
    const rawText = typeInput;
    setTypeInput("");

    // Create unique ID for reference
    const msgId = Math.random().toString();
    const timestampStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Insert message into screen
    const userMsg: ChatMessage = {
      id: msgId,
      sender: "wicara_rungu",
      originalText: rawText,
      timestamp: timestampStr,
      isCleaning: cleanInRealTime,
    };

    setChatMessages((prev) => [...prev, userMsg]);

    if (cleanInRealTime) {
      try {
        // Run Semantic Cleaning via Gemini
        const cleaned = await cleanChatSemantics(rawText);
        
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? { ...msg, cleanedText: cleaned, isCleaning: false }
              : msg
          )
        );

        // Immediate speak natural sounding cleaned text to Blind User
        speakText(cleaned);
      } catch (err) {
        console.error(err);
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId ? { ...msg, isCleaning: false } : msg
          )
        );
        speakText(rawText);
      }
    } else {
      // Just speak original text directly
      speakText(rawText);
    }
  };

  const handleDemoPresetSelect = (presetText: string) => {
    setTypeInput(presetText);
    triggerHaptic();
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-black text-white border-x border-neutral-900 font-sans relative">
      
      {/* APP HEADER - PREMIUM GLASS MORPHISM */}
      <header className="bg-black/60 backdrop-blur-md border-b border-white/10 px-5 py-4 sticky top-0 z-40">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="font-sans font-bold text-2xl tracking-widest text-white select-none">
              HELFEN
            </h1>
            <p className="text-[9px] text-[#0A84FF] tracking-wider font-semibold uppercase mt-0.5 select-none">
              ASISTEN VISIONER
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                triggerHaptic();
                speakText("Ulangi petunjuk pembuka.");
              }}
              className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-full transition-colors border border-white/5"
              title="Voice Assist"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] text-emerald-400 font-mono font-bold tracking-wider">AKTIF</span>
            </div>
          </div>
        </div>
      </header>

      {/* CORE DISPLAY (MAIN VIEWPORT WITH SCROLLING/FLEX AREA) */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: VISION SCANNER */}
          {activeTab === "vision" && (
            <motion.div
              key="vision"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="p-5 flex flex-col gap-5"
              id="view-vision"
            >
              {/* Premium Glassmorphic Welcome Card */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-neutral-400">
                    KECERDASAN BUATAN KAMERA
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  Mendeteksi Uang & Objek dengan Suara
                </h2>
                <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                  Cukup arahkan lensa ke uang kartal atau lingkungan sekitar kamu.
                  Sistem akan menganalisis objek dan langsung menyuarakan deskripsinya secara otomatis.
                </p>
              </div>

              {/* Eye Viewport Stream - Dominant Camera Area */}
              <div className="relative bg-black rounded-3xl aspect-[4/3] overflow-hidden border border-white/10 flex flex-col items-center justify-center shadow-2xl">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
                  />
                ) : capturedImage ? (
                  <img
                    src={capturedImage}
                    referrerPolicy="no-referrer"
                    alt="Captured Scene"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-6 text-center text-neutral-400 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-[#0A84FF]">
                      <Camera className="w-7 h-7" />
                    </div>
                    <p className="text-sm font-medium text-neutral-300">Preview Kamera Siap</p>
                    <p className="text-[10px] text-neutral-500 mt-1.5 max-w-[240px]">
                      Tekan tombol "KETUK & LIHAT" di bawah untuk mengaktifkan pemindai instan.
                    </p>
                  </div>
                )}

                {/* Floating controls inside/above the camera preview area */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <div className="bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10">
                    <span className="text-[9px] font-mono tracking-widest text-[#0A84FF] font-bold">
                      {cameraActive ? "LIVE FEED" : "STANDBY"}
                    </span>
                  </div>
                </div>

                {/* Ganti Kamera dan Tombol Flash Floating Controls */}
                <div className="absolute top-3 right-3 flex items-center bg-black/50 backdrop-blur-md rounded-full p-0.5 border border-white/10 shadow-lg">
                  <button
                    onClick={toggleFacingMode}
                    className="p-2 text-white/95 hover:text-[#0A84FF] hover:bg-white/5 rounded-full transition-all flex items-center gap-1"
                    title="Ganti ke Kamera Depan / Belakang"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-[9px] font-bold font-mono tracking-wider uppercase pr-1">
                      {facingMode === "environment" ? "BELAKANG" : "DEPAN"}
                    </span>
                  </button>

                  <div className="w-px h-4.5 bg-white/20 self-center" />

                  <button
                    onClick={toggleFlash}
                    className={`p-2 rounded-full transition-all flex items-center gap-1 ${
                      flashOn ? "text-amber-400 bg-white/5" : "text-white/70 hover:text-[#0A84FF] hover:bg-white/5"
                    }`}
                    title="Nyalakan / Matikan Flash (Lampu Senter)"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="text-[9px] font-bold font-mono tracking-wider uppercase pr-1">
                      {flashOn ? "FLASH ON" : "FLASH OFF"}
                    </span>
                  </button>
                </div>

                {isProcessingVision && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center">
                    <div className="text-center">
                      <div className="relative flex items-center justify-center mx-auto mb-3">
                        <div className="absolute w-12 h-12 rounded-full border-2 border-dashed border-[#0A84FF] animate-spin"></div>
                        <RefreshCw className="w-5 h-5 text-[#0A84FF]" />
                      </div>
                      <p className="text-xs text-white font-medium tracking-tight">Menelaah Gambar via Gemini AI...</p>
                      <p className="text-[10px] text-neutral-400 mt-1">Mengonversi ke Suara Ramah...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Shutter Button Section - Satu tombol bulat besar yang sangat elegan dengan teks tebal "KETUK & LIHAT" */}
              <div className="flex flex-col items-center justify-center my-2 gap-2.5">
                <button
                  onClick={() => {
                    if (!cameraActive && !capturedImage) {
                      startCamera();
                    } else {
                      handleCapture();
                    }
                  }}
                  className={`w-22 h-22 rounded-full bg-white flex flex-col items-center justify-center transition-all shadow-2xl relative group ${
                    isProcessingVision ? "opacity-50 pointer-events-none" : "hover:scale-105 active:scale-95"
                  }`}
                  style={{
                    boxShadow: "0 0 25px rgba(10, 132, 255, 0.25)"
                  }}
                >
                  <div className="w-18 h-18 rounded-full border-2 border-neutral-200 flex items-center justify-center bg-white group-hover:border-[#0A84FF] transition-colors">
                    <Camera className="w-8 h-8 text-black" />
                  </div>
                </button>
                <button 
                  onClick={() => {
                    if (!cameraActive && !capturedImage) {
                      startCamera();
                    } else {
                      handleCapture();
                    }
                  }}
                  className="font-sans font-bold text-sm tracking-widest text-[#0A84FF] uppercase select-none hover:opacity-80 transition-opacity"
                >
                  KETUK & LIHAT
                </button>
              </div>

              {/* Clean camera feed reset in case captured */}
              {capturedImage && (
                <button
                  onClick={() => startCamera()}
                  className="mx-auto text-xs text-neutral-405 hover:text-white flex items-center gap-1.5 py-1.5 bg-white/5 px-4 rounded-full border border-white/5 transition-all w-fit"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Ulangi Pemindaian Kamera
                </button>
              )}

              {/* Sandbox Demo Presets inside a gorgeous glassmorphic wrapper */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-neutral-400">
                    PRESET DEMO INTERAKTIF
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mb-2.5 leading-relaxed">
                  Tidak ada akses kamera? Ketuk tombol demo di bawah untuk mensimulasikan pembacaan uang dan langsung mendengarkan keluaran suara TTS otomatis:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {DEMO_CURRENCY_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setVisionMode(OperationMode.CURRENCY_READER);
                        handleSimulatedCapture(p.value);
                      }}
                      className="text-center px-2 py-3 bg-white/5 hover:bg-white/10 hover:border-[#0A84FF]/45 transition-all text-white rounded-xl border border-white/10 text-xs font-semibold flex flex-col justify-between items-center gap-2"
                    >
                      <span className="text-[#0A84FF]">{p.name}</span>
                      <span className="text-[9px] text-neutral-400">Simulasikan</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vision Scanner Output Interface - Elegant Glass Voice banner */}
              {visionResult && (
                <div className="bg-[#0A84FF]/20 border border-[#0A84FF]/40 rounded-2xl p-4 shadow-xl">
                  <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-white/10">
                    <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-[#0A84FF]">
                      HASIL ANALISIS ASISTEN VISION
                    </span>
                    <button
                      onClick={() => {
                        triggerHaptic();
                        speakText(visionResult);
                      }}
                      className="p-1 px-2.5 bg-[#0A84FF] hover:bg-blue-600 rounded-md text-white text-[10px] font-bold flex items-center gap-1.5 transition-colors"
                      title="Ulangi Suara"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> SUARAKAN
                    </button>
                  </div>
                  <p className="text-base font-bold text-white leading-relaxed">{visionResult}</p>
                </div>
              )}

              {/* Hidden Canvas helper */}
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {/* TAB 2: THE BRIDGE COMMUNICATION MODULE (NEW FEATURE) */}
          {activeTab === "bridge" && (
            <motion.div
              key="bridge"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full bg-black"
              id="view-bridge"
            >
              {/* Bridge Header Configuration */}
              <div className="bg-neutral-950 border-b border-white/10 px-5 py-4 flex flex-col gap-3">
                <div className="flex justify-between items-center bg-white/5 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setBridgeMode("netra-wicara");
                      speakText("Mode Tuna Netra dengan Wicara diaktifkan.");
                    }}
                    className={`flex-1 text-center py-2.5 text-xs font-bold transition-all rounded-lg ${
                      bridgeMode === "netra-wicara"
                        ? "bg-[#0A84FF] text-white shadow-lg"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    🗣️ Netra & Mute
                  </button>

                  <button
                    onClick={() => {
                      triggerHaptic();
                      setBridgeMode("netra-rungu");
                      speakText("Mode Tuna Netra dengan Rungu diaktifkan.");
                    }}
                    className={`flex-1 text-center py-2.5 text-xs font-bold transition-all rounded-lg ${
                      bridgeMode === "netra-rungu"
                        ? "bg-[#0A84FF] text-white shadow-lg"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    👂 Netra & Tuli
                  </button>
                </div>

                {/* Subtitle indicator explaining roles */}
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                  <Info className="w-4 h-4 text-[#0A84FF] flex-shrink-0" />
                  <span>
                    {bridgeMode === "netra-wicara"
                      ? "Netra menggunakan STT Suara, Wicara membalas dengan ketikan Teks."
                      : "Netra menggunakan STT Suara, Rungu membalas dengan Teks terjemah Suara."}
                  </span>
                </div>
              </div>

              {/* Chat Bubble Interface (iMessage Style) */}
              <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 bg-black">
                
                {chatMessages.map((msg) => {
                  const isNetra = msg.sender === "netra";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isNetra ? "items-start" : "items-end"} w-full`}
                    >
                      {/* Sub-label describing user types */}
                      <span className="text-[9px] text-neutral-500 font-mono tracking-widest uppercase mb-1 px-1">
                        {isNetra ? "👤 TUNA NETRA (SUARA)" : "👤 TUNARUNGU/WICARA (TEKS)"}
                      </span>

                      {/* Chat Bubbles: Large, tracking tight, high contrast to assist visually impaired people */}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm font-sans select-text ${
                          isNetra
                            ? "bubble-ios-blue text-white font-bold text-lg leading-tight tracking-tight shadow-md"
                            : "bubble-ios-gray text-white font-semibold text-base leading-snug"
                        }`}
                      >
                        {/* Render original or cleaned based on status */}
                        <p>{msg.cleanedText || msg.originalText}</p>

                        {/* If text is currently cleaning via Gemini AI */}
                        {msg.isCleaning && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-white/85">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span className="font-mono text-[9px] uppercase tracking-wider">
                              YANG TERDENGAR DI AI (Cleaning)
                            </span>
                          </div>
                        )}

                        {/* Render semantic difference if polished */}
                        {msg.cleanedText && msg.originalText !== msg.cleanedText && (
                          <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[11px] font-mono select-none flex items-center gap-1 opacity-70">
                            <span className="font-bold">Asli:</span>
                            <span className="italic">{msg.originalText}</span>
                          </div>
                        )}
                      </div>

                      {/* Info bubble helper triggers */}
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[9px] text-neutral-500 font-mono">{msg.timestamp}</span>
                        {!isNetra && (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              speakText(msg.cleanedText || msg.originalText);
                            }}
                            className="text-[10px] text-[#0A84FF] hover:underline font-bold flex items-center gap-1"
                          >
                            <Volume2 className="w-3 h-3" /> Bunyikan Suara
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Hold to speak current active indicator info box */}
                {isRecording && (
                  <div className="bg-[#0A84FF]/10 border border-[#0A84FF]/30 text-[#0A84FF] rounded-xl p-3.5 text-center flex items-center justify-center gap-2.5 animate-pulse">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                    <p className="text-xs font-bold font-mono uppercase tracking-wider">
                      {sttStatus || "Mendengarkan ucapan tuna netra..."}
                    </p>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Area (Dual inputs for Blind Hold & Deaf typing) */}
              <div className="bg-neutral-950 border-t border-white/10 p-4 flex flex-col gap-3 sticky bottom-0 z-20">
                
                {/* Grammar Polish AI Helper toggle (Realtime Semantic Cleaner via Gemini) */}
                <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-neutral-400">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>Merapikan Tata Bahasa (Gemini AI)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cleanInRealTime}
                      onChange={(e) => {
                        triggerHaptic();
                        setCleanInRealTime(e.target.checked);
                        speakText(
                          e.target.checked
                             ? "Saringan bahasa Gemini diaktifkan"
                            : "Saringan bahasa dinonaktifkan"
                        );
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0A84FF]"></div>
                  </label>
                </div>

                {/* Quick replies for fast testing/chats */}
                <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none select-none">
                  {[
                    "Halo!",
                    "Aku mau minum.",
                    "Toko obat di mana?",
                    "Hati-hati di jalan ya.",
                  ].map((phrase, i) => (
                    <button
                      key={i}
                      onClick={() => handleDemoPresetSelect(phrase)}
                      className="flex-shrink-0 bg-white/5 hover:bg-white/10 text-neutral-300 text-xs px-3 py-1.5 rounded-full border border-white/10 font-medium transition-colors"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                {/* THE DUAL INTERACTION SLATE */}
                <div className="flex gap-3.5 items-stretch mt-1">
                  
                  {/* LEFT: HOLD-TO-SPEAK FOR THE BLIND (STT) */}
                  <div className="flex flex-col justify-center">
                    <button
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={stopRecording}
                      className={`h-full px-4 rounded-2xl flex flex-col justify-center items-center gap-1.5 transition-all ${
                        isRecording
                          ? "bg-red-600 text-white shadow-xl scale-95"
                          : "bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20 hover:bg-[#0A84FF]/15"
                      }`}
                      title="Hold to Speak"
                    >
                      <Mic className={`w-5 h-5 ${isRecording ? "animate-pulse scale-125" : ""}`} />
                      <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-center">
                        {isRecording ? "LEPAS" : "TAHAN"}
                      </span>
                    </button>
                  </div>

                  {/* RIGHT: TEXT INPUT FOR DEAF/MUTE USERS */}
                  <form onSubmit={handleSendText} className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={typeInput}
                      onChange={(e) => setTypeInput(e.target.value)}
                      placeholder="Ketik balasan (tata bahasa diatur AI)..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#0A84FF] focus:bg-white/10 placeholder-neutral-500 transition-all font-semibold"
                    />
                    <button
                      type="submit"
                      disabled={!typeInput.trim()}
                      className="bg-[#0A84FF] text-white disabled:bg-neutral-800 disabled:text-neutral-505 p-3.5 rounded-2xl flex items-center justify-center transition-colors shadow-lg active:scale-95"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </form>

                </div>

                {/* Guidance micro-copy */}
                <p className="text-[9px] text-neutral-500 text-center font-sans tracking-wide">
                  * Untuk tuna netra: tekan & tahan tombol mikrofon, bicaralah, lalu lepas untuk mengirim teks.
                </p>

              </div>
            </motion.div>
          )}

          {/* TAB 3: USER GUIDE (AUDITORY HELP MANUAL) */}
          {activeTab === "guide" && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="p-5 space-y-5"
              id="view-guide"
            >
              <div className="glass-card rounded-2xl p-4 flex items-start gap-3.5">
                <div className="p-3 bg-[#0A84FF]/10 text-[#0A84FF] rounded-xl border border-[#0A84FF]/20">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">Pusat Bantuan HELFEN AI</h2>
                  <p className="text-xs text-neutral-450 mt-1 leading-relaxed">
                    Aplikasi ini dirancang dengan navigasi suara agar aksesibel bagi penyandang tunanetra dan tunarungu rungu.
                  </p>
                </div>
              </div>

              {/* Guide items */}
              <div className="space-y-3">
                {[
                  {
                    title: "Pembaca Nominal Uang",
                    text: "Sistem kamera cerdas HELFEN dapat menelaah nilai nominal uang rupiah berupa kertas atau logam secara akurat. Cukup arahkan moncong kamera ponsel dan ketuk tombol shutter.",
                    icon: <Coins className="w-4 h-4 text-amber-400" />
                  },
                  {
                    title: "Mata Objek Pendamping",
                    text: "Mendeskripsikan ruangan, barang di depan, tata letak obat-obatan, atau objek di sekitar pengguna agar tunanetra memperoleh visual komprehensif.",
                    icon: <Eye className="w-4 h-4 text-[#0A84FF]" />
                  },
                  {
                    title: "Jembatan Komunikasi (Bridge)",
                    text: "Ruang obrolan interaktif yang menghubungkan dua orang disabilitas berbeda. Tunarungu mengetik balasan teks, AI membereskan rima bahasa, kemudian TTS langsung membunyi lantang bagi tunanetra.",
                    icon: <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                  },
                  {
                    title: "Saringan Tata Bahasa AI (Realtime)",
                    text: "Teks yang diketik oleh tunarungu diperbaiki semantik dan susunan rimanya oleh Gemini AI agar terdengar santun, natural dan nyaman saat dibacakan oleh mesin.",
                    icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      triggerHaptic();
                      speakText(`${item.title}: ${item.text}`);
                    }}
                    className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all cursor-pointer flex gap-3.5 items-start"
                  >
                    <div className="p-2.5 bg-white/5 rounded-lg border border-white/10">{item.icon}</div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 font-sans tracking-wide">
                        {item.title}
                        <Volume2 className="w-3.5 h-3.5 text-[#0A84FF]" />
                      </h4>
                      <p className="text-[11px] text-[#A1A1AA] mt-1.5 leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Author and Support Info footer */}
              <div className="bg-white/5 rounded-2xl p-5 text-center border border-white/5 shadow-inner">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#0A84FF] font-bold">
                  HELFEN ACCESSIBILITY ECOSYSTEM
                </span>
                <h3 className="text-xs font-bold text-white mt-1.5">Developed with Love for Equality</h3>
                <p className="text-[10px] text-neutral-400 mt-1 leading-relaxed">
                  Mendukung kesetaraan komunikasi melalui Kecerdasan Buatan Visioner paling murni.
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <nav className="glass-nav grid grid-cols-3 py-2.5 px-3 sticky bottom-0 z-40">
        
        {/* Navigation tab 1: Vision */}
        <button
          onClick={() => {
            triggerHaptic();
            setActiveTab("vision");
          }}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === "vision" ? "text-[#0A84FF] scale-102 font-bold" : "text-neutral-500 hover:text-neutral-300"
          }`}
          id="nav-vision"
        >
          <Camera className="w-5.5 h-5.5" />
          <span className="text-[10px] mt-1 font-semibold">Vision</span>
          {activeTab === "vision" && (
            <motion.div layoutId="nav-dot" className="w-1.5 h-1.5 bg-[#0A84FF] rounded-full mt-1" />
          )}
        </button>

        {/* Navigation tab 2: Bridge */}
        <button
          onClick={() => {
            triggerHaptic();
            setActiveTab("bridge");
          }}
          className={`flex flex-col items-center justify-center py-1 transition-all relative ${
            activeTab === "bridge" ? "text-[#0A84FF] scale-102 font-bold" : "text-neutral-500 hover:text-neutral-300"
          }`}
          id="nav-bridge"
        >
          <div className="relative">
            <MessageSquare className="w-5.5 h-5.5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#0A84FF] animate-pulse"></span>
          </div>
          <span className="text-[10px] mt-1 font-semibold">Bridge</span>
          {activeTab === "bridge" && (
            <motion.div layoutId="nav-dot" className="w-1.5 h-1.5 bg-[#0A84FF] rounded-full mt-1" />
          )}
        </button>

        {/* Navigation tab 3: Guide */}
        <button
          onClick={() => {
            triggerHaptic();
            setActiveTab("guide");
          }}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === "guide" ? "text-[#0A84FF] scale-102 font-bold" : "text-neutral-500 hover:text-neutral-300"
          }`}
          id="nav-guide"
        >
          <HelpCircle className="w-5.5 h-5.5" />
          <span className="text-[10px] mt-1 font-semibold">Panduan</span>
          {activeTab === "guide" && (
            <motion.div layoutId="nav-dot" className="w-1.5 h-1.5 bg-[#0A84FF] rounded-full mt-1" />
          )}
        </button>

      </nav>

    </div>
  );
}
