import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractTextFromImage = async (base64Image: string): Promise<string> => {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          },
          {
            text: "Extract all visible text from this image. Return only the text, maintaining layout where possible. If no text, say 'No text detected'."
          }
        ]
      }
    });

    return response.text || "No text detected.";
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};

export const explainImage = async (base64Image: string): Promise<string> => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          },
          {
            text: "Provide a concise, helpful description of this screenshot. If it looks like code, explain what the code does. If it's a UI, describe the key elements."
          }
        ]
      }
    });

    return response.text || "Could not analyze image.";
  } catch (error) {
    console.error("Gemini Explain Error:", error);
    throw error;
  }
};