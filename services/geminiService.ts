import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

export const generateQuestionsWithGemini = async (topic: string, count: number, grade: number): Promise<Question[]> => {
  // @google/genai guideline: The API key must be obtained exclusively from the environment variable process.env.API_KEY.
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.warn("No API Key provided for Gemini. Please set API_KEY in environment variables.");
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Buatkan ${count} soal pilihan ganda untuk anak SD kelas ${grade} tentang topik "${topic}". 
    Format JSON harus berisi array soal. Setiap soal memiliki text, array options (4 pilihan), dan correctIndex (0-3).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctIndex: { type: Type.INTEGER },
            },
            required: ['text', 'options', 'correctIndex']
          }
        }
      }
    });

    const rawData = response.text;
    if (!rawData) throw new Error("No data returned");

    const parsedData = JSON.parse(rawData);
    
    // Map to our Question interface adding IDs and points
    return parsedData.map((q: any, idx: number) => ({
      id: `gen-${Date.now()}-${idx}`,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      points: 10 // Default points
    }));

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return [];
  }
};