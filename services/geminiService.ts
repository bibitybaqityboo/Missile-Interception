import type { GoogleGenAI } from "@google/genai";
import { EndReason, SimulationConfig, SimulationStats } from "../types";

const apiKey = process.env.API_KEY || '';
let genAI: Promise<GoogleGenAI> | null = null;

// The SDK is loaded on first use so it stays out of the initial bundle.
const getClient = () => {
  genAI ??= import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  return genAI;
};

export const isAdvisorAvailable = () => apiKey !== '';

const REASON_TEXT: Record<EndReason, string> = {
  intercept: "INTERCEPTION SUCCESSFUL",
  timeout: "INTERCEPTION FAILED (interceptor exceeded max flight time and self-destructed)",
  escaped: "INTERCEPTION FAILED (bogey opened range beyond engagement envelope)",
  debris: "INTERCEPTOR LOST (collided with debris)",
  ground: "INTERCEPTOR LOST (ground impact)",
};

export const analyzeEngagement = async (
  config: SimulationConfig,
  stats: SimulationStats
): Promise<string> => {
  if (!apiKey) return "API Key missing. Tactical Advisor offline.";

  try {
    const client = await getClient();
    const prompt = `
      You are a senior tactical defense analyst. Analyze this missile interception simulation.
      The interceptor uses pure-pursuit guidance with a turn-rate limit.

      Configuration:
      - Missile Speed: ${config.missileSpeed} m/s
      - Target Speed: ${config.targetSpeed} m/s
      - Max Turn Rate: ${config.turnRate} deg/s
      - Initial Range: ${config.targetDistance} m
      - Launch Elevation: ${config.launchAngle} deg
      - Debris Obstacles: ${config.obstacleCount}

      Outcome:
      - Result: ${REASON_TEXT[stats.reason]}
      - Closest Approach: ${stats.closestApproach.toFixed(2)} m
      - Flight Time: ${stats.timeElapsed.toFixed(2)} s

      Provide a concise, military-style assessment of the engagement efficiency.
      If it missed, explain why (likely kinematics vs turn rate).
      If it hit, comment on the efficiency.
      Keep it under 100 words.
    `;

    const response = await client.models.generateContent({
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
