import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const getClient = (apiKey: string | undefined, keyName: string) => {
  const fallbackKey = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY_ || '';
  if (!apiKey || apiKey.includes("paste_key") || apiKey === "your_existing_key_here") {
    console.warn(`[NEXUS-KEYS] Warning: ${keyName} not set properly. Falling back to primary GEMINI_API_KEY`);
    return new GoogleGenAI({ 
      apiKey: fallbackKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }
  return new GoogleGenAI({ 
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
};

// Group 1 — SOS (dedicated, never share)
export const sosClient = getClient(process.env.GEMINI_API_KEY_SOS, 'GEMINI_API_KEY_SOS');

// Group 2 — Incidents and evacuation
export const incidentClient = getClient(process.env.GEMINI_API_KEY_INCIDENTS, 'GEMINI_API_KEY_INCIDENTS');

// Group 3 — User-facing chat
export const userClient = getClient(process.env.GEMINI_API_KEY_USERS, 'GEMINI_API_KEY_USERS');

// Group 4 — Background and simulation
export const backgroundClient = getClient(process.env.GEMINI_API_KEY_BACKGROUND, 'GEMINI_API_KEY_BACKGROUND');
