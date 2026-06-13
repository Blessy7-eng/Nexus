import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import {
  sosClient,
  incidentClient,
  userClient,
  backgroundClient,
} from "./src/server/geminiKeyManager";

dotenv.config();

const PORT = 3000;

const STATE_FILE = path.join(process.cwd(), "nexus_state.json");

const MOCK_DB = {
  incidents: [] as any[],
  evacuation: null as any,
  staff: [
    {
      id: "SJ",
      name: "Sarah Jenkins",
      role: "Security",
      status: "AVAILABLE",
      location: "R412",
      color: "#EF4444",
      assignedIncident: null as string | null,
    },
    {
      id: "MT",
      name: "Mike Thorne",
      role: "Medical Officer",
      status: "AVAILABLE",
      location: "POOL",
      color: "#10B981",
      assignedIncident: null as string | null,
    },
    {
      id: "AR",
      name: "Alex Rivera",
      role: "Concierge",
      status: "AVAILABLE",
      location: "LOBBY",
      color: "#10B981",
      assignedIncident: null as string | null,
    },
    {
      id: "LC",
      name: "Laura Chen",
      role: "Floor Manager",
      status: "ON_BREAK",
      location: null as string | null,
      color: "#F59E0B",
      assignedIncident: null as string | null,
    },
    {
      id: "RB",
      name: "Ryan Bose",
      role: "Security",
      status: "AVAILABLE",
      location: null as string | null,
      color: "#64748B",
      assignedIncident: null as string | null,
    },
  ] as any[],
  notifications: [] as any[],
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, "utf-8");
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        console.error("Error parsing STATE_FILE JSON:", e);
        return;
      }
      if (parsed && Array.isArray(parsed.incidents)) {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        MOCK_DB.incidents = parsed.incidents.filter(
          (inc: any) => (inc.timestamp || Date.now()) > oneDayAgo,
        );

        if (parsed.staff && Array.isArray(parsed.staff)) {
          MOCK_DB.staff = parsed.staff;
        }
        if (parsed.evacuation) {
          MOCK_DB.evacuation = parsed.evacuation;
        }
        if (parsed.notifications && Array.isArray(parsed.notifications)) {
          MOCK_DB.notifications = parsed.notifications;
        }
        console.log(
          `[NEXUS-PERSIST] Loaded ${MOCK_DB.incidents.length} incidents and ${MOCK_DB.notifications?.length || 0} guest notifications from persistent store.`,
        );
        return;
      }
    }
  } catch (e) {
    console.error("[NEXUS-PERSIST] Failed to load persistent state:", e);
  }

  saveState();
}

function saveState() {
  try {
    const dataToSave = {
      incidents: MOCK_DB.incidents,
      staff: MOCK_DB.staff,
      evacuation: MOCK_DB.evacuation,
      notifications: MOCK_DB.notifications || [],
      updatedAt: Date.now(),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(dataToSave, null, 2), "utf-8");
  } catch (e) {
    console.error("[NEXUS-PERSIST] Failed to save state:", e);
  }
}

const keyStatus = {
  SOS: !!process.env.GEMINI_API_KEY_SOS
    ? "✓ dedicated key"
    : "⚠ using fallback",
  INCIDENTS: !!process.env.GEMINI_API_KEY_INCIDENTS
    ? "✓ dedicated key"
    : "⚠ using fallback",
  USERS: !!process.env.GEMINI_API_KEY_USERS
    ? "✓ dedicated key"
    : "⚠ using fallback",
  BACKGROUND: !!process.env.GEMINI_API_KEY_BACKGROUND
    ? "✓ dedicated key"
    : "⚠ using fallback",
};

console.log("[NEXUS-KEYS] API Key Status:");
console.table(keyStatus);

async function startServer() {
  const app = express();
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Load persisted state on startup
  loadState();

  // BUG 1 FIX: Centralized Firestore onSnapshot Simulation
  const notifyIncidentsSynced = () => {
    saveState();
    io.emit("incidents_synced", {
      event: "incidents_synced",
      incidents: MOCK_DB.incidents,
      count: MOCK_DB.incidents.length,
      timestamp: new Date().toISOString(),
    });
  };

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.emit("init_state", {
      incidents: MOCK_DB.incidents,
      evacuation: MOCK_DB.evacuation,
      staff: MOCK_DB.staff,
    });
  });

  const generateContentWithRetry = async (
    prompt: string,
    client: GoogleGenAI,
    options: {
      model?: string;
      generationConfig?: any;
      maxRetries?: number;
    } = {},
  ) => {
    const {
      model = "gemini-2.5-flash",
      generationConfig = {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
      maxRetries = 3,
    } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: generationConfig,
        });
        return { text: result.text || "", response: result };
      } catch (error: any) {
        lastError = error;
        console.error(`[NEXUS-AI] Attempt ${attempt} failed:`, error.message);

        if (error.status === 429) {
          const waitMs = attempt * 2000;
          console.log(
            `[NEXUS-AI] Quota hit. Waiting ${waitMs}ms before retry...`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        } else if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    throw lastError || new Error("Max retries exceeded");
  };

  // FEATURE 1: CLASSIFY
  app.post("/api/ai/classify-incident", async (req, res) => {
    try {
      const { incidentId, description, location } = req.body;

      if (description === "Auto-detected anomaly" && !req.body.forceClassify) {
        const quickTypes = ["MAINTENANCE", "SUSPICIOUS_ACTIVITY", "OTHER"];
        const quickSeverities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        return res.json({
          event: "incident_classified",
          data: {
            incidentId,
            classification: {
              type: quickTypes[Math.floor(Math.random() * quickTypes.length)],
              severityScore:
                quickSeverities[
                  Math.floor(Math.random() * quickSeverities.length)
                ],
              urgencyLevel: "MEDIUM",
              responseProtocol: "Monitor and assess",
              estimatedStaffNeeded: 1,
              aiClassified: false,
              quickClassified: true,
            },
          },
          timestamp: new Date().toISOString(),
        });
      }

      const prompt = `You are a Crisis AI for a Hospitality Center. Analyze this incident:
Description: ${description}
Location: ${location}

Classify the incident. Return ONLY valid JSON with no markdown formatting.
Analyze the severity properly. You can choose any number from 1 to 10 based on the context of the emergency.

Schema:
{
  "type": "MEDICAL" | "FIRE" | "THEFT" | "ASSAULT" | "MAINTENANCE" | "EVACUATION" | "SUSPICIOUS_ACTIVITY" | "OTHER",
  "severityScore": number (1-10),
  "justification": "string",
  "responseProtocol": "string",
  "estimatedStaffNeeded": number,
  "urgencyLevel": "CRITICAL" | "HIGH" | "MEDIUM"
}`;

      const response = await generateContentWithRetry(prompt, incidentClient);

      let text = response.text || "";
      if (!text) throw new Error("No response");
      text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const classification = JSON.parse(text);

      // We broadcast this via WebSocket
      const payload = {
        event: "incident_classified",
        data: { incidentId, classification },
        timestamp: new Date().toISOString(),
      };

      const existingSuccess = MOCK_DB.incidents.find(
        (i: any) => i.id === incidentId,
      );
      if (existingSuccess) {
        existingSuccess.classification = classification;
        existingSuccess.type = classification.type;
        existingSuccess.severity = classification.urgencyLevel;
        existingSuccess.isProcessing = false;
      } else {
        MOCK_DB.incidents.push({
          id: incidentId,
          description,
          location,
          ...classification,
          status: "ACTIVE",
          isProcessing: false,
        });
      }

      io.emit("incident_classified", payload);
      notifyIncidentsSynced(); // BUG 1 FIX: sync shared state

      // BUG 3: Auto-assign staff if severity >= 6
      if (classification.severityScore >= 6) {
        const availableStaff = MOCK_DB.staff.find(
          (s: any) => s.status === "AVAILABLE",
        );
        if (availableStaff) {
          availableStaff.status = "RESPONDING";
          const inc = MOCK_DB.incidents.find((i: any) => i.id === incidentId);
          if (inc) {
            inc.assigneeId = availableStaff.id;
            notifyIncidentsSynced(); // Sync the updated assignment
          }
          io.emit("staff_assigned", {
            event: "staff_assigned",
            data: {
              incidentId,
              staffId: availableStaff.id,
              staffName: availableStaff.name,
              location,
              incidentType: classification.type,
              score: classification.severityScore,
            },
            timestamp: new Date().toISOString(),
          });
        } else {
          io.emit("no_staff_available", {
            event: "no_staff_available",
            data: { incidentId },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Feature 2 requires us to auto-trigger evacuation calc when Critical
      if (
        classification.urgencyLevel === "CRITICAL" ||
        classification.severityScore >= 8
      ) {
        // simulated delay to mimic separate db listener trigger
        setTimeout(async () => {
          try {
            const evacPrompt = `You are a Crisis Coordination AI. Given active incidents, calculate the safest evacuation routes.
Incidents: ${JSON.stringify(MOCK_DB.incidents)}
Layout: {"floors": 4, "roomsPerFloor": 12, "levels": ["Floor 1", "Floor 4", "Amenities"]}

CRITICAL INSTRUCTION: Ensure that evacuation routes (in "primaryRoutes") are specifically calculated and uniquely distinct for Floor 1, Floor 4, and AMENITIES (Pool/Gym). Every floor must have distinct paths.

Return ONLY valid JSON:
{
  "primaryRoutes": [
    {
      "zone": "string (MUST explicitly include Floor 1, Floor 4, or AMENITIES)",
      "path": ["node 1", "node 2", "node 3"],
      "estimatedClearTime": "string",
      "bottleneckRisk": "LOW|MEDIUM|HIGH",
      "capacity": 100
    }
  ],
  "blockedZones": ["${location}"],
  "recommendedExits": ["Exit East", "Exit West", "Exit North"],
  "overallRiskLevel": "CRITICAL",
  "specialInstructions": "Immediate evacuation!"
}`;
            const evacRes = await generateContentWithRetry(
              evacPrompt,
              backgroundClient,
            );

            if (evacRes.text) {
              let text = evacRes.text;
              text = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
              const plan = JSON.parse(text);
              const evacPayload = {
                event: "evacuation_updated",
                data: plan,
                timestamp: new Date().toISOString(),
              };
              MOCK_DB.evacuation = plan;
              io.emit("evacuation_updated", evacPayload);
            }
          } catch (e) {
            console.error("Auto trigger evacuation failed", e);
          }
        }, 1000);
      }

      res.json(payload);
    } catch (e: any) {
      console.error("Classification error:", e);
      const fallback = {
        event: "incident_classified",
        data: {
          incidentId: req.body.incidentId,
          classification: {
            type: "OTHER",
            severityScore: 5,
            justification: "AI Rate Limit Fallback",
            responseProtocol: "Dispatch immediately",
            estimatedStaffNeeded: 1,
            urgencyLevel: "MEDIUM",
          },
        },
        timestamp: new Date().toISOString(),
      };

      const existing = MOCK_DB.incidents.find(
        (i: any) => i.id === req.body.incidentId,
      );
      if (existing) {
        Object.assign(existing, fallback.data.classification);
        existing.isProcessing = false;
        existing.type = fallback.data.classification.type;
        existing.severity = fallback.data.classification.urgencyLevel;
      } else {
        MOCK_DB.incidents.push({
          id: req.body.incidentId,
          description: req.body.description,
          location: req.body.location,
          ...fallback.data.classification,
          status: "ACTIVE",
          isProcessing: false,
        });
      }
      io.emit("incident_classified", fallback);
      notifyIncidentsSynced();
      res.json(fallback);
    }
  });

  let evacuationCache: {
    plan: any;
    generatedAt: number;
    incidentHash: string;
  } | null = null;
  const EVACUATION_CACHE_TTL = 3 * 60 * 1000;

  // FEATURE 2: EVACUATION
  app.post("/api/ai/evacuation-route", async (req, res) => {
    try {
      const { incidents, venueLayout } = req.body;

      const incidentHash = incidents
        .map((i: any) => i.id + "-" + i.type)
        .join("|");
      if (
        evacuationCache &&
        evacuationCache.incidentHash === incidentHash &&
        Date.now() - evacuationCache.generatedAt < EVACUATION_CACHE_TTL
      ) {
        console.log("[NEXUS-CACHE] Returning cached evacuation plan");
        return res.json({
          event: "evacuation_updated",
          data: evacuationCache.plan,
          timestamp: new Date().toISOString(),
        });
      }

      const prompt = `You are a Crisis Coordination AI. Given active incidents, calculate the safest evacuation routes.
Incidents: ${JSON.stringify(incidents)}
Layout: ${JSON.stringify(venueLayout)}

CRITICAL INSTRUCTION: Ensure that evacuation routes (in "primaryRoutes") are specifically calculated and uniquely distinct for at least "Floor 1", "Floor 4", and "AMENITIES" (Pool/Gym). Every floor must have distinct paths.

Return ONLY valid JSON:
{
  "primaryRoutes": [
    {
      "zone": "string (MUST explicitly include Floor 1, Floor 4, or AMENITIES)",
      "path": ["node 1", "node 2", "node 3"],
      "estimatedClearTime": "string (e.g. 4 mins)",
      "bottleneckRisk": "LOW|MEDIUM|HIGH",
      "capacity": number
    }
  ],
  "blockedZones": ["string array"],
  "recommendedExits": ["string array"],
  "overallRiskLevel": "CRITICAL|HIGH|MEDIUM|LOW",
  "specialInstructions": "string"
}`;

      const response = await generateContentWithRetry(prompt, incidentClient);

      if (!response.text) throw new Error("No text response");
      let text = response.text || "";
      text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const plan = JSON.parse(text);

      evacuationCache = {
        plan,
        generatedAt: Date.now(),
        incidentHash,
      };

      const payload = {
        event: "evacuation_updated",
        data: plan,
        timestamp: new Date().toISOString(),
      };

      MOCK_DB.evacuation = plan;
      io.emit("evacuation_updated", payload);
      res.json(payload);
    } catch (e: any) {
      console.error("[NEXUS-AI] Evacuation route generation failed. Using fallback.", e.message);
      const fallbackPlan = {
        primaryRoutes: [
          {
            zone: "Floor 4",
            path: ["Nearest available exit", "Main Lobby"],
            estimatedClearTime: "5 mins",
            bottleneckRisk: "MEDIUM",
            capacity: 100,
          },
        ],
        blockedZones: [],
        recommendedExits: ["Main Exit"],
        overallRiskLevel: "HIGH",
        specialInstructions:
          "AI processing unavailable. Standard evacuation protocols apply.",
      };
      const payload = {
        event: "evacuation_updated",
        data: fallbackPlan,
        timestamp: new Date().toISOString(),
      };
      MOCK_DB.evacuation = fallbackPlan;
      io.emit("evacuation_updated", payload);
      res.json(payload);
    }
  });

  // NEW GUEST ROUTES
  app.get("/api/evacuation/guest", async (req, res) => {
    const activeIncidents = MOCK_DB.incidents.filter(
      (i: any) => i.status === "ACTIVE" || i.status === "RESPONDING",
    );

    if (activeIncidents.length > 0) {
      const incidentContext = activeIncidents
        .map((i: any) => `${i.type} at ${i.location}`)
        .join(", ");
      try {
        const prompt = `You are an emergency evacuation AI. There are active incidents: ${incidentContext}.
Generate a safe evacuation plan for the hotel guests.
Respond with a single JSON object. No markdown, no backticks, no markdown blocks.
CRITICAL INSTRUCTION: The evacuation routes must be unique, detailed and distinct for Floor 1, Floor 4, and Amenities based on their locations. Every floor must have different paths calculated away from incidents.

JSON Format:
{
  "nearestExit": "string (e.g., Use East Stairwell safely)",
  "floorInstructions": {
    "4": "string (path for 4th floor)",
    "1": "string (path for 1st floor)",
    "AMENITIES": "string (path for pool/gym level)"
  },
  "avoidZones": ["zone1", "zone2"],
  "assemblyPoint": "string",
  "specialNote": "string"
}`;
        const response = await generateContentWithRetry(prompt, userClient, {
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
        });

        let text = response.text || "";
        text = text
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        const plan = JSON.parse(text);
        plan.lastUpdated = new Date().toISOString();
        return res.json(plan);
      } catch (e) {
        console.error(
          "Evacuation AI generation failed, falling back to basic:",
          e,
        );
      }
    } else if (MOCK_DB.evacuation) {
      // Convert complex evac plan to simple guest plan
      const simple = {
        nearestExit:
          MOCK_DB.evacuation.recommendedExits?.[0] || "Nearest available exit",
        floorInstructions: {
          "4":
            MOCK_DB.evacuation.primaryRoutes
              ?.find((r: any) => /4|four/i.test(r.zone))
              ?.path.join(" → ") || "Follow structural exit signs",
          "1":
            MOCK_DB.evacuation.primaryRoutes
              ?.find((r: any) => /1|one|ground/i.test(r.zone))
              ?.path.join(" → ") || "Use main lobby exit",
          AMENITIES:
            MOCK_DB.evacuation.primaryRoutes
              ?.find((r: any) => /pool|amenit|gym/i.test(r.zone))
              ?.path.join(" → ") || "Proceed downwards to ground floor",
        },
        avoidZones: MOCK_DB.evacuation.blockedZones || [],
        assemblyPoint: "Hotel Front Parking Lot",
        specialNote:
          MOCK_DB.evacuation.specialInstructions || "Do NOT use elevators",
        lastUpdated: new Date().toISOString(),
      };
      return res.json(simple);
    }

    // Default
    res.json({
      nearestExit: "East Stairwell",
      floorInstructions: {
        "4": "Take Stairwell B to Floor 1",
        "1": "Use East Exit Door",
        AMENITIES: "Use Pool Exit to Ground",
      },
      avoidZones: [],
      assemblyPoint: "Hotel Front Entrance",
      specialNote: "Do not use elevators",
      lastUpdated: new Date().toISOString(),
    });
  });

  app.get("/api/notifications/guest", (req, res) => {
    const { roomNumber } = req.query;
    if (!roomNumber) {
      return res.json({ success: true, notifications: [] });
    }
    if (!MOCK_DB.notifications) {
      MOCK_DB.notifications = [];
    }
    const filtered = MOCK_DB.notifications.filter(
      (n) => String(n.roomNumber).trim() === String(roomNumber).trim(),
    );
    res.json({ success: true, notifications: filtered });
  });

  app.post("/api/notifications/guest", (req, res) => {
    const { roomNumber, message, staffName } = req.body;
    const payload = {
      roomNumber,
      message,
      staffName,
      timestamp: new Date().toISOString(),
      read: false,
    };

    if (!MOCK_DB.notifications) {
      MOCK_DB.notifications = [];
    }
    MOCK_DB.notifications.push(payload);
    saveState();

    io.emit("guest_notification", {
      event: "guest_notification",
      data: payload,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  });

  app.post("/api/ai/guest-chat", async (req, res) => {
    try {
      const { message, roomNumber, language } = req.body;
      const prompt = `You are NEXUS, an emergency buddy and safety assistant for hotel guests.
Your goal is to provide easy-to-read, supportive, and reassuring messages to help guests stay calm in any situation.

RULES:
- Always respond in the SAME LANGUAGE as the guest's message (which might be ${language || "unknown"}).
- Act as a supportive, calming emergency buddy. 
- Use simple, easy-to-read sentences. Break up long paragraphs.
- Keep responses concise but fully complete your thought. Do not cut off your sentence.
- If asked non-safety questions, politely explain you are here for emergency/safety purposes and ask them to dial 0 for the front desk.
- Always end with a positive, reassuring action or statement to reduce panic.
- You know this guest is in Room ${roomNumber || "Unknown"}.

Guest message: ${message}`;

      const response = await generateContentWithRetry(prompt, userClient, {
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      });

      res.json({
        success: true,
        response: response.text || "",
        detectedLanguage: language,
      });
    } catch (e: any) {
      console.error("[GUEST-CHAT-ERROR]", e.message, e.stack);
      res.json({
        response: "Please call the front desk for assistance. Dial 0.",
        detectedLanguage: "unknown",
      });
    }
  });

  app.post("/api/ai/staff-chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      const prompt = `You are NEXUS, an AI assistant for hotel emergency command center staff. 
Current system status: ${JSON.stringify(context)}
Answer professionally, concisely, under 100 words. Focus on actionable guidance.
You know hotel emergency protocols thoroughly.

Staff message: ${message}`;

      const response = await generateContentWithRetry(prompt, userClient, {
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      });

      res.json({ success: true, response: response.text || "" });
    } catch (e: any) {
      console.error("[STAFF-CHAT-ERROR]", e.message, e.stack);
      res.json({ success: false, response: "Error connecting to NEXUS AI..." });
    }
  });

  // NEW UNIFIED SOS PIPELINE
  app.post(["/api/sos/trigger", "/api/sos/guest"], async (req, res) => {
    try {
      const { rawText, timestamp, roomNumber } = req.body;
      const locationHint = roomNumber
        ? `Room ${roomNumber}`
        : req.body.location || "unknown";

      const prompt = `
You are an expert emergency response classifier 
for a hotel crisis management system.
Analyze the emergency report and classify it.
Analyze the severity properly. You can choose any number from 1 to 10 based on the emergency context, do not just fix to 5.

FIRE CLASSIFICATION RULES:
- ANY mention of fire = minimum severity 8
- Fire in multiple rooms = severity 10, 
  type FIRE, urgencyLevel CRITICAL
- Smoke detected = minimum severity 7
- Smell of smoke = minimum severity 5

MEDICAL CLASSIFICATION RULES:  
- Unconscious person = severity 9
- Chest pain / cardiac = severity 9
- Injury with bleeding = severity 8
- Person fell = severity 7
- Feeling unwell = severity 5

SECURITY CLASSIFICATION RULES:
- Armed person = severity 10
- Intruder confirmed = severity 8
- Suspicious person = severity 6
- Noise/disturbance = severity 4

Emergency Report: "${rawText}"
Location hint: "${locationHint}"

Respond with ONLY valid JSON, no markdown:
{
  "type": "FIRE | MEDICAL | THEFT | ASSAULT | MAINTENANCE | EVACUATION | SUSPICIOUS_ACTIVITY | OTHER",
  "severity": integer 1-10 based on rules above,
  "urgencyLevel": "CRITICAL | HIGH | MEDIUM | LOW",
  "location": "extracted specific location or null",
  "translatedText": "English translation",
  "detectedLanguage": "language name in English",
  "responseProtocol": "3 specific numbered action steps for staff",
  "estimatedStaffNeeded": integer 1-3,
  "confirmationMessage": "reassuring message in EXACT SAME language as the input text",
  "reasoning": "one sentence explaining severity score"
}

CRITICAL: If the report mentions fire anywhere, severity MUST be 8 or higher.
If multiple rooms/floors affected, severity MUST be 9 or 10.
`;

      let classification;
      try {
        const response = await generateContentWithRetry(prompt, sosClient, {
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });
        let text = response.text || "";
        text = text
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        console.log("[NEXUS-AI] Raw Gemini response:", text);
        classification = JSON.parse(text);

        // Override: fire must be minimum 8
        if (classification.type === "FIRE" && classification.severity < 8) {
          classification.severity = 8;
          classification.urgencyLevel = "CRITICAL";
          console.log("[NEXUS-AI] Fire severity override: bumped to 8 minimum");
        }

        // Override: multiple rooms = severity 10
        const multiRoomPattern = /room[s]?\s+\d+\s*(to|-|and)\s*\d+/i;
        if (multiRoomPattern.test(rawText) && classification.type === "FIRE") {
          classification.severity = 10;
          classification.urgencyLevel = "CRITICAL";
          classification.estimatedStaffNeeded = 3;
          console.log("[NEXUS-AI] Multi-room fire: severity set to 10");
        }

        // Override: CRITICAL urgency = minimum 8 severity
        if (
          classification.urgencyLevel === "CRITICAL" &&
          classification.severity < 8
        ) {
          classification.severity = 8;
        }
      } catch (err: any) {
        console.error("[NEXUS-AI] Gemini failed:", err.message);
        classification = {
          type: "OTHER",
          severity: 5,
          urgencyLevel: "MEDIUM",
          location: req.body.location || "Unknown",
          translatedText: rawText,
          detectedLanguage: "Unknown",
          responseProtocol: "Investigate and respond",
          estimatedStaffNeeded: 1,
          confirmationMessage: "Alert received. Help is coming.",
        };
      }

      classification.type = classification.type || "OTHER";
      classification.severity = Number(classification.severity) || 5;
      classification.urgencyLevel = classification.urgencyLevel || "MEDIUM";
      classification.estimatedStaffNeeded =
        Number(classification.estimatedStaffNeeded) || 1;

      const incidentId = "inc-" + Math.random().toString(36).substr(2, 9);

      const staffCount =
        classification.severity >= 7 ? 3 : classification.severity >= 4 ? 2 : 1;

      let staffDocs = MOCK_DB.staff.filter((s) => s.status === "AVAILABLE");
      console.log("[NEXUS-ASSIGN] Available staff:", staffDocs.length);
      console.log(
        "[NEXUS-ASSIGN] Staff statuses:",
        MOCK_DB.staff.map((d) => ({ name: d.name, status: d.status })),
      );

      if (staffDocs.length === 0) {
        staffDocs = MOCK_DB.staff.filter((s) => s.status === "Available");
        console.log('[NEXUS-ASSIGN] Tried "Available":', staffDocs.length);
      }
      if (staffDocs.length === 0) {
        staffDocs = MOCK_DB.staff.filter((s) => s.status === "available");
        console.log('[NEXUS-ASSIGN] Tried "available":', staffDocs.length);
      }

      const sorted = staffDocs.sort((a, b) => {
        const aFloor = a.location || "";
        const incidentFloor = classification.location || "";
        return typeof aFloor === "string" &&
          typeof incidentFloor === "string" &&
          aFloor.toLowerCase().includes(incidentFloor.toLowerCase())
          ? -1
          : 1;
      });

      const selected = sorted.slice(0, staffCount);
      console.log(
        "[NEXUS-ASSIGN] Assigning to:",
        selected.map((s) => s.name),
      );

      const assignedStaffData: any[] = [];
      for (const staffData of selected) {
        const staffAny = staffData as any;
        staffAny.status =
          staffAny.status.toLowerCase() === "available"
            ? "responding"
            : staffAny.status === "Available"
              ? "Responding"
              : "RESPONDING";
        staffAny.assignedIncident = incidentId;
        staffAny.assignedAt = new Date().toISOString();

        assignedStaffData.push({
          id: staffAny.id,
          name: staffAny.name,
          role: staffAny.role,
        });
        console.log(
          `[AUTO-ASSIGN] ${staffData.name} → ${classification.type} at ${classification.location} (Sev: ${classification.severity}/10)`,
        );
      }

      const newIncident = {
        id: incidentId,
        type: classification.type,
        severity: classification.severity,
        urgencyLevel: classification.urgencyLevel,
        location: classification.location || locationHint || "Unknown",
        translatedText: classification.translatedText,
        description: classification.translatedText || rawText,
        detectedLanguage: classification.detectedLanguage,
        responseProtocol: classification.responseProtocol,
        assignedStaff: assignedStaffData,
        status: assignedStaffData.length > 0 ? "RESPONDING" : "ACTIVE",
        aiClassified: true,
        classifiedAt: new Date().toISOString(),
        timestamp: Date.now(),
        source: roomNumber ? "GUEST_SOS" : "SOS_TRIGGER",
        roomNumber: roomNumber || null,
      };

      if (assignedStaffData.length > 0) {
        (newIncident as any).assigneeId = assignedStaffData[0].id;
      } else {
        console.log(
          "[WARNING] No available staff — manual assignment required",
        );
      }

      MOCK_DB.incidents.push(newIncident as any);
      notifyIncidentsSynced();

      io.emit("new_incident", {
        event: "new_incident",
        data: {
          id: incidentId,
          type: classification.type,
          severity: classification.severity,
          urgencyLevel: classification.urgencyLevel,
          location: classification.location,
          status: newIncident.status,
          assignedStaff: assignedStaffData,
          aiClassified: true,
          source: newIncident.source,
          roomNumber: roomNumber || null,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      io.emit("staff_assigned", {
        event: "staff_assigned",
        data: {
          incidentId,
          assignedStaff: assignedStaffData,
          autoAssigned: true,
          severity: classification.severity,
          message:
            assignedStaffData.length > 0
              ? `AI assigned ${assignedStaffData.length} staff to ${classification.type}`
              : "No staff available",
        },
        timestamp: new Date().toISOString(),
      });

      io.emit("incident_classified", {
        event: "incident_classified",
        data: {
          incidentId,
          type: classification.type,
          severity: classification.severity,
          urgencyLevel: classification.urgencyLevel,
          responseProtocol: classification.responseProtocol,
        },
        timestamp: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        incidentId,
        classification: {
          type: classification.type,
          severity: classification.severity,
          urgencyLevel: classification.urgencyLevel,
          responseProtocol: classification.responseProtocol,
          detectedLanguage: classification.detectedLanguage,
        },
        assignedStaff: assignedStaffData,
        autoAssigned: assignedStaffData.length > 0,
        confirmationMessage: classification.confirmationMessage,
        estimatedResponse:
          classification.severity >= 7 ? "1-2 minutes" : "2-4 minutes",
      });
    } catch (e: any) {
      console.error("SOS Trigger Error:", e);
      return res.status(500).json({ success: false, error: String(e) });
    }
  });

  let lastSimGenTime = 0;
  const SIM_GEN_COOLDOWN = 5 * 60 * 1000;

  app.post("/api/ai/generate-sim", async (req, res) => {
    if (Date.now() - lastSimGenTime < SIM_GEN_COOLDOWN) {
      return res.status(429).json({
        error: "Simulation cooldown active",
        retryAfter:
          Math.ceil((lastSimGenTime + SIM_GEN_COOLDOWN - Date.now()) / 1000) +
          " seconds",
      });
    }
    lastSimGenTime = Date.now();
    // Dummy simulate logic since route was missing
    res.json({ success: true, message: "Simulation generated" });
  });

  // NEW DRILL ROUTE
  app.post("/api/incidents/drill", (req, res) => {
    const { type, location, severity, urgencyLevel, description } = req.body;
    const incidentId = "inc-drill-" + Math.random().toString(36).substr(2, 9);

    // Auto-assign
    const availableStaff: any[] = MOCK_DB.staff.filter(
      (s: any) => s.status === "AVAILABLE",
    );
    let assignedStaffData: any[] = [];
    if (availableStaff.length > 0) {
      const staffNeeded = severity >= 6 ? 2 : 1;
      const chosenStaff = availableStaff.slice(0, staffNeeded);
      chosenStaff.forEach((s) => {
        s.status = "RESPONDING";
        s.assignedIncident = incidentId;
        s.location = location || "Unknown";
        assignedStaffData.push({ id: s.id, name: s.name, role: s.role });
      });
    }

    const newIncident = {
      id: incidentId,
      type: type || "FIRE",
      location: location || "Unknown",
      description: description || "Emergency drill in progress",
      severityScore: severity || 8,
      severity: severity || 8,
      urgencyLevel: urgencyLevel || "HIGH",
      status: assignedStaffData.length > 0 ? "RESPONDING" : "ACTIVE",
      assignedStaff: assignedStaffData,
      assigneeId: assignedStaffData.length > 0 ? assignedStaffData[0].id : null,
      timestamp: Date.now(),
      source: "AUTO_DETECT",
    };

    MOCK_DB.incidents.push(newIncident as any);
    notifyIncidentsSynced();

    io.emit("new_incident", {
      event: "new_incident",
      data: newIncident,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, incident: newIncident });
  });

  app.get("/api/incidents", (req, res) => {
    res.json({
      success: true,
      incidents: MOCK_DB.incidents,
      staff: MOCK_DB.staff,
    });
  });

  app.post("/api/incidents/:id/assign", (req, res) => {
    const { id } = req.params;
    const { staffId } = req.body;
    const inc = MOCK_DB.incidents.find((i) => i.id === id);
    const member = MOCK_DB.staff.find((s) => s.id === staffId);

    if (inc && member) {
      member.status = "RESPONDING";
      member.location = inc.location;
      member.assignedIncident = id;

      inc.assigneeId = staffId;
      inc.status = "RESPONDING";

      inc.assignedStaff = inc.assignedStaff || [];
      if (!inc.assignedStaff.some((s: any) => s.id === staffId)) {
        inc.assignedStaff.push({
          id: member.id,
          name: member.name,
          role: member.role,
        });
      }

      io.emit("staff_assigned", {
        event: "staff_assigned",
        data: {
          incidentId: id,
          assignedStaff: inc.assignedStaff,
          message: `Staff ${member.name} manually assigned to ${inc.location}`,
        },
      });

      notifyIncidentsSynced();
    }
    res.json({ success: true });
  });

  app.post("/api/tactical/deploy-backup", (req, res) => {
    const availableStaff: any[] = MOCK_DB.staff.filter(
      (s: any) => s.status === "AVAILABLE" || s.status === "ON_BREAK",
    );
    if (availableStaff.length > 0) {
      availableStaff.forEach((s) => {
        s.status = "RESPONDING";
        // Assign to first active if any
        const activeInc = MOCK_DB.incidents.find(
          (i) => i.status === "ACTIVE" || i.status === "RESPONDING",
        );
        if (activeInc) {
          s.assignedIncident = activeInc.id;
          s.location = activeInc.location;
          activeInc.assignedStaff = activeInc.assignedStaff || [];
          if (!activeInc.assignedStaff.some((ast: any) => ast.id === s.id)) {
            activeInc.assignedStaff.push({
              id: s.id,
              name: s.name,
              role: s.role,
            });
          }
        }
      });
      notifyIncidentsSynced();
      res.json({ success: true, deployedCount: availableStaff.length });
    } else {
      res.json({ success: false, deployedCount: 0 });
    }
  });

  // BUG 2 Helper: Resolve Incident Route Example
  app.post("/api/incidents/:id/resolve", (req, res) => {
    const { id } = req.params;
    const inc = MOCK_DB.incidents.find((i) => i.id === id);
    if (inc) {
      inc.status = "RESOLVED";

      // Free any staff assigned to this incident
      MOCK_DB.staff.forEach((s) => {
        if (s.assignedIncident === id || s.id === inc.assigneeId) {
          s.status = "AVAILABLE";
          s.assignedIncident = null;
          s.location = inc.location;
        }
      });

      notifyIncidentsSynced();
    }
    res.json({ success: true });
  });

  // Initialize Server-Side Simulations
  function initializeServerSimulations() {
    // If we loaded pre-existing incidents, do not trigger startup simulated anomalies
    if (MOCK_DB.incidents.length > 0) return;

    // 5 seconds start-up check
    setTimeout(() => {
      const incidentId =
        "inc-demo-security-" + Math.random().toString(36).substr(2, 9);
      const location = "Main Lobby";
      const type = "Security Alert";
      const description =
        "Intrusion Detection: Unidentified persona spotted pacing by the electrical cabinet rooms.";
      const severityScore = 7;
      const urgencyLevel = "HIGH";

      // Auto-assign
      const available = MOCK_DB.staff.filter((s) => s.status === "AVAILABLE");
      let assignedStaffList: any[] = [];
      let firstAssigneeId: string | null = null;
      let incidentStatus = "ACTIVE";

      if (available.length > 0) {
        const chosen = available.slice(0, 1);
        firstAssigneeId = chosen[0].id;
        incidentStatus = "RESPONDING";
        chosen[0].status = "RESPONDING";
        chosen[0].assignedIncident = incidentId;
        chosen[0].location = location;
        assignedStaffList = chosen.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
        }));

        io.emit("new_log", {
          level: "SYSTEM",
          message: `[AUTO-ASSIGNED] Dispatching ${chosen[0].name} to investigate security alert in Lobby.`,
        });
      }

      const inst = {
        id: incidentId,
        type,
        location,
        description,
        severity: "HIGH",
        severityScore,
        urgencyLevel,
        status: incidentStatus,
        assignedStaff: assignedStaffList,
        assigneeId: firstAssigneeId,
        timestamp: Date.now(),
        isProcessing: false,
        source: "AUTO_DETECT",
      };

      MOCK_DB.incidents.unshift(inst);
      notifyIncidentsSynced();

      io.emit("new_incident", {
        event: "new_incident",
        data: inst,
        timestamp: new Date().toISOString(),
      });

      io.emit("new_log", {
        level: "CRITICAL",
        message: `[REAL-TIME NOMAD SECURITY ALARM] Intruder alert near Electrical Storage Cabinets.`,
      });
    }, 5000);

    // 15 seconds start-up check
    setTimeout(() => {
      const incidentId =
        "inc-demo-medical-" + Math.random().toString(36).substr(2, 9);
      const location = "Pool Deck";
      const type = "Medical Emergency";
      const description =
        "Slip and Fall: Elderly individual tripped near sauna step, requesting urgent medical assessment.";
      const severityScore = 8;
      const urgencyLevel = "CRITICAL";

      const available = MOCK_DB.staff.filter((s) => s.status === "AVAILABLE");
      let assignedStaffList: any[] = [];
      let firstAssigneeId: string | null = null;
      let incidentStatus = "ACTIVE";

      if (available.length > 0) {
        const chosen = available.slice(0, 1);
        firstAssigneeId = chosen[0].id;
        incidentStatus = "RESPONDING";
        chosen[0].status = "RESPONDING";
        chosen[0].assignedIncident = incidentId;
        chosen[0].location = location;
        assignedStaffList = chosen.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
        }));

        io.emit("new_log", {
          level: "SYSTEM",
          message: `[AUTO-ASSIGNED] Medical emergency assigned to ${chosen[0].name}.`,
        });
      }

      const inst = {
        id: incidentId,
        type,
        location,
        description,
        severity: "CRITICAL",
        severityScore,
        urgencyLevel,
        status: incidentStatus,
        assignedStaff: assignedStaffList,
        assigneeId: firstAssigneeId,
        timestamp: Date.now(),
        isProcessing: false,
        source: "AUTO_DETECT",
      };

      MOCK_DB.incidents.unshift(inst);
      notifyIncidentsSynced();

      io.emit("new_incident", {
        event: "new_incident",
        data: inst,
        timestamp: new Date().toISOString(),
      });

      io.emit("new_log", {
        level: "CRITICAL",
        message: `[AUTOMATED MEDICAL RESPONSE] Slip & fall detected at Pool Deck.`,
      });
    }, 15000);

    // 30 seconds start-up check
    setTimeout(() => {
      const incidentId =
        "inc-demo-leak-" + Math.random().toString(36).substr(2, 9);
      const location = "Room 412";
      const type = "Water Leak";
      const description =
        "Utility Sensor Alert: High relative humidity and floor-wetness threshold exceeded in Room 412 bathroom.";
      const severityScore = 4;
      const urgencyLevel = "MEDIUM";

      const available = MOCK_DB.staff.filter((s) => s.status === "AVAILABLE");
      let assignedStaffList: any[] = [];
      let firstAssigneeId: string | null = null;
      let incidentStatus = "ACTIVE";

      if (available.length > 0) {
        const chosen = available.slice(0, 1);
        firstAssigneeId = chosen[0].id;
        incidentStatus = "RESPONDING";
        chosen[0].status = "RESPONDING";
        chosen[0].assignedIncident = incidentId;
        chosen[0].location = location;
        assignedStaffList = chosen.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
        }));

        io.emit("new_log", {
          level: "SYSTEM",
          message: `[AUTO-ASSIGNED] Plumbing/Maintenance assigned to ${chosen[0].name}.`,
        });
      }

      const inst = {
        id: incidentId,
        type,
        location,
        description,
        severity: "MEDIUM",
        severityScore,
        urgencyLevel,
        status: incidentStatus,
        assignedStaff: assignedStaffList,
        assigneeId: firstAssigneeId,
        timestamp: Date.now(),
        isProcessing: false,
        source: "AUTO_DETECT",
      };

      MOCK_DB.incidents.unshift(inst);
      notifyIncidentsSynced();

      io.emit("new_incident", {
        event: "new_incident",
        data: inst,
        timestamp: new Date().toISOString(),
      });

      io.emit("new_log", {
        level: "LOG",
        message: `[AUTOMATED PLUMBING LOG] High humidity detected inside Room 412 Bathroom.`,
      });
    }, 30000);
  }

  function startServerSimulator() {
    const scheduleNextSim = () => {
      const delay = Math.floor(Math.random() * (300000 - 180000 + 1) + 180000);
      setTimeout(() => {
        try {
          const locations = [
            "Room 401",
            "Room 402",
            "Room 403",
            "Room 404",
            "Room 405",
            "Room 406",
            "Room 407",
            "Room 408",
            "Room 409",
            "Room 412",
            "Main Lobby",
            "Pool Deck",
            "Restaurant",
            "Sauna",
          ];
          const location =
            locations[Math.floor(Math.random() * locations.length)];
          const simulatedTypes = [
            "MAINTENANCE",
            "SUSPICIOUS_ACTIVITY",
            "OTHER",
            "MEDICAL",
            "THEFT",
          ];
          const randomType =
            simulatedTypes[Math.floor(Math.random() * simulatedTypes.length)];
          const simulatedSeverities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
          const randomSev =
            simulatedSeverities[
              Math.floor(Math.random() * simulatedSeverities.length)
            ];
          const randomUrgency =
            randomSev >= 7
              ? "CRITICAL"
              : randomSev >= 5
                ? "HIGH"
                : randomSev >= 3
                  ? "MEDIUM"
                  : "LOW";

          const incidentId = "inc-" + Math.random().toString(36).substr(2, 9);
          const available = MOCK_DB.staff.filter(
            (s) => s.status === "AVAILABLE",
          );
          let assignedStaffList: any[] = [];
          let firstAssigneeId: string | null = null;
          let incidentStatus = "ACTIVE";

          if (available.length > 0) {
            const staffCountNeeded = randomSev >= 6 ? 2 : 1;
            const chosenStaff = available.slice(0, staffCountNeeded);
            if (chosenStaff.length > 0) {
              firstAssigneeId = chosenStaff[0].id;
              incidentStatus = "RESPONDING";
              assignedStaffList = chosenStaff.map((s) => {
                s.status = "RESPONDING";
                s.assignedIncident = incidentId;
                s.location = location;
                return { id: s.id, name: s.name, role: s.role };
              });

              chosenStaff.forEach((s) => {
                io.emit("new_log", {
                  level: "SYSTEM",
                  message: `[AUTO-ASSIGN] ${s.name} automatically assigned to ${randomType} at ${location}`,
                });
              });
            }
          }

          const inst = {
            id: incidentId,
            type: randomType,
            location,
            description: "Auto-detected anomaly",
            severity: randomUrgency,
            severityScore: randomSev,
            urgencyLevel: randomUrgency,
            status: incidentStatus,
            assignedStaff: assignedStaffList,
            assigneeId: firstAssigneeId,
            timestamp: Date.now(),
            isProcessing: false,
            source: "AUTO_DETECT",
          };

          MOCK_DB.incidents.unshift(inst);
          notifyIncidentsSynced();

          io.emit("new_incident", {
            event: "new_incident",
            data: inst,
            timestamp: new Date().toISOString(),
          });

          io.emit("new_log", {
            level: "SYSTEM",
            message: `Anomaly detected at ${location}. Type: ${randomType} (Sev: ${randomSev}/10)`,
          });

          const autoResolveTime = Math.floor(
            Math.random() * (300000 - 180000 + 1) + 180000,
          );
          setTimeout(() => {
            const found = MOCK_DB.incidents.find((i) => i.id === incidentId);
            if (
              found &&
              (found.status === "ACTIVE" || found.status === "RESPONDING")
            ) {
              found.status = "RESOLVED";
              MOCK_DB.staff.forEach((s) => {
                if (s.assignedIncident === incidentId) {
                  s.status = "AVAILABLE";
                  s.assignedIncident = null;
                  s.location = location;
                }
              });
              notifyIncidentsSynced();

              io.emit("new_log", {
                level: "SUCCESS",
                message: `Auto-resolved: ${found.type} at ${found.location} — All Clear`,
              });
            }
          }, autoResolveTime);
        } catch (err) {
          console.error("Simulation error on server:", err);
        }

        scheduleNextSim();
      }, delay);
    };

    scheduleNextSim();
  }

  initializeServerSimulations();
  startServerSimulator();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production setup
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log("Server with WebSockets running on port " + PORT);
  });
}

startServer();
