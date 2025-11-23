import { GoogleGenAI, Type } from "@google/genai";
import { SimulationConfig, SimulationStats } from "../types";

const apiKey = process.env.API_KEY || '';
let genAI: GoogleGenAI | null = null;

if (apiKey) {
  genAI = new GoogleGenAI({ apiKey });
}

export const analyzeEngagement = async (
  config: SimulationConfig,
  stats: SimulationStats
): Promise<string> => {
  if (!genAI) return "API Key missing. Tactical Advisor offline.";

  try {
    const prompt = `
      You are a senior tactical defense analyst. Analyze this missile interception simulation.
      
      Configuration:
      - Missile Speed: ${config.missileSpeed} m/s
      - Target Speed: ${config.targetSpeed} m/s
      - Max Turn Rate: ${config.turnRate} deg/s
      - Initial Range: ${config.targetDistance} m
      
      Outcome:
      - Result: ${stats.didHit ? "INTERCEPTION SUCCESSFUL" : "INTERCEPTION FAILED"}
      - Closest Approach: ${stats.closestApproach.toFixed(2)} m
      - Flight Time: ${stats.timeElapsed.toFixed(2)} s
      
      Provide a concise, military-style assessment of the engagement efficiency. 
      If it missed, explain why (likely kinematics vs turn rate). 
      If it hit, comment on the efficiency.
      Keep it under 100 words.
    `;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a serious military tactical advisor. Speak briefly and authoritatively.",
      }
    });

    return response.text || "Analysis unavailable.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Tactical link disrupted. Unable to retrieve analysis.";
  }
};
