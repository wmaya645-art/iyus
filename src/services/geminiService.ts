import { GoogleGenAI, Modality } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
};

export async function generateAnnouncementAudio(text: string, voiceName: string = 'Kore'): Promise<string | undefined> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("Error generating TTS:", error);
    return undefined;
  }
}

export function playAudioFromBase64(base64Data: string) {
  if (!base64Data) {
    console.error("No audio data provided");
    return Promise.reject("No audio data");
  }

  try {
    // Use audio/mpeg for MP3 data which is common for TTS
    const audioSrc = `data:audio/mpeg;base64,${base64Data}`;
    const audio = new Audio();
    
    return new Promise((resolve, reject) => {
      audio.src = audioSrc;
      
      audio.oncanplaythrough = () => {
        audio.play()
          .then(resolve)
          .catch((err) => {
            console.error("Playback failed:", err);
            reject(err);
          });
      };

      audio.onerror = (e) => {
        console.error("Audio loading error:", e);
        reject("Failed to load audio source");
      };
    });
  } catch (error) {
    console.error("Error in playAudioFromBase64:", error);
    return Promise.reject(error);
  }
}
