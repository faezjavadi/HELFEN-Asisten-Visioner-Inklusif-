import { GoogleGenAI } from "@google/genai";

// Lazy initialization of the Gemini client
let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = (process.env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required but not found in the environment.");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return ai;
}

export enum OperationMode {
  OBJECT_FINDER = "OBJECT_FINDER",
  CURRENCY_READER = "CURRENCY_READER",
  TEXT_READER = "TEXT_READER",
}

const SYSTEM_INSTRUCTIONS_VISION = `
Kamu adalah Helfen AI, asisten pendengaran dan penglihatan untuk penyandang tuna netra. 
Deskripsikan gambar yang ditangkap kamera dengan bahasa Indonesia yang hangat, singkat, padat, dan sangat deskriptif.
- Jika mode nominal uang aktif, fokus sebutkan nilai uang kertas/koin secara jelas.
- Jika mode pembaca teks aktif, bacakan tulisan yang tertera di label atau kertas.
- Hindari kalimat pembuka yang bertele-tele. Langsung berikan informasi pentingnya agar ramah bagi pembaca layar (Text-to-Speech).
`;

/**
 * Process a base64 camera capture using Gemini Vision.
 */
export async function processVision(
  base64Image: string,
  mode: OperationMode,
  targetObject?: string
): Promise<string> {
  try {
    const genAI = getAI();

    let prompt = `Tolong bantu aku melihat gambar ini. Mode aktif: ${mode}.`;
    if (mode === OperationMode.OBJECT_FINDER) {
      prompt = targetObject
        ? `Temukan objek "${targetObject}" di gambar ini. Berikan letak dan deskripsi singkatnya.`
        : "Deskripsikan objek utama yang ada di tengah-tengah gambar ini secara singkat.";
    } else if (mode === OperationMode.CURRENCY_READER) {
      prompt = "Berapa nominal atau nilai mata uang (kertas / koin) yang terlihat pada gambar ini? Sebutkan nilainya dengan jelas.";
    } else if (mode === OperationMode.TEXT_READER) {
      prompt = "Tolong bacakan atau salin semua teks/tulisan yang tertera di gambar ini dengan jelas.";
    }

    // Strip data URL prefixes if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data,
      },
    };

    const response = await genAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS_VISION,
        temperature: 0.4,
      },
    });

    return response.text || "Maaf, aku tidak bisa melihat dengan jelas.";
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
      return "Kunci API (GEMINI_API_KEY) tidak ditemukan. Silakan konfigurasi di Settings > Secrets.";
    }
    return "Maaf, terjadi kesalahan saat berkomunikasi dengan AI pendeteksi.";
  }
}

/**
 * Perform real-time grammar cleaning (Semantic Cleaning) on a user's typed chat text.
 * This makes it natural and friendly to hear when spoken aloud via Text-to-Speech.
 */
export async function cleanChatSemantics(text: string): Promise<string> {
  try {
    const genAI = getAI();

    const prompt = `Rapikan kalimat ketikan berikut ini agar terdengar natural, sopan, mengalir, dan mudah dikomunikasikan saat dibacakan oleh suara Text-to-Speech (TTS) untuk penyandang tuna netra.
Hasil harus berupa kalimat langsung dalam bahasa Indonesia, tanpa tanda kutip di awal/akhir, tanpa catatan kaki, tanpa teks penjelasan tambahan, dan tanpa intro. Balas HANYA hasil kalimat yang sudah dirapikan saja.

Kalimat asli: "${text}"`;

    const response = await genAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Kamu adalah AI penyaring bahasa yang merapikan kalimat ketikan tunarungu/wicara agar ramah didengar tuna netra.",
        temperature: 0.1,
      },
    });

    return (response.text || text).replace(/^"|"$/g, "").trim();
  } catch (err) {
    console.error("Semantic Cleaning Error:", err);
    return text; // Fallback to original text if Gemini call fails
  }
}
