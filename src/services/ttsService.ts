/**
 * Robust Text-to-Speech service using Web Speech API with fallback settings.
 */

export function speakText(text: string, onEnd?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      console.warn("SpeechSynthesis not supported in this browser.");
      resolve(false);
      return;
    }

    try {
      // Cancel previous speech
      window.speechSynthesis.cancel();

      if (!text.trim()) {
        resolve(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID"; // Default to Indonesian for native communication
      utterance.rate = 1.0;     // Normal speed
      utterance.pitch = 1.0;    // Standard pitch

      // Choose Indonesian voice if available
      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find(
        (v) => v.lang.startsWith("id") || v.lang.includes("ID")
      );
      if (idVoice) {
        utterance.voice = idVoice;
      }

      utterance.onend = () => {
        if (onEnd) onEnd();
        resolve(true);
      };

      utterance.onerror = (e) => {
        console.error("SpeechSynthesis error:", e);
        resolve(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("TTS failed completely:", err);
      resolve(false);
    }
  });
}

/**
 * Triggers a short vibration (haptic feedback) to assist blind users.
 */
export function triggerHaptic() {
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(35); // 35ms short vibration pulse
    } catch (e) {
      // Vibrate restricted or failed
    }
  }
}
