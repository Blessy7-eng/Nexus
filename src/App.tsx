/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Navigation,
  Search,
  Menu,
  Clock,
  Hotel,
  Plus,
  X,
  Users,
  Activity,
  Radio,
  Lock,
  Mic,
  ArrowRight,
  Loader2,
  LogOut,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { RoleSelector } from "./RoleSelector";
import { GuestDashboard } from "./GuestDashboard";
import {
  Incident,
  Staff,
  LogEntry,
  LogLevel,
  Severity,
  AIClassification,
} from "./types";
import {
  INITIAL_STAFF,
  INITIAL_INCIDENTS,
  INCIDENT_TYPES,
  LOCATIONS,
  SEVERITIES,
  FLOOR_PLAN_COORDS,
} from "./constants";
import { io } from "socket.io-client";

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function playBeep() {
  try {
    const audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.3,
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

function getSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state: { hasError: boolean; error: string };
  props: { children: React.ReactNode };

  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[NEXUS Error Boundary]", error);
  }

  render() {
    const self = this as any;
    if (self.state.hasError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-950 text-white flex-col gap-4">
          <div className="text-red-500 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-red-400">
            NEXUS System Error
          </h1>
          <p className="text-gray-400 text-sm max-w-md text-center">
            {self.state.error}
          </p>
          <button
            onClick={() => {
              self.setState({ hasError: false, error: "" });
              window.location.reload();
            }}
            className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700 transition"
          >
            RESTART NEXUS
          </button>
        </div>
      );
    }
    return self.props.children;
  }
}

export function StaffDashboard() {
  const [isDrillModeOpen, setIsDrillModeOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [aiHasNotification, setAiHasNotification] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  // State
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [staff, setStaff] = useState<Staff[]>(INITIAL_STAFF);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [mode, setMode] = useState<"NORMAL" | "ALERT">("NORMAL");
  const [selectedFloor, setSelectedFloor] = useState<"1" | "4" | "AMENITIES">(
    "4",
  );
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isPersonnelOpen, setIsPersonnelOpen] = useState(false);
  const [isTacticalOpen, setIsTacticalOpen] = useState(false);

  const resolvedTodayCount = incidents.filter(
    (i) => i.status === "RESOLVED",
  ).length;

  const [incidentFilter, setIncidentFilter] = useState<
    "ACTIVE_RESPONDING" | "RESOLVED" | "ALL"
  >("ACTIVE_RESPONDING");
  const [startTime] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Modals
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [is112Open, setIs112Open] = useState(false);
  const [isLockdownOpen, setIsLockdownOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [anomalyNotification, setAnomalyNotification] = useState<{
    type: string;
    location: string;
  } | null>(null);

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => {
        setToastMsg(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  useEffect(() => {
    if (anomalyNotification) {
      const timer = setTimeout(() => {
        setAnomalyNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [anomalyNotification]);

  const [isStaffAIOpen, setIsStaffAIOpen] = useState(false);
  const [staffChatInput, setStaffChatInput] = useState("");
  const [staffChatMessages, setStaffChatMessages] = useState<
    { sender: "ai" | "user"; text: string }[]
  >([]);
  const [staffChatLoading, setStaffChatLoading] = useState(false);
  const [isStaffChatRecording, setIsStaffChatRecording] = useState(false);

  const staffChatEndRef = useRef<HTMLDivElement>(null);
  const staffChatRecognitionRef = useRef<any>(null);

  useEffect(() => {
    if (staffChatEndRef.current)
      staffChatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [staffChatMessages]);

  const sendStaffChatMessage = async () => {
    if (!staffChatInput.trim() || staffChatLoading) return;
    const msg = staffChatInput.trim();
    setStaffChatInput("");
    setStaffChatMessages((prev) => [...prev, { sender: "user", text: msg }]);
    setStaffChatLoading(true);

    try {
      const res = await fetch("/api/ai/staff-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context: {
            activeIncidentCount: activeIncidents.length,
            staffAvailableCount: staff.filter((s) => s.status === "AVAILABLE")
              .length,
            staffRespondingCount: staff.filter((s) => s.status === "RESPONDING")
              .length,
            currentMode: mode,
            criticalIncidents: activeIncidents.filter(
              (i) => i.severity === "CRITICAL" || i.urgencyLevel === "CRITICAL",
            ).length,
          },
        }),
      });
      const data = await res.json();
      setStaffChatMessages((prev) => [
        ...prev,
        { sender: "ai", text: data.response },
      ]);
    } catch (e) {
      setStaffChatMessages((prev) => [
        ...prev,
        { sender: "ai", text: "Error connecting to NEXUS AI..." },
      ]);
    } finally {
      setStaffChatLoading(false);
    }
  };

  const [evacuationPlan, setEvacuationPlan] = useState<any>(null);
  const [isEvacuationMode, setIsEvacuationMode] = useState(false);
  const [isEvacuationPanelOpen, setIsEvacuationPanelOpen] = useState(true);
  const [sosText, setSosText] = useState("");
  const [sosLocation, setSosLocation] = useState("");
  const [sosProcessingState, setSosProcessingState] = useState<
    "IDLE" | "RECORDING" | "PROCESSING" | "DONE"
  >("IDLE");
  const [sosDoneMessages, setSosDoneMessages] = useState<string[]>([]);
  const [sosDetectedLanguage, setSosDetectedLanguage] = useState("");
  const recognitionRef = useRef<any>(null);

  const staffRef = useRef<Staff[]>(staff);
  const incidentsRef = useRef<Incident[]>(incidents);

  useEffect(() => {
    staffRef.current = staff;
  }, [staff]);

  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join("");
        setSosText(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== "no-speech") {
          console.error("Speech API Error:", event.error);
          setSosProcessingState("IDLE");
          if (event.error === "not-allowed") {
            alert("Microphone access denied. Please type instead.");
          }
        }
      };

      recognitionRef.current.onend = () => {
        setSosProcessingState("IDLE");
        if (sosText.trim().length > 0) {
          // Auto trigger would go here if we wanted it instantly, but user can click Send in this design to handle edits.
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [sosText]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      staffChatRecognitionRef.current = new SpeechRecognition();
      staffChatRecognitionRef.current.continuous = false;
      staffChatRecognitionRef.current.interimResults = true;
      staffChatRecognitionRef.current.lang = "";

      staffChatRecognitionRef.current.onresult = (event: any) => {
        const transcriptText = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
        setStaffChatInput(transcriptText);
      };

      staffChatRecognitionRef.current.onend = () => {
        setIsStaffChatRecording(false);
      };
    }
    return () => {
      if (staffChatRecognitionRef.current) {
        try {
          staffChatRecognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const startStaffChatRecording = () => {
    if (!staffChatRecognitionRef.current)
      return alert("Speech API not supported in this browser.");
    try {
      setStaffChatInput("");
      setIsStaffChatRecording(true);
      staffChatRecognitionRef.current.start();
    } catch (e: any) {
      console.error("Staff chat error:", e.message);
      setIsStaffChatRecording(false);
    }
  };

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Socket.IO and Centralized Listener
  useEffect(() => {
    const socket = io();

    socket.on("init_state", (payload) => {
      if (payload) {
        if (payload.incidents) {
          setIncidents(payload.incidents);
        }
        if (payload.staff) {
          setStaff(payload.staff);
        }
      }
    });

    socket.on("new_log", (payload) => {
      if (payload && payload.message) {
        handleAddLog(payload.level || "LOG", payload.message);
      }
    });

    // BUG 1 FIX: Centralized Firestore onSnapshot listener equivalent via WebSocket
    socket.on("incidents_synced", (payload) => {
      // Update ONE shared state that drives left panel, map, and counters
      setIncidents(payload.incidents);
      if (payload.staff) {
        setStaff(payload.staff);
      }
    });

    // BUG 3 FIX: Auto-assignment update
    socket.on("staff_assigned", (payload) => {
      const { assignedStaff, incidentId, message } = payload.data;
      if (assignedStaff && assignedStaff.length > 0) {
        assignedStaff.forEach((astaff: any) => {
          setStaff((prev) =>
            prev.map((s) =>
              s.id === astaff.id ? { ...s, status: "RESPONDING" } : s,
            ),
          );
          handleAddLog(
            "SYSTEM",
            `[AUTO-ASSIGN] ${astaff.name} assigned to incident ${incidentId}`,
          );
        });
      } else {
        handleAddLog("SYSTEM", `[AUTO-ASSIGN] Update: ${message}`);
      }
    });

    socket.on("no_staff_available", () => {
      handleAddLog(
        "HIGH",
        `[WARNING] No available staff for auto-assignment — manual assignment required`,
      );
    });

    socket.on("incident_classified", (payload) => {
      if (!payload?.data) return;
      const { incidentId, classification, urgencyLevel, type, severity } =
        payload.data;

      const cleanUrgency =
        classification?.urgencyLevel || urgencyLevel || "MEDIUM";
      const cleanType = classification?.type || type || "OTHER";
      const score = classification?.severityScore || severity || 5;

      setIncidents((prev) => {
        if (!prev) return [];
        return prev.map((i) =>
          i && i.id === incidentId
            ? {
                ...i,
                isProcessing: false,
                severity: cleanUrgency as unknown as Severity,
                type: cleanType,
                urgencyLevel: cleanUrgency,
                severityScore: score,
                classification: classification || payload.data,
              }
            : i,
        );
      });
      handleAddLog(
        "SUCCESS",
        `AI Classified ${incidentId} as ${cleanType} (Sev: ${cleanUrgency})`,
      );
    });

    socket.on("evacuation_updated", (payload) => {
      setEvacuationPlan(payload.data);
      if (payload.data.overallRiskLevel === "CRITICAL") {
        setIsEvacuationMode(true);
        setIsEvacuationPanelOpen(true);
      }
    });

    socket.on("new_incident", (payload) => {
      playBeep();
      if (payload.data) {
        if (
          payload.data.source === "AUTO_DETECT" ||
          payload.data.description === "Auto-detected anomaly" ||
          payload.data.description?.toLowerCase().includes("anomaly")
        ) {
          setAnomalyNotification({
            type: payload.data.type || "UNKNOWN",
            location: payload.data.location || "Unknown",
          });
        } else if (
          payload.data.source === "SOS_TRIGGER" ||
          payload.data.source === "GUEST_SOS"
        ) {
          if (payload.data.source === "GUEST_SOS") {
            setToastMsg(`Guest Emergency: Room ${payload.data.roomNumber}`);
          } else {
            setToastMsg(
              `SOS Triggered: ${payload.data.type} at ${payload.data.location}`,
            );
          }
        }
      }
    });

    socket.on("sos_received", (payload) => {
      const incidentId = "inc-" + generateId();
      const newIncident: Incident = {
        id: incidentId,
        type: payload.data.extractedIncident.type,
        location: payload.data.extractedIncident.location,
        description: payload.data.extractedIncident.description,
        severity: "CRITICAL",
        status: "ACTIVE",
        assigneeId: null,
        timestamp: Date.now(),
        isProcessing: true,
      };
      // Note: the backend process-sos route now adds to MOCK_DB and emits incidents_synced,
      // but we optimistically update here as well.
      setIncidents((prev) => [newIncident, ...prev]);
      playBeep();
      setToastMsg(
        `New Incident: ${newIncident.type} at ${newIncident.location}`,
      );

      // Trigger classification
      fetch("/api/ai/classify-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: newIncident.id,
          description: newIncident.description,
          location: newIncident.location,
        }),
      }).catch((e) => console.error("Classification submit error:", e));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Initialize from LocalStorage or Constants
  useEffect(() => {
    const savedIncidents = localStorage.getItem("nexus_incidents");
    const savedLogs = localStorage.getItem("nexus_logs");

    if (savedIncidents) {
      try {
        setIncidents(JSON.parse(savedIncidents));
      } catch (e) {
        setIncidents(INITIAL_INCIDENTS);
      }
    } else {
      setIncidents(INITIAL_INCIDENTS);
    }

    if (savedLogs) {
      try {
        setLogs(JSON.parse(savedLogs));
      } catch (e) {
        handleAddLog(
          "SYSTEM",
          "NEXUS Command Center Initialized. All systems operational.",
        );
      }
    } else {
      handleAddLog(
        "SYSTEM",
        "NEXUS Command Center Initialized. All systems operational.",
      );
    }

    // Load staff state from localStorage or INITIAL_STAFF
    const savedStaff = localStorage.getItem("nexus_staff");
    if (savedStaff) {
      try {
        const parsedStaff: Staff[] = JSON.parse(savedStaff);
        setStaff(parsedStaff);
      } catch (e) {
        setStaff(INITIAL_STAFF);
      }
    } else {
      setStaff(INITIAL_STAFF);
    }

    // Timer interval
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem("nexus_incidents", JSON.stringify(incidents));
  }, [incidents]);

  useEffect(() => {
    localStorage.setItem("nexus_logs", JSON.stringify(logs));
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0; // scroll to top since new items are prepended
    }
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("nexus_staff", JSON.stringify(staff));
  }, [staff]);

  // Note: Simulation schedules and auto-anomalies are managed on-demand by the Command Center backend.
  // All active and resolved logs are synchronized in real-time over the socket connection.

  const toggleSosVoice = () => {
    if (sosProcessingState === "RECORDING") {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        alert("Voice not supported in this browser — please type below");
        return;
      }
      setSosText("");
      setSosProcessingState("RECORDING");
      recognitionRef.current.start();
    }
  };

  const sendSosUnified = async () => {
    if (!sosText.trim() && !sosLocation) return;
    setSosProcessingState("PROCESSING");

    setTimeout(() => {
      setSosDoneMessages(["🔄 AI Analyzing your emergency..."]);
    }, 500);

    try {
      const resp = await fetch("/api/sos/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: sosText,
          location: sosLocation,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await resp.json();

      if (data.success) {
        const c = data.classification;
        setTimeout(() => {
          setSosDoneMessages((prev) => [
            ...prev,
            `✓ Classified: ${c.type} — Severity ${c.severity}/10`,
          ]);
          setTimeout(() => {
            if (data.assignedStaff && data.assignedStaff.length > 0) {
              setSosDoneMessages((prev) => [
                ...prev,
                `✓ Staff Assigned: ${data.assignedStaff[0].name}`,
              ]);
            } else {
              setSosDoneMessages((prev) => [
                ...prev,
                `⚠ No staff available — Alert sent to command`,
              ]);
            }
            setTimeout(() => {
              setSosDoneMessages((prev) => [
                ...prev,
                `✓ ${data.confirmationMessage || "Alert received."}`,
              ]);
              setTimeout(() => {
                setSosDoneMessages((prev) => [
                  ...prev,
                  `🚑 Response ETA: ${data.estimatedResponse}`,
                ]);
                setSosProcessingState("DONE");
              }, 1000);
            }, 1000);
          }, 1000);
        }, 1000);
      } else {
        setSosDoneMessages((prev) => [
          ...prev,
          "⚠ System Error: Alert sent without classification",
        ]);
        setTimeout(() => {
          setSosProcessingState("DONE");
        }, 1500);
      }
    } catch (e: any) {
      console.error("Emergency trigger error:", e.message);
      setSosDoneMessages((prev) => [
        ...prev,
        "❌ Error triggering emergency. Staff informed.",
      ]);
      setSosProcessingState("DONE");
    }
  };

  const handleAddLog = (level: LogLevel, message: string) => {
    setLogs((prev) => {
      // Prevent duplicate messages within 2 seconds
      const isDuplicate = prev.some(
        (log) => log.message === message && Date.now() - log.timestamp < 2000,
      );
      if (isDuplicate) return prev;

      const newLog: LogEntry = {
        id: generateId(),
        timestamp: Date.now(),
        level,
        message,
      };
      return [newLog, ...prev].slice(0, 50); // keep last 50
    });
  };

  const activeIncidents = incidents
    .filter((i) => i != null && i !== undefined)
    .filter((i) => i.status === "ACTIVE" || i.status === "RESPONDING")
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const filteredIncidents = incidents
    .filter((i) => i != null && i !== undefined)
    .filter((i) => {
      if (incidentFilter === "ACTIVE_RESPONDING") {
        return i.status === "ACTIVE" || i.status === "RESPONDING";
      }
      if (incidentFilter === "RESOLVED") {
        return i.status === "RESOLVED";
      }
      return true; // ALL
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const criticalCount = activeIncidents.filter(
    (i) => i != null && i !== undefined && i.severity === "CRITICAL",
  ).length;

  useEffect(() => {
    if (criticalCount > 0 && mode !== "ALERT") setMode("ALERT");
    else if (criticalCount === 0 && mode === "ALERT") setMode("NORMAL");
  }, [criticalCount, mode]);

  useEffect(() => {
    const hasCritical = activeIncidents.some(
      (i) => i.urgencyLevel === "CRITICAL",
    );
    if (hasCritical) setAiHasNotification(true);
  }, [activeIncidents]);

  useEffect(() => {
    if (isStaffAIOpen) {
      setAiHasNotification(false);
    }
  }, [isStaffAIOpen]);

  const [deployBackupState, setDeployBackupState] = useState("IDLE");

  const handleDeployBackup = async () => {
    setDeployBackupState("DEPLOYING");
    try {
      const resp = await fetch("/api/tactical/deploy-backup", {
        method: "POST",
      });
      const data = await resp.json();
      if (data.success && data.deployedCount > 0) {
        setDeployBackupState("SUCCESS");
        setToastMsg(`Backup Deployed: ${data.deployedCount} staff mobilized`);
        setTimeout(() => {
          setDeployBackupState("IDLE");
        }, 10000);
      } else {
        setDeployBackupState("FAILED");
        setTimeout(() => setDeployBackupState("IDLE"), 5000);
      }
    } catch (e) {
      setDeployBackupState("FAILED");
      setTimeout(() => setDeployBackupState("IDLE"), 3000);
    }
  };

  const toggleLockdown = () => {
    setMode("ALERT");
    handleAddLog(
      "SYSTEM",
      "Emergency Protocol Locked Down. All access points restricted.",
    );
    handleAddLog("CRITICAL", "BROADCAST LOCKDOWN INITIATED");
    setToastMsg("Lockdown Initiated");
    playBeep();
    setIsLockdownOpen(false);
  };

  const triggerBuiltInDrill = async (
    drillType: "FIRE" | "MEDICAL" | "SECURITY" | "LEAK",
  ) => {
    let type = "";
    let location = "";
    let description = "";
    let severityScore = 5;
    let urgencyLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";

    if (drillType === "FIRE") {
      type = "Fire Alarm";
      location = "Floor 4";
      description =
        "Drill Trigger: Heavy smoke detected on Level 4 mechanical room. Fire control systems active.";
      severityScore = 9;
      urgencyLevel = "CRITICAL";
    } else if (drillType === "MEDICAL") {
      type = "Medical Emergency";
      location = "Pool";
      description =
        "Drill Trigger: Unconscious guest on pool deck. Staff-initiated medical emergency drill.";
      severityScore = 8;
      urgencyLevel = "CRITICAL";
    } else if (drillType === "SECURITY") {
      type = "Security Alert";
      location = "Lobby";
      description =
        "Drill Trigger: Trespasser trying to bypass security barriers to private server rooms.";
      severityScore = 6;
      urgencyLevel = "HIGH";
    } else if (drillType === "LEAK") {
      type = "Water Leak";
      location = "R412";
      description =
        "Drill Trigger: Level 4 pipe leakage reported. Moderate utility room pooling.";
      severityScore = 4;
      urgencyLevel = "MEDIUM";
    }

    try {
      await fetch("/api/incidents/drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          location,
          severity: severityScore,
          urgencyLevel,
          description,
        }),
      });
      handleAddLog(
        "CRITICAL",
        `[EMERGENCY DRILL TRIGGERED] ${type} at ${location}!`,
      );
      setToastMsg(`Drill Triggered: ${type} at ${location}`);
      playBeep();
    } catch (e: any) {
      console.error("Drill trigger error:", e.message);
    }
  };

  const resolveIncident = async (id: string) => {
    // We update locally first so simulator incidents (which only exist frontend) can be resolved
    const incident = incidents.find((i) => i.id === id);
    setIncidents((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "RESOLVED" } : i)),
    );

    if (incident) {
      handleAddLog(
        "SUCCESS",
        `Incident Resolved: ${incident.type} at ${incident.location}`,
      );

      // Reset manually assigned staff
      if (incident.assigneeId) {
        setStaff((prev) =>
          prev.map((s) =>
            s.id === incident.assigneeId
              ? {
                  ...s,
                  status: "AVAILABLE",
                  location: incident.location,
                  assignedIncident: null,
                }
              : s,
          ),
        );
      }

      // Reset auto-assigned staff from array
      if (incident.assignedStaff && incident.assignedStaff.length > 0) {
        incident.assignedStaff.forEach((assignedMember: any) => {
          setStaff((prev) =>
            prev.map((s) =>
              s.id === assignedMember.id || s.name === assignedMember.name
                ? {
                    ...s,
                    status: "AVAILABLE",
                    location: incident.location,
                    assignedIncident: null,
                  }
                : s,
            ),
          );
          handleAddLog(
            "SUCCESS",
            `${assignedMember.name} returned ` + `to available status`,
          );
        });
      }
    }

    // Call backend to persist resolution and trigger centralized sync (if backend knows it)
    await fetch(`/api/incidents/${id}/resolve`, { method: "POST" }).catch((e) =>
      console.error("Resolve error:", e),
    );
  };

  // Fixed Timer Refs for Auto Resolve
  const timerRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    // Check for incidents that need auto-resolve
    incidents.forEach((incident) => {
      if (incident.status === "ACTIVE" || incident.status === "RESPONDING") {
        const shouldAutoResolve =
          incident.source === "AUTO_DETECT" ||
          (incident.severityScore <= 6 && incident.source !== "SOS_TRIGGER");

        if (shouldAutoResolve && !timerRefs.current[incident.id]) {
          const getAutoResolveTime = (severity: number) => {
            if (severity >= 9) return Math.random() * 240000 + 480000; // 8-12 min
            if (severity >= 7) return Math.random() * 180000 + 300000; // 5-8 min
            if (severity >= 5) return Math.random() * 120000 + 180000; // 3-5 min
            if (severity >= 3) return Math.random() * 60000 + 120000; // 2-3 min
            return Math.random() * 60000 + 60000; // 1-2 min
          };

          const autoResolveMs = getAutoResolveTime(incident.severityScore || 5);

          timerRefs.current[incident.id] = setTimeout(() => {
            resolveIncident(incident.id);
            delete timerRefs.current[incident.id];
          }, autoResolveMs);
        }
      }
    });

    return () => {
      Object.values(timerRefs.current).forEach(clearTimeout);
    };
  }, [incidents]);

  // Fix 5 — Staff Consistency Check
  useEffect(() => {
    const consistencyCheck = setInterval(() => {
      setStaff((prevStaff) =>
        prevStaff.map((s) => {
          if (s.status !== "RESPONDING") return s;

          // Check if assigned incident still exists and is still active
          const assignedIncident = incidentsRef.current.find(
            (i) =>
              (i.assigneeId === s.id ||
                i.assignedStaff?.some(
                  (a: any) => a.id === s.id || a.name === s.name,
                )) &&
              (i.status === "ACTIVE" || i.status === "RESPONDING"),
          );

          if (!assignedIncident) {
            handleAddLog("LOG", `${s.name} freed — no active incident`);
            return {
              ...s,
              status: "AVAILABLE",
              assignedIncident: null,
            };
          }
          return s;
        }),
      );
    }, 30000); // Check every 30s
    return () => clearInterval(consistencyCheck);
  }, [incidents]);

  // Fix 4 — Staff Rotation Simulation
  useEffect(() => {
    const staffRotation = setInterval(() => {
      setStaff((prevStaff) =>
        prevStaff.map((s) => {
          // Don't touch RESPONDING staff
          if (s.status === "RESPONDING") return s;

          // Random chance of status change (20%)
          if (Math.random() > 0.2) return s;

          // ON_BREAK staff come back to AVAILABLE
          if (s.status === "ON_BREAK") {
            handleAddLog("LOG", `${s.name} returned from break — Available`);
            return {
              ...s,
              status: "AVAILABLE",
              location: ["Lobby", "Floor 4", "Pool"][
                Math.floor(Math.random() * 3)
              ],
            };
          }

          // AVAILABLE staff randomly go on break (10%)
          if (s.status === "AVAILABLE" && Math.random() < 0.1) {
            // Only if at least 2 others are available
            const availableCount = prevStaff.filter(
              (st) => st.status === "AVAILABLE" && st.id !== s.id,
            ).length;

            if (availableCount >= 2) {
              handleAddLog("LOG", `${s.name} on break — returns in 5 mins`);
              return { ...s, status: "ON_BREAK" };
            }
          }

          return s;
        }),
      );
    }, 60000); // Check every 60 seconds

    return () => clearInterval(staffRotation);
  }, []);

  const assignStaffToIncident = async (staffId: string, incidentId: string) => {
    const incident = incidents.find((i) => i.id === incidentId);
    setIncidents((prev) =>
      prev.map((i) =>
        i.id === incidentId
          ? { ...i, assigneeId: staffId, status: "RESPONDING" }
          : i,
      ),
    );
    setStaff((prev) =>
      prev.map((s) =>
        s.id === staffId
          ? { ...s, status: "RESPONDING", location: incident?.location || null }
          : s,
      ),
    );
    const assignedStaff = staff.find((s) => s.id === staffId);
    if (incident && assignedStaff) {
      handleAddLog(
        "LOG",
        `Staff ${assignedStaff.name} assigned to ${incident.location}`,
      );
    }

    try {
      await fetch(`/api/incidents/${incidentId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ staffId }),
      });
    } catch (e) {
      console.error("[NEXUS-ASSIGN] Error POSTing manual assignment:", e);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}]`;
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return "Just now";
    let date;
    if (timestamp?.toDate) {
      date = timestamp.toDate(); // Firestore Timestamp
    } else if (timestamp?.seconds) {
      date = new Date(timestamp.seconds * 1000); // Firestore object
    } else if (typeof timestamp === "string") {
      date = new Date(timestamp); // ISO string
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp); // milliseconds
    } else {
      return "Just now";
    }
    if (isNaN(date.getTime())) return "Just now";
    const diff = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff === 1) return "1m ago";
    if (diff < 60) return diff + "m ago";
    const hrs = Math.floor(diff / 60);
    return hrs + "h ago";
  };

  const severityColors: any = {
    CRITICAL: "text-white bg-red-600",
    HIGH: "text-white bg-orange-600",
    MEDIUM: "text-black bg-yellow-400",
    LOW: "text-white bg-blue-600",
  };

  const levelColors = {
    CRITICAL: "text-critical",
    HIGH: "text-high",
    MEDIUM: "text-safe",
    SYSTEM: "text-info",
    LOG: "text-text-secondary",
    SUCCESS: "text-success",
  };

  // Header Counters
  const onDutyCount = staff.filter((s) => s.status !== "OFF_FLOOR").length;
  const avgResponseSecs = Math.floor((now - startTime) / 1000);
  const avgResponseStr = `${Math.floor(avgResponseSecs / 60)
    .toString()
    .padStart(2, "0")}:${(avgResponseSecs % 60).toString().padStart(2, "0")}`;

  return (
    <div className="h-screen md:h-screen w-full flex flex-col bg-primary text-text-primary overflow-y-auto md:overflow-hidden font-sans select-none min-w-0 staff-dashboard">
      {/* HEADER */}
      <header className="h-14 md:h-16 lg:h-20 border-b border-border px-3 md:px-4 lg:px-6 flex items-center justify-between shrink-0 bg-primary z-[60] w-full fixed top-0 select-none">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-xl md:text-2xl lg:text-3xl">🏨</div>
          <div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <h1 className="text-base md:text-lg lg:text-2xl font-bold tracking-tighter text-high">
                NEXUS
              </h1>
              <span className="hidden md:inline text-[8px] md:text-[10px] text-info font-mono tracking-widest border border-info/30 px-1 rounded">
                COMMAND CENTER
              </span>
            </div>
            <p className="hidden md:block text-[7px] md:text-[8px] lg:text-[9px] text-text-secondary uppercase tracking-wider">
              Accelerated Emergency Response
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 lg:gap-8">
          {/* Stats Row */}
          <div className="flex gap-3 sm:gap-4 md:gap-6">
            <div className="text-center">
              <p className="text-[8px] md:text-[10px] text-text-secondary uppercase hidden sm:block">
                Active
              </p>
              <p className="text-sm md:text-base lg:text-xl font-bold text-critical leading-tight">
                {activeIncidents.length.toString().padStart(2, "0")}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[8px] md:text-[10px] text-text-secondary uppercase hidden sm:block">
                Staff
              </p>
              <p className="text-sm md:text-base lg:text-xl font-bold text-info leading-tight">
                {onDutyCount.toString().padStart(2, "0")}
              </p>
            </div>
            <div className="text-center hidden md:block">
              <p className="text-[8px] md:text-[10px] text-text-secondary uppercase truncate">
                Response
              </p>
              <p className="text-sm md:text-base lg:text-xl font-bold text-high leading-tight">
                {avgResponseStr}
              </p>
            </div>
            <div className="text-center hidden md:block">
              <p className="text-[8px] md:text-[10px] text-text-secondary uppercase">
                Resolved
              </p>
              <p className="text-sm md:text-base lg:text-xl font-bold text-success leading-tight">
                {resolvedTodayCount.toString().padStart(2, "0")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 lg:gap-4 border-l border-border pl-2 md:pl-4 lg:pl-6">
            <div
              className={`flex items-center gap-1 md:gap-2 ${mode === "ALERT" ? "bg-critical/10 border border-critical/40" : "bg-success/10 border border-success/40"} px-1.5 md:px-3 py-1 rounded-full`}
            >
              <span
                className={`w-2 h-2 rounded-full ${mode === "ALERT" ? "bg-critical shadow-[0_0_8px_#EF4444]" : "bg-success shadow-[0_0_8px_#10B981]"}`}
              ></span>
              <span
                className={`hidden md:inline text-[11px] font-bold ${mode === "ALERT" ? "text-critical" : "text-success"}`}
              >
                {mode === "ALERT" ? "ALERT MODE" : "SYSTEM NORMAL"}
              </span>
            </div>

            <button
              onClick={() => {
                sessionStorage.removeItem("nexus_staff_auth");
                navigate("/");
              }}
              className="text-text-secondary hover:text-white text-xs flex items-center gap-1 transition cursor-pointer p-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-text-secondary hover:text-white shrink-0" />
              <span className="hidden md:inline text-xs">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT CONTAINER */}
      <main
        className={`flex-1 flex overflow-y-auto md:overflow-hidden w-full mt-14 md:mt-16 lg:mt-20 flex-col md:flex-row transition-all duration-300 ${logExpanded ? "pb-44 md:pb-52" : "pb-14 md:pb-16"}`}
      >
        {/* LEFT PANEL: FEED */}
        {isFeedOpen && (
          <>
            {/* Mobile/Tablet Backdrop overlay */}
            <div
              className="lg:hidden fixed top-14 md:top-16 lg:top-20 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-xs z-30 transition-opacity duration-300 pointer-events-auto"
              onClick={() => setIsFeedOpen(false)}
            />
            <aside className="fixed lg:static top-14 md:top-16 lg:top-20 left-0 h-[calc(100vh-theme(spacing.14))] md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh-theme(spacing.20))] w-[280px] md:w-[320px] lg:w-[240px] xl:w-[280px] bg-secondary border-r border-border flex flex-col shrink-0 z-40 lg:z-0 animate-in slide-in-from-left duration-300">
              <div className="p-4 border-b border-border flex flex-col gap-2 shrink-0 bg-secondary">
                <div className="flex justify-between items-center bg-secondary">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                    Emergency Feed
                  </h2>
                  <div className="flex items-center gap-1.5 bg-secondary">
                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/70">
                      Priority
                    </span>
                    <button
                      onClick={() => setIsFeedOpen(false)}
                      className="text-text-secondary hover:text-white hover:bg-white/10 p-1 rounded transition cursor-pointer"
                      title="Collapse Feed"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex bg-primary/40 p-1 rounded-md border border-border/50">
                  {[
                    { id: "ACTIVE_RESPONDING", label: "Active/Responding" },
                    { id: "RESOLVED", label: "Resolved" },
                    { id: "ALL", label: "All Logged" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setIncidentFilter(tab.id as any)}
                      className={`flex-1 text-[9px] font-bold py-1 px-1 rounded transition text-center truncate ${
                        incidentFilter === tab.id
                          ? "bg-info/20 text-info font-bold border border-info/20"
                          : "text-text-secondary hover:text-white hover:bg-white/5"
                      }`}
                      title={tab.label}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredIncidents.length === 0 ? (
                  <div className="text-center p-6 text-text-secondary text-sm">
                    No incidents found matching filter.
                  </div>
                ) : (
                  filteredIncidents.map((inc) => {
                    // NULL GUARD — skip undefined incidents
                    if (!inc || !inc.id) return null;

                    const isActive = inc.id === activeIncidentId;
                    const assignee = staff.find((s) => s.id === inc.assigneeId);

                    const urgencyLevel =
                      inc.urgencyLevel || inc.severity || "MEDIUM";
                    const severityScore =
                      typeof inc.severity === "number"
                        ? inc.severity
                        : inc.classification?.severityScore || 5;
                    const incidentType = inc.type || "OTHER";
                    const incidentLocation = inc.location || "Unknown";
                    const incidentDescription =
                      inc.description || "Processing...";

                    return (
                      <div
                        key={inc.id}
                        onClick={() =>
                          setActiveIncidentId(isActive ? null : inc.id)
                        }
                        className={`bg-card border-l-4 p-3 rounded-r cursor-pointer transition duration-300 ${
                          urgencyLevel === "CRITICAL"
                            ? "border-critical " +
                              (isActive
                                ? "ring-1 ring-white/10 bg-white/[0.02]"
                                : "")
                            : urgencyLevel === "HIGH"
                              ? "border-high " +
                                (isActive
                                  ? "ring-1 ring-white/10 bg-white/[0.02]"
                                  : "opacity-90")
                              : "border-safe " +
                                (isActive
                                  ? "ring-1 ring-white/10 bg-white/[0.02]"
                                  : "opacity-75 hover:opacity-100")
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1 flex-wrap gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {inc.isProcessing ? (
                              <span className="text-[9px] font-bold px-1.5 rounded bg-info/20 text-info animate-pulse">
                                ● AI Analyzing...
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] uppercase font-bold px-1.5 rounded ${severityColors[urgencyLevel as any] || "text-white bg-gray-600"}`}
                              >
                                {urgencyLevel}
                              </span>
                            )}
                            {(inc as any).source === "SOS_TRIGGER" && (
                              <span className="text-[9px] text-red-500 font-bold bg-red-950/50 border border-red-500/50 px-1 rounded flex items-center gap-1 animate-pulse">
                                🚨 SOS
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-text-secondary">
                            {getTimeAgo(inc.timestamp)}
                          </span>
                        </div>

                        {/* Status Badge Line */}
                        <div className="flex items-center justify-between mb-2">
                          {inc.status === "RESOLVED" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30 flex items-center gap-1">
                              ✓ Resolved
                            </span>
                          ) : inc.status === "RESPONDING" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/30 flex items-center gap-1">
                              ⚡ Responding
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-critical/15 text-critical border border-critical/30 flex items-center gap-1 animate-pulse">
                              📡 Active
                            </span>
                          )}
                        </div>

                        <h3
                          className={`text-sm font-semibold flex items-center gap-2 ${urgencyLevel !== "CRITICAL" && !isActive ? "text-white/90" : "text-white"}`}
                        >
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              incidentType === "MEDICAL"
                                ? "bg-red-600 text-white"
                                : incidentType === "FIRE"
                                  ? "bg-orange-600 text-white"
                                  : incidentType === "THEFT"
                                    ? "bg-yellow-600 text-white"
                                    : incidentType === "ASSAULT"
                                      ? "bg-red-800 text-white"
                                      : incidentType === "SUSPICIOUS_ACTIVITY"
                                        ? "bg-purple-600 text-white"
                                        : incidentType === "EVACUATION"
                                          ? "bg-red-600 text-white animate-pulse"
                                          : incidentType === "MAINTENANCE"
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-600 text-white"
                            }`}
                          >
                            {incidentType}
                          </span>
                        </h3>

                        <div className="flex items-center gap-2 mt-1 mb-2">
                          <span className="text-[10px] text-gray-400">
                            Sev:
                          </span>
                          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${(severityScore / 10) * 100}%`,
                                backgroundColor:
                                  severityScore >= 7
                                    ? "#ef4444"
                                    : severityScore >= 4
                                      ? "#f97316"
                                      : "#eab308",
                              }}
                            />
                          </div>
                          <span
                            className="text-[10px] font-bold"
                            style={{
                              color:
                                severityScore >= 7
                                  ? "#ef4444"
                                  : severityScore >= 4
                                    ? "#f97316"
                                    : "#eab308",
                            }}
                          >
                            {severityScore}/10
                          </span>
                        </div>

                        <p
                          className="text-[11px] text-text-secondary mb-2 truncate"
                          title={`${incidentLocation} — ${incidentDescription}`}
                        >
                          {incidentLocation} — {incidentDescription}
                        </p>
                        {inc.source === "GUEST_SOS" && inc.roomNumber && (
                          <p className="text-cyan-400 font-bold text-[10px] mb-2 uppercase">
                            📱 Room {inc.roomNumber} triggered this SOS
                          </p>
                        )}

                        {(inc.classification ||
                          typeof inc.severity === "number") && (
                          <div className="mb-2">
                            {isActive && inc.responseProtocol && (
                              <div className="p-2 bg-black/20 border border-white/5 rounded mt-2">
                                <p className="text-[10px] font-bold text-info mb-1 uppercase">
                                  Response Protocol
                                </p>
                                <p className="text-[10px] text-white/80 mb-2 leading-relaxed">
                                  {inc.responseProtocol ||
                                    inc.classification?.responseProtocol}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          {inc.roomNumber && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetch("/api/notifications/guest", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    roomNumber: inc.roomNumber,
                                    message: "Help is on the way ✓",
                                    staffName: "Command Center",
                                  }),
                                }).then(() =>
                                  setToastMsg(
                                    `Room ${inc.roomNumber} Notified`,
                                  ),
                                );
                              }}
                              className="flex-1 bg-info/20 text-info py-1.5 rounded border border-info/40 text-[10px] font-bold hover:bg-info/30 transition flex items-center justify-center gap-1 mb-2"
                              title="Send quick notification to guest"
                            >
                              📢 NOTIFY GUEST
                            </button>
                          )}
                        </div>

                        <div className="mt-2 pt-2 border-t border-border flex justify-between items-center text-xs">
                          {inc.assignedStaff && inc.assignedStaff.length > 0 ? (
                            <span className="text-[10px] text-white flex flex-col gap-1">
                              {inc.assignedStaff.map(
                                (staffObj: any, idx: number) => (
                                  <span
                                    key={staffObj.id || idx}
                                    className="flex items-center gap-1"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shadow-[0_0_4px_#22c55e]"></span>
                                    🤖 {staffObj.name}
                                  </span>
                                ),
                              )}
                            </span>
                          ) : assignee ? (
                            <span className="text-[10px] text-white flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shadow-[0_0_4px_#22c55e]"></span>
                              {(inc as any).source === "SOS_TRIGGER"
                                ? "🤖 "
                                : ""}
                              {assignee.name}
                            </span>
                          ) : (
                            <span className="text-[10px] text-orange-400 flex items-center gap-1">
                              ⚠ Unassigned
                            </span>
                          )}

                          {isActive && inc.status !== "RESOLVED" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                resolveIncident(inc.id);
                              }}
                              className="text-[9px] uppercase tracking-wider bg-success/20 text-success px-2 py-0.5 rounded border border-success/40 transition hover:bg-success hover:text-white"
                            >
                              Mark Resolved
                            </button>
                          ) : assignee ? (
                            <span
                              className={`text-[9px] uppercase font-bold ${
                                urgencyLevel === "CRITICAL"
                                  ? "text-critical"
                                  : urgencyLevel === "HIGH"
                                    ? "text-high"
                                    : "text-safe"
                              }`}
                            >
                              {assignee.status === "RESPONDING"
                                ? "Responding"
                                : "On Route"}
                            </span>
                          ) : inc.status !== "RESOLVED" ? (
                            <button className="text-[9px] bg-safe/20 text-safe px-2 py-0.5 rounded border border-safe/40">
                              Assign
                            </button>
                          ) : (
                            <span className="text-[9px] text-success font-semibold flex items-center gap-1">
                              ✓ Completed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </>
        )}

        {/* CENTER PANEL: FLOOR MAP */}
        <section className="flex-1 md:flex-1 w-full md:w-auto h-[450px] md:h-auto flex flex-col relative bg-primary p-2 md:p-4 lg:p-6 overflow-hidden">
          {/* Floating Hamburger Toggle Button */}
          {!isFeedOpen && (
            <button
              onClick={() => setIsFeedOpen(true)}
              className="absolute left-2 md:left-4 top-[14px] z-30 w-10 h-10 bg-secondary/95 hover:bg-white/10 border border-border rounded-full flex items-center justify-center text-text-secondary hover:text-white transition duration-200 cursor-pointer shadow-xl hover:scale-105 active:scale-95"
              title="Open Emergency Feed"
            >
              <Menu className="w-5 h-5 text-info" />
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-critical border-2 border-secondary rounded-full animate-pulse" />
            </button>
          )}

          {/* Floating Personnel Toggle Button */}
          {!isPersonnelOpen && (
            <button
              onClick={() => setIsPersonnelOpen(true)}
              className="absolute right-2 md:right-4 top-[14px] z-30 w-10 h-10 bg-secondary/95 hover:bg-white/10 border border-border rounded-full flex items-center justify-center text-text-secondary hover:text-white transition duration-200 cursor-pointer shadow-xl hover:scale-105 active:scale-95"
              title="Open Personnel Status"
            >
              <Users className="w-5 h-5 text-info" />
            </button>
          )}

          {/* Anomaly Notification (disappears after 5 seconds) */}
          {anomalyNotification && (
            <div className="absolute right-2 md:right-4 top-[14px] z-40 bg-secondary border-2 border-critical shadow-[0_0_20px_rgba(239,68,68,0.45)] rounded-lg px-3 py-1.5 flex flex-col justify-center animate-in slide-in-from-right duration-300 pointer-events-auto min-h-[44px] w-48 sm:w-56 pr-8">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#EF4444] flex items-center gap-1 leading-none">
                <ShieldAlert className="w-3 h-3 text-critical animate-pulse shrink-0" />
                <span>ANOMALY DETECTED</span>
              </div>
              <div className="text-[11px] font-bold text-white truncate max-w-full font-mono mt-0.5 leading-none">
                {anomalyNotification.type} - {anomalyNotification.location}
              </div>
              <button
                onClick={() => setAnomalyNotification(null)}
                className="absolute top-1.5 right-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors duration-150 p-0.5 cursor-pointer"
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div
            className={`flex justify-center items-center mb-6 z-10 w-full overflow-x-auto pb-2 shrink-0 transition-all duration-300 ${!isFeedOpen ? "pl-[52px]" : ""} ${!isPersonnelOpen ? "pr-[52px]" : ""}`}
          >
            <div className="flex gap-2 transition-all duration-300">
              {[
                { id: "1", label: "Floor 1" },
                { id: "4", label: "Floor 4" },
                { id: "AMENITIES", label: "Amenities" },
              ].map((f) => {
                const isActiveFloor = activeIncidents.some(
                  (inc) =>
                    inc?.location &&
                    FLOOR_PLAN_COORDS[inc.location]?.floor === f.id,
                );
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFloor(f.id as any)}
                    className={`px-4 py-1.5 text-xs rounded transition duration-200 flex items-center justify-center gap-2 ${
                      selectedFloor === f.id
                        ? "bg-info/20 text-info border border-info/40 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                        : "bg-white/5 text-text-secondary hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                    {isActiveFloor && (
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 w-full flex flex-col p-2 relative">
            {/* SVG MAP CONTAINER */}
            <div className="w-full h-[380px] md:h-[420px] min-h-[350px] md:min-h-[380px] bg-secondary rounded-lg border border-border relative overflow-auto p-4 custom-visible-scrollbar animate-in fade-in">
              <div
                className="relative mx-auto transition-all duration-300 flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  width: zoomScale === 1 ? "100%" : `${700 * zoomScale}px`,
                  maxWidth: zoomScale === 1 ? "700px" : "none",
                  aspectRatio: "700/450",
                }}
              >
                <svg
                  viewBox="0 0 700 450"
                  className="opacity-90 w-full h-full transition-all duration-300"
                >
                  <defs>
                    <pattern
                      id="grid"
                      width="20"
                      height="20"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 20 0 L 0 0 0 20"
                        fill="none"
                        stroke="rgba(255,255,255,0.04)"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <rect
                    x="50"
                    y="50"
                    width="600"
                    height="350"
                    fill="transparent"
                    stroke="#4B5563"
                    strokeWidth="2.5"
                    rx="4"
                  />
                  {/* Corridor */}
                  <rect x="50" y="200" width="600" height="40" fill="#1E293B" />

                  {/* Rooms (Top logic based on Floor) */}
                  {selectedFloor === "4" && (
                    <>
                      <g stroke="#4B5563" fill="#1E293B" strokeWidth="1.5">
                        {[100, 180, 260, 340, 420, 500, 580].map((x, i) => (
                          <rect
                            key={`t-${i}`}
                            x={x - 30}
                            y={50}
                            width="70"
                            height="150"
                          />
                        ))}
                        {[180, 260, 340, 420].map((x, i) => (
                          <rect
                            key={`b-${i}`}
                            x={x - 30}
                            y={240}
                            width="70"
                            height="160"
                          />
                        ))}
                      </g>

                      <g
                        fill="#F1F5F9"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        <text x="105" y="125">
                          401
                        </text>
                        <text x="185" y="125">
                          402
                        </text>
                        <text x="265" y="125">
                          403
                        </text>
                        <text x="345" y="125">
                          404
                        </text>
                        <text x="425" y="125">
                          405
                        </text>
                        <text x="505" y="125">
                          406
                        </text>
                        <text x="585" y="125">
                          407
                        </text>
                        <text x="185" y="325">
                          408
                        </text>
                        <text x="265" y="325">
                          409
                        </text>
                        <text x="345" y="325" fill="#3B82F6">
                          ELV B
                        </text>
                        <text x="425" y="325">
                          412
                        </text>
                      </g>
                    </>
                  )}

                  {selectedFloor === "1" && (
                    <>
                      <rect
                        x="150"
                        y="50"
                        width="400"
                        height="300"
                        fill="#1E293B"
                        stroke="#4B5563"
                        strokeWidth="2"
                      />
                      <rect
                        x="50"
                        y="100"
                        width="100"
                        height="200"
                        fill="#1E293B"
                        stroke="#4B5563"
                        strokeWidth="2"
                      />
                      <text
                        x="350"
                        y="200"
                        fill="#F1F5F9"
                        fontSize="14"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        MAIN LOBBY
                      </text>
                      <text
                        x="100"
                        y="200"
                        fill="#F1F5F9"
                        fontSize="13"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        RESTAURANT
                      </text>
                    </>
                  )}

                  {selectedFloor === "AMENITIES" && (
                    <>
                      <rect
                        x="200"
                        y="100"
                        width="250"
                        height="250"
                        fill="#1A2235"
                        stroke="#06B6D4"
                        strokeDasharray="4"
                        strokeWidth="2"
                      />
                      <rect
                        x="50"
                        y="50"
                        width="150"
                        height="150"
                        fill="#1E293B"
                        stroke="#4B5563"
                        strokeWidth="2"
                      />
                      <rect
                        x="450"
                        y="50"
                        width="150"
                        height="150"
                        fill="#1E293B"
                        stroke="#4B5563"
                        strokeWidth="2"
                      />
                      <text
                        x="325"
                        y="225"
                        fill="#06B6D4"
                        fontSize="14"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        POOL DECK
                      </text>
                      <text
                        x="125"
                        y="125"
                        fill="#F1F5F9"
                        fontSize="13"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        GYM
                      </text>
                      <text
                        x="525"
                        y="125"
                        fill="#F1F5F9"
                        fontSize="13"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        SAUNA
                      </text>
                    </>
                  )}

                  {/* Draw Staff Markers */}
                  {staff
                    .filter(
                      (s) =>
                        s.status !== "OFF_FLOOR" &&
                        s.location &&
                        FLOOR_PLAN_COORDS[s.location]?.floor === selectedFloor,
                    )
                    .map((s) => {
                      const coord = FLOOR_PLAN_COORDS[s.location!];
                      if (!coord) return null;
                      return (
                        <g
                          key={`staff-${s.id}`}
                          transform={`translate(${coord.x + 15}, ${coord.y - 15})`}
                          className="cursor-pointer"
                        >
                          <circle
                            cx="0"
                            cy="0"
                            r="8"
                            fill="#06B6D4"
                            stroke="#0A0E1A"
                            strokeWidth="2"
                          />
                          <text
                            x="0"
                            y="3"
                            fill="#0A0E1A"
                            fontSize="8"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {s.id}
                          </text>
                        </g>
                      );
                    })}

                  {/* Draw Incident Markers */}
                  {activeIncidents
                    .filter((inc) => {
                      if (!inc?.location) return false;
                      const coord = FLOOR_PLAN_COORDS[inc.location];
                      return coord && coord.floor === selectedFloor;
                    })
                    .map((inc) => {
                      const coord = FLOOR_PLAN_COORDS[inc.location!];
                      if (!coord) return null;
                      const isSelected = activeIncidentId === inc.id;
                      const isCrit = inc.severity === "CRITICAL";
                      return (
                        <g
                          key={`map-inc-${inc.id}`}
                          transform={`translate(${coord.x - 10}, ${coord.y - 10})`}
                          onClick={() => setActiveIncidentId(inc.id)}
                          className="cursor-pointer transition-opacity duration-300 opacity-100" // BUG 2 FIX: CSS transition for markers
                        >
                          <circle
                            cx="0"
                            cy="0"
                            r="0"
                            className={
                              isCrit
                                ? "pulse-circle-critical"
                                : inc.severity === "HIGH"
                                  ? "pulse-circle-high"
                                  : ""
                            }
                          />
                          <circle
                            cx="0"
                            cy="0"
                            r={isSelected ? 10 : 6}
                            fill={
                              isCrit
                                ? "#EF4444"
                                : inc.severity === "HIGH"
                                  ? "#F59E0B"
                                  : "#3B82F6"
                            }
                            stroke="#fff"
                            strokeWidth={isSelected ? 2 : 1}
                          />
                        </g>
                      );
                    })}
                  {/* Draw Evacuation Routes if active */}
                  {isEvacuationMode && (
                    <g>
                      {/* Draw Blocked Zones directly from Active Incident Locations on this floor */}
                      {activeIncidents
                        .filter(
                          (inc) =>
                            inc?.location &&
                            FLOOR_PLAN_COORDS[inc.location]?.floor ===
                              selectedFloor,
                        )
                        .map((inc, idx) => {
                          const coord = FLOOR_PLAN_COORDS[inc.location];
                          if (!coord) return null;
                          return (
                            <rect
                              key={`blocked-${idx}`}
                              x={coord.x - 30}
                              y={coord.y - 30}
                              width="60"
                              height="60"
                              fill="rgba(239, 68, 68, 0.4)"
                              stroke="#EF4444"
                              strokeWidth="2"
                              strokeDasharray="4 4"
                              className="animate-pulse"
                            />
                          );
                        })}

                      {/* Floor-Specific Safe Evacuation Paths */}
                      {selectedFloor === "4" &&
                        (() => {
                          const actLocs = activeIncidents
                            .filter(
                              (inc) =>
                                inc.status !== "RESOLVED" && inc.location,
                            )
                            .map((inc) => inc.location);

                          const leftSideBlocked = actLocs.some((loc) =>
                            [
                              "Room 401",
                              "Room 402",
                              "Room 403",
                              "Room 404",
                              "Room 408",
                              "Room 409",
                            ].includes(loc),
                          );

                          const stepXs = leftSideBlocked
                            ? [100, 180, 260, 340, 420, 500, 580]
                            : [580, 500, 420, 340, 260, 180, 100];

                          const topRooms: Record<number, string> = {
                            100: "Room 401",
                            180: "Room 402",
                            260: "Room 403",
                            340: "Room 404",
                            420: "Room 405",
                            500: "Room 406",
                            580: "Room 407",
                          };

                          const bottomRooms: Record<number, string> = {
                            180: "Room 408",
                            260: "Room 409",
                            340: "Elevator Bank B",
                            420: "Room 412",
                          };

                          const f4Pts = stepXs.map((x) => ({ x, y: 220 }));

                          // End at the stairwell corner
                          const exitPt = leftSideBlocked
                            ? { x: 580, y: 370 }
                            : { x: 100, y: 370 };
                          f4Pts.push(exitPt);

                          const pathD = getSmoothPath(f4Pts);
                          const f4SecondaryY = 220;

                          return (
                            <g key="floor4-route">
                              <path
                                d={pathD}
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="4"
                                strokeDasharray="8 8"
                                className="animate-[dash_1s_linear_infinite]"
                              />
                              <circle
                                cx={exitPt.x}
                                cy={exitPt.y}
                                r="12"
                                fill="#10B981"
                                className="animate-pulse opacity-50"
                              />
                              <circle
                                cx={exitPt.x}
                                cy={exitPt.y}
                                r="6"
                                fill="#10B981"
                              />

                              {/* Secondary downward route to Elevator Bank B */}
                              {!actLocs.includes("Elevator Bank B") && (
                                <g key="f4-secondary-elv-route">
                                  <path
                                    d={`M 340 ${f4SecondaryY} L 340 300`}
                                    fill="none"
                                    stroke="#10B981"
                                    strokeWidth="4"
                                    strokeDasharray="8 8"
                                    className="animate-[dash_1s_linear_infinite]"
                                  />
                                  <path
                                    d="M 333 290 L 340 300 L 347 290"
                                    fill="none"
                                    stroke="#10B981"
                                    strokeWidth="4.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <circle
                                    cx="340"
                                    cy="300"
                                    r="10"
                                    fill="#10B981"
                                    className="animate-pulse opacity-30"
                                  />
                                </g>
                              )}
                            </g>
                          );
                        })()}

                      {selectedFloor === "1" &&
                        (() => {
                          return (
                            <g key="floor1-route">
                              {/* Green dashed route from RESTAURANT across MAIN LOBBY to exit */}
                              <path
                                d="M 150 215 L 535 228"
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="4.5"
                                strokeDasharray="8 8"
                                className="animate-[dash_1s_linear_infinite]"
                              />
                              {/* Arrow head pointing right/slightly downhill */}
                              <path
                                d="M 520 213 L 542 228 L 520 243"
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="4.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {/* Main Exit Point styled as Green */}
                              <circle
                                cx="550"
                                cy="228"
                                r="14"
                                fill="#10B981"
                                className="animate-pulse opacity-40"
                              />
                              <circle cx="550" cy="228" r="8" fill="#10B981" />
                              <circle cx="550" cy="228" r="4" fill="#ffffff" />
                            </g>
                          );
                        })()}

                      {false &&
                        (() => {
                          const actLocs = activeIncidents
                            .filter(
                              (inc) =>
                                inc.status !== "RESOLVED" && inc.location,
                            )
                            .map((inc) => inc.location);

                          // Path 1: Lobby -> Entrance
                          const lobbyPts = [];
                          if (actLocs.includes("Main Lobby")) {
                            lobbyPts.push({ x: 300, y: 120 });
                            lobbyPts.push({ x: 425, y: 160 });
                            lobbyPts.push({ x: 550, y: 200 });
                          } else {
                            lobbyPts.push({ x: 300, y: 200 });
                            lobbyPts.push({ x: 425, y: 200 });
                            lobbyPts.push({ x: 550, y: 200 });
                          }

                          // Path 2: Restaurant -> Entrance (converging)
                          const restPts = [];
                          if (actLocs.includes("Restaurant")) {
                            restPts.push({ x: 150, y: 120 });
                            restPts.push({ x: 225, y: 120 });
                          } else {
                            restPts.push({ x: 150, y: 200 });
                            restPts.push({ x: 225, y: 200 });
                          }

                          if (actLocs.includes("Main Lobby")) {
                            restPts.push({ x: 300, y: 120 });
                            restPts.push({ x: 425, y: 160 });
                          } else {
                            restPts.push({ x: 300, y: 200 });
                            restPts.push({ x: 425, y: 200 });
                          }
                          restPts.push({ x: 550, y: 200 });

                          const dLobby = getSmoothPath(lobbyPts);
                          const dRest = getSmoothPath(restPts);

                          return (
                            <g key="floor1-route">
                              {/* Restaurant Route */}
                              <path
                                d={dRest}
                                fill="none"
                                stroke="#34D399"
                                strokeWidth="4"
                                strokeDasharray="12 6"
                                className="animate-[dash_1.3s_linear_infinite]"
                              />
                              {/* Lobby Route */}
                              <path
                                d={dLobby}
                                fill="none"
                                stroke="#34D399"
                                strokeWidth="4.5"
                                strokeDasharray="12 6"
                                className="animate-[dash_1.3s_linear_infinite]"
                              />
                              {/* Main Exit Point */}
                              <circle
                                cx="550"
                                cy="200"
                                r="14"
                                fill="#34D399"
                                className="animate-pulse opacity-40"
                              />
                              <circle cx="550" cy="200" r="8" fill="#34D399" />
                              <circle cx="550" cy="200" r="4" fill="#ffffff" />
                            </g>
                          );
                        })()}

                      {selectedFloor === "AMENITIES" &&
                        (() => {
                          /* modified */
                          const actLocs = activeIncidents
                            .filter(
                              (inc) =>
                                inc.status !== "RESOLVED" && inc.location,
                            )
                            .map((inc) => inc.location);

                          const poolBlocked = actLocs.includes("Pool Deck");
                          const gymBlocked =
                            actLocs.includes("Gym - Level 2") ||
                            actLocs.includes("Gym");
                          const saunaBlocked = actLocs.includes("Sauna");

                          // Gym path template
                          const gymPts = [];
                          if (gymBlocked) {
                            gymPts.push({ x: 90, y: 90 });
                            gymPts.push({ x: 90, y: 300 });
                          } else {
                            gymPts.push({ x: 150, y: 155 });
                          }

                          if (poolBlocked) {
                            gymPts.push({ x: 150, y: 300 });
                          } else if (!gymBlocked) {
                            gymPts.push({ x: 300, y: 155 });
                          }
                          gymPts.push({ x: 300, y: 380 });

                          // Sauna path template
                          const saunaPts = [];
                          if (saunaBlocked) {
                            saunaPts.push({ x: 510, y: 90 });
                            saunaPts.push({ x: 510, y: 300 });
                          } else {
                            saunaPts.push({ x: 450, y: 155 });
                          }

                          if (poolBlocked) {
                            saunaPts.push({ x: 450, y: 300 });
                          } else if (!saunaBlocked) {
                            saunaPts.push({ x: 300, y: 155 });
                          }
                          saunaPts.push({ x: 300, y: 380 });

                          // Pool path template
                          const poolPts = [];
                          if (poolBlocked) {
                            poolPts.push({ x: 300, y: 120 });
                            poolPts.push({ x: 215, y: 250 });
                            poolPts.push({ x: 300, y: 380 });
                          } else {
                            poolPts.push({ x: 300, y: 120 });
                            poolPts.push({ x: 300, y: 250 });
                            poolPts.push({ x: 300, y: 380 });
                          }

                          const dGym = gymBlocked
                            ? "M 95 95 L 95 350 L 300 350 L 300 380"
                            : "M 135 155 L 135 350 L 300 350 L 300 380";
                          const dSauna = saunaBlocked
                            ? "M 505 95 L 505 350 L 300 350 L 300 380"
                            : "M 515 155 L 515 350 L 300 350 L 300 380";
                          const dPool = poolBlocked
                            ? "M 300 285 L 300 380"
                            : "M 300 120 L 300 380";

                          return (
                            <g key="amenities-route">
                              <path d={dGym} fill="none" stroke="#10B981" strokeWidth="4.5" strokeDasharray="8 8" className="animate-[dash_1s_linear_infinite]" />
                              <path d={dSauna} fill="none" stroke="#10B981" strokeWidth="4.5" strokeDasharray="8 8" className="animate-[dash_1s_linear_infinite]" />
                              <path d={dPool} fill="none" stroke="#10B981" strokeWidth="4.5" strokeDasharray="8 8" className="animate-[dash_1s_linear_infinite]" />
                              <path d="M 293 365 L 300 375 L 307 365" fill="none" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="300" cy="380" r="14" fill="#10B981" className="animate-pulse opacity-40" />
                              <circle cx="300" cy="380" r="8" fill="#10B981" />
                              <circle cx="300" cy="380" r="4" fill="#ffffff" />
                              <g style={{ display: "none" }}>
                              {/* Gym Path */}
                              <path
                                d={dGym}
                                fill="none"
                                stroke="#06B6D4"
                                strokeWidth="3.5"
                                strokeDasharray="4 4"
                                className="animate-[dash_0.7s_linear_infinite]"
                              />
                              {/* Sauna Path */}
                              <path
                                d={dSauna}
                                fill="none"
                                stroke="#06B6D4"
                                strokeWidth="3.5"
                                strokeDasharray="4 4"
                                className="animate-[dash_0.7s_linear_infinite]"
                              />
                              {/* Pool Path */}
                              <path
                                d={dPool}
                                fill="none"
                                stroke="#06B6D4"
                                strokeWidth="4"
                                strokeDasharray="4 4"
                                className="animate-[dash_0.7s_linear_infinite]"
                              />
                              {/* Converged Exit Point */}
                              <circle
                                cx="300"
                                cy="380"
                                r="14"
                                fill="#06B6D4"
                                className="animate-pulse opacity-40"
                              />
                              <circle cx="300" cy="380" r="8" fill="#06B6D4" />
                            </g>
                            </g>
                          );
                        })()}
                    </g>
                  )}
                </svg>
              </div>

              {/* Overlay label */}
              <div className="absolute top-2 left-2 text-[10px] text-text-secondary font-mono tracking-tighter">
                LEVEL_{selectedFloor.padStart(2, "0")}_SCHEMATIC_V2.1
              </div>

              {/* Evacuation Panel Overlay */}
              {isEvacuationMode && evacuationPlan && isEvacuationPanelOpen && (
                <div className="absolute top-2 right-2 bg-black/80 backdrop-blur border border-critical rounded p-4 max-w-xs animate-in slide-in-from-top-4 z-20 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-critical font-bold text-sm uppercase flex items-center gap-2">
                      <Navigation className="w-4 h-4" /> EVACUATION GUIDANCE
                    </h3>
                    <button
                      onClick={() => setIsEvacuationPanelOpen(false)}
                      className="text-text-secondary hover:text-white p-1 rounded-full bg-white/5 hover:bg-white/10 transition"
                      title="Close Panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-white/90 space-y-2">
                    <p>
                      <strong className="text-white">Risk Level:</strong>{" "}
                      <span className="text-critical">
                        {evacuationPlan.overallRiskLevel}
                      </span>
                    </p>
                    <p>
                      <strong className="text-white">Primary Exits:</strong>{" "}
                      {evacuationPlan.recommendedExits?.join(", ")}
                    </p>
                    <p>
                      <strong className="text-white">Blocked:</strong>{" "}
                      {evacuationPlan.blockedZones?.join(", ")}
                    </p>
                    {evacuationPlan.primaryRoutes?.map((r: any, i: number) => (
                      <div
                        key={i}
                        className="bg-white/5 border border-white/10 p-2 rounded mt-2"
                      >
                        <p className="text-[10px] font-bold text-success">
                          Route {i + 1}: {r.zone}
                        </p>
                        <p className="text-[10px] text-white/70">
                          Clear Time: {r.estimatedClearTime} | Risk:{" "}
                          {r.bottleneckRisk}
                        </p>
                        <p className="text-[9px] mt-1 break-words">
                          {r.path?.join(" → ")}
                        </p>
                      </div>
                    ))}
                    <p className="text-[9px] text-info mt-2 pt-2 border-t border-white/10">
                      {evacuationPlan.specialInstructions}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* FLOATING ZOOM CONTROLS & EVACUATION */}
            {!isFeedOpen && (
              <button
                onClick={() => {
                  if (!isEvacuationMode) {
                    setIsEvacuationMode(true);
                    setIsEvacuationPanelOpen(true);
                    fetch("/api/ai/evacuation-route", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        incidents,
                        venueLayout: { floors: 4, roomsPerFloor: 12 },
                      }),
                    }).catch((e) =>
                      console.error("Evacuation request error:", e),
                    );
                  } else {
                    setIsEvacuationMode(false);
                    setEvacuationPlan(null);
                  }
                }}
                className={`absolute bottom-[72px] left-6 z-30 px-4 py-2 text-xs font-bold rounded transition-all animate-in fade-in slide-in-from-bottom-2 border shadow-xl ${isEvacuationMode ? "bg-critical/90 text-white border-critical shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse" : "bg-secondary/90 backdrop-blur text-critical border-critical hover:bg-critical/10"}`}
              >
                {isEvacuationMode ? "CANCEL EVACUATION" : "EVACUATION MODE"}
              </button>
            )}

            <div className="absolute bottom-6 left-6 flex items-center bg-black/90 backdrop-blur-md border border-border rounded shadow-xl p-1.5 z-30 gap-1.5 select-none animate-in fade-in slide-in-from-bottom-2">
              <button
                onClick={() =>
                  setZoomScale((prev) =>
                    Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))),
                  )
                }
                disabled={zoomScale <= 0.5}
                className="p-1 rounded text-text-secondary hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="text-[10px] font-mono font-bold text-info px-1.5 min-w-[38px] text-center">
                {Math.round(zoomScale * 100)}%
              </span>

              <button
                onClick={() =>
                  setZoomScale((prev) =>
                    Math.min(3.0, parseFloat((prev + 0.25).toFixed(2))),
                  )
                }
                disabled={zoomScale >= 3.0}
                className="p-1 rounded text-text-secondary hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {zoomScale !== 1 && (
                <button
                  onClick={() => setZoomScale(1)}
                  className="text-[9px] uppercase font-mono font-bold bg-info/20 text-info px-1.5 py-0.5 rounded border border-info/30 hover:bg-info/35 transition cursor-pointer ml-1"
                  title="Reset Zoom"
                >
                  Reset
                </button>
              )}
            </div>

            {/* BUG 2 FIX: Only show popup if the incident is STILL active in shared state */}
            {activeIncidentId &&
              activeIncidents.some((i) => i?.id === activeIncidentId) &&
              (() => {
                const activeInc = incidents.find(
                  (i) => i?.id === activeIncidentId,
                );
                if (!activeInc) return null;

                const isCrit =
                  activeInc.severity === "CRITICAL" ||
                  activeInc.urgencyLevel === "CRITICAL";
                const isHigh =
                  activeInc.severity === "HIGH" ||
                  activeInc.urgencyLevel === "HIGH";
                const badgeBg = isCrit
                  ? "bg-critical"
                  : isHigh
                    ? "bg-high"
                    : "bg-safe";
                const assignee = staff.find(
                  (s) => s?.id === activeInc.assigneeId,
                );

                return (
                  <div className="absolute bottom-6 right-6 p-4 bg-card border border-border rounded shadow-2xl w-56 animate-in slide-in-from-bottom-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-2 h-2 rounded-full ${badgeBg}`}
                      ></span>
                      <h4 className="text-xs font-bold uppercase">
                        {activeInc.location || "Unknown"} ACTIVE
                      </h4>
                    </div>
                    <p className="text-[10px] text-text-secondary mb-3 leading-tight truncate whitespace-normal overflow-hidden max-h-12">
                      {activeInc.description || "Processing..."} Assigned:{" "}
                      {assignee?.name || "None"}.
                    </p>
                    <button
                      onClick={() => resolveIncident(activeIncidentId)}
                      className="w-full py-1.5 bg-success/20 text-success text-[10px] font-bold rounded border border-success/40 hover:bg-success hover:text-white transition"
                    >
                      MARK RESOLVED
                    </button>
                  </div>
                );
              })()}
          </div>
        </section>

        {/* RIGHT PANEL: PERSONNEL & ACTIONS */}
        {isPersonnelOpen && (
          <>
            {/* Mobile/Tablet Backdrop overlay */}
            <div
              className="lg:hidden fixed top-14 md:top-16 lg:top-20 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-xs z-30 transition-opacity duration-300 pointer-events-auto"
              onClick={() => setIsPersonnelOpen(false)}
            />
            <aside className="fixed lg:static top-14 md:top-16 lg:top-20 right-0 h-[calc(100vh-theme(spacing.14))] md:h-[calc(100vh-theme(spacing.16))] lg:h-[calc(100vh-theme(spacing.20))] w-[280px] lg:w-[200px] xl:w-[240px] bg-secondary border-l border-border flex flex-col shrink-0 overflow-hidden z-40 lg:z-0 animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-border flex flex-col gap-1 shrink-0 bg-secondary">
                <div className="flex justify-between items-center bg-secondary">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                    Personnel Status
                  </h2>
                  <button
                    onClick={() => setIsPersonnelOpen(false)}
                    className="text-text-secondary hover:text-white hover:bg-white/10 p-1 rounded transition cursor-pointer"
                    title="Collapse Personnel Status"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col overflow-x-hidden overflow-y-auto p-2 md:p-3 gap-2 custom-visible-scrollbar w-full flex-1">
                {staff.map((s) => {
                  const isAssignedToActive =
                    activeIncidentId && s.status === "AVAILABLE";
                  return (
                    <div key={s.id} className="relative shrink-0">
                      <div
                        className={`flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded border-b border-white/5 min-w-0 w-full ${s.status === "RESPONDING" || isAssignedToActive ? "bg-white/5" : ""} ${s.status === "ON_BREAK" || s.status === "OFF_FLOOR" ? "opacity-50" : ""}`}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-primary shrink-0"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.id}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-semibold truncate"
                            title={s.name}
                          >
                            {s.name}
                          </p>
                          <p
                            className="text-[9px] font-bold uppercase truncate"
                            style={{ color: s.color }}
                            title={
                              s.status === "AVAILABLE"
                                ? `Available — ${s.location || "Standby"}`
                                : s.status === "RESPONDING"
                                  ? `Responding (${s.location})`
                                  : s.status === "ON_BREAK"
                                    ? "On Break"
                                    : "Off Floor"
                            }
                          >
                            {s.status === "AVAILABLE"
                              ? `Available — ${s.location || "Standby"}`
                              : s.status === "RESPONDING"
                                ? `Responding (${s.location})`
                                : s.status === "ON_BREAK"
                                  ? "On Break"
                                  : "Off Floor"}
                          </p>
                        </div>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: s.color }}
                        ></span>
                      </div>

                      {isAssignedToActive && (
                        <button
                          onClick={() =>
                            assignStaffToIncident(s.id, activeIncidentId)
                          }
                          className="absolute right-0 top-0 bottom-0 mr-8 text-[9px] bg-safe/20 text-safe px-2 py-0.5 rounded border border-safe/40 z-10 m-auto h-6"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </>
        )}
      </main>

      {/* SEPARATE LOG PANEL: COMM LOG */}
      <div
        className={`fixed left-0 right-0 bg-primary border-t border-border z-10 flex flex-col select-none transition-all duration-300 ease-in-out ${
          logExpanded
            ? "bottom-[48px] h-32 md:h-40 border-b"
            : "bottom-0 h-0 overflow-hidden border-none"
        }`}
      >
        <div className="px-2 md:px-4 py-1.5 border-b border-white/5 flex justify-between items-center bg-secondary">
          <h3 className="text-[9px] md:text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            Unified Communication Log
          </h3>
          <button
            onClick={() => setLogExpanded(false)}
            className="text-gray-400 text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 hover:text-white transition duration-200 cursor-pointer font-mono"
          >
            ▼ Hide Log
          </button>
        </div>
        <div
          ref={logContainerRef}
          className="flex-1 p-2 md:p-3 font-mono text-[9px] md:text-[10px] lg:text-[11px] space-y-1 overflow-auto leading-relaxed"
        >
          {logs.map((log) => (
            <div key={log.id} className="flex gap-4">
              <span className="text-text-secondary">
                {formatTime(log.timestamp)}
              </span>
              <span
                className={`w-[80px] shrink-0 font-bold ${levelColors[log.level]}`}
              >
                [{log.level}]
              </span>
              <span className="text-white/80">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* COMLOG TRIGGER & ACTIONS FLOATING STACK */}
      <button
        onClick={() => setLogExpanded(!logExpanded)}
        className={`fixed right-6 z-50 text-[9px] font-mono font-bold tracking-widest px-2.5 py-1.5 rounded bg-secondary/90 border border-border text-text-secondary hover:text-white transition-all duration-300 shadow-[0_0_10px_rgba(0,0,0,0.5)] cursor-pointer ${
          logExpanded ? "bottom-[184px] md:bottom-[216px]" : "bottom-[56px]"
        }`}
      >
        {logExpanded ? "▼ HIDE COMM LOG" : "▲ SHOW COMM LOG"}
      </button>

      {/* FIXED SYSTEM FOOTER */}
      <footer className="w-full fixed bottom-0 left-0 z-50 bg-gray-950 border-t border-gray-800 px-3 md:px-6 h-9 flex items-center justify-between select-none font-sans">
        {/* LEFT */}
        <div className="flex items-center text-gray-500 text-[9px] min-[400px]:text-[10px] md:text-xs font-semibold">
          <span className="hidden min-[400px]:inline">
            © 2026 NEXUS — Delta Techies
          </span>
          <span className="min-[400px]:hidden">© 2026 NEXUS</span>
        </div>

        {/* CENTER */}
        <div className="hidden md:flex items-center text-gray-400 text-[10px] lg:text-xs italic text-center">
          Every Second Counts. Every Life Matters.
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-1.5 text-green-500 text-[9px] min-[400px]:text-[10px] md:text-xs font-mono font-bold leading-none">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          <span>LIVE</span>
        </div>
      </footer>

      {/* MODALS */}

      {/* UNIFIED SOS MODAL */}
      {isSosOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.2)] rounded-xl w-full max-w-md overflow-hidden relative">
            <button
              onClick={() => {
                setIsSosOpen(false);
                setSosProcessingState("IDLE");
                setSosText("");
                setSosLocation("");
                setSosDoneMessages([]);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-6 pt-10 flex flex-col items-center">
              <h3 className="text-2xl font-black text-red-500 tracking-widest mb-1 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" /> EMERGENCY ALERT
              </h3>
              <p className="text-red-400/80 text-sm text-center mb-8">
                Press the microphone and describe your emergency — AI will
                handle the rest
              </p>

              {sosProcessingState === "PROCESSING" ||
              sosProcessingState === "DONE" ? (
                <div className="w-full flex justify-center py-8">
                  <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 w-full text-center space-y-3">
                    {sosDoneMessages.map((msg, i) => (
                      <div
                        key={i}
                        className="text-green-400 text-sm font-bold animate-in slide-in-from-bottom-2 fade-in"
                      >
                        {msg}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-full relative mb-6">
                    <label className="block text-gray-400 text-xs font-bold mb-2">
                      Select Location / Room Number
                    </label>
                    <select
                      value={sosLocation}
                      onChange={(e) => setSosLocation(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 outline-none transition-colors text-sm"
                    >
                      <option value="">-- Select a location --</option>
                      <optgroup label="Floor 1">
                        <option value="Main Lobby">Main Lobby</option>
                        <option value="Restaurant">Restaurant</option>
                        <option value="Reception">Reception</option>
                      </optgroup>
                      <optgroup label="Floor 4">
                        <option value="Room 401">Room 401</option>
                        <option value="Room 402">Room 402</option>
                        <option value="Room 403">Room 403</option>
                        <option value="Room 404">Room 404</option>
                        <option value="Room 405">Room 405</option>
                        <option value="Room 406">Room 406</option>
                        <option value="Room 407">Room 407</option>
                        <option value="Room 408">Room 408</option>
                        <option value="Room 409">Room 409</option>
                        <option value="Room 412">Room 412</option>
                        <option value="Elevator Bank B">Elevator Bank B</option>
                      </optgroup>
                      <optgroup label="Amenities">
                        <option value="Pool Deck">Pool Deck</option>
                        <option value="Gym">Gym</option>
                        <option value="Sauna">Sauna</option>
                        <option value="Sky Bar">Sky Bar</option>
                      </optgroup>
                      <optgroup label="Other Areas">
                        <option value="Parking Level B2">
                          Parking Level B2
                        </option>
                        <option value="Electrical Storage">
                          Electrical Storage
                        </option>
                        <option value="Corridor A">Corridor A</option>
                        <option value="Corridor B">Corridor B</option>
                        <option value="Rooftop">Rooftop</option>
                      </optgroup>
                    </select>
                  </div>

                  <button
                    onClick={toggleSosVoice}
                    className={`w-28 h-28 rounded-full flex flex-col items-center justify-center gap-2 border-4 transition-all duration-300 relative mx-auto mb-6
                        ${
                          sosProcessingState === "RECORDING"
                            ? "bg-red-600 border-red-400 shadow-[0_0_40px_rgba(220,38,38,0.4)] animate-pulse"
                            : "bg-gray-700 border-gray-500 hover:bg-gray-600"
                        }`}
                  >
                    <Mic
                      className={`w-10 h-10 ${sosProcessingState === "RECORDING" ? "text-white" : "text-gray-300"}`}
                    />
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${sosProcessingState === "RECORDING" ? "text-white" : "text-gray-400"}`}
                    >
                      {sosProcessingState === "RECORDING"
                        ? "LISTENING..."
                        : "TAP TO SPEAK"}
                    </span>
                  </button>

                  <div className="w-full relative">
                    <textarea
                      value={sosText}
                      onChange={(e) => setSosText(e.target.value)}
                      placeholder="Or type your emergency here in any language..."
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 outline-none transition-colors placeholder:text-gray-500 text-sm resize-none"
                    />
                    {sosText.length > 0 &&
                      sosDetectedLanguage &&
                      sosDetectedLanguage !== "Unknown" && (
                        <div className="absolute -bottom-6 left-1 text-[10px] font-bold text-cyan-400 tracking-wide">
                          Detected: {sosDetectedLanguage.toUpperCase()}
                        </div>
                      )}
                  </div>

                  <button
                    onClick={sendSosUnified}
                    disabled={
                      (!sosText.trim() && !sosLocation) ||
                      sosProcessingState === "PROCESSING"
                    }
                    className={`w-full font-bold py-4 text-sm rounded-lg tracking-wider uppercase mt-8 transition-colors
                        ${
                          (sosText.trim() || sosLocation) &&
                          sosProcessingState !== "PROCESSING"
                            ? "bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        }`}
                  >
                    🚨 SEND SOS — AI WILL ANALYZE
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 112 ESCALATION MODAL */}
      {is112Open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-secondary border border-high shadow-[0_0_30px_rgba(245,158,11,0.2)] rounded-lg w-full max-w-lg overflow-hidden">
            <div className="bg-high px-4 py-3 flex justify-between items-center text-primary">
              <h3 className="font-bold tracking-widest flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" /> DISPATCH 112
              </h3>
              <button
                onClick={() => setIs112Open(false)}
                className="hover:opacity-80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-text-secondary mb-3">
                Please review the auto-generated incident brief before
                confirming dispatch.
              </p>
              <div className="bg-[#05070a] border border-border p-4 rounded font-mono text-xs text-gray-300 leading-relaxed mb-6 whitespace-pre-wrap">
                {`NEXUS AUTO-BRIEF:
Hotel Address: Grand Horizon Resort, 1200 Coastal Hwy
Time: ${new Date().toLocaleTimeString()}

ACTIVE CRITICAL INCIDENTS:
${
  activeIncidents.filter(
    (i) => i != null && i !== undefined && i.severity === "CRITICAL",
  ).length === 0
    ? "None currently active."
    : activeIncidents
        .filter(
          (i) => i != null && i !== undefined && i.severity === "CRITICAL",
        )
        .map((i) => {
          const s = staff.find((st) => st.id === i?.assigneeId);
          return `- ${i?.type || "OTHER"} at ${i?.location || "Unknown"}\n  Details: ${i?.description || "Processing..."}\n  First Responder: ${s ? s.name : "None dispatched yet"}`;
        })
        .join("\n\n")
}

Awaiting dispatch confirmation from Command Center Alpha.`}
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => setIs112Open(false)}
                  className="flex-1 bg-card hover:bg-primary border border-border text-white font-bold py-3 text-sm rounded tracking-wider uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleAddLog(
                      "SUCCESS",
                      "112 Dispatch Confirmed. ETA 6 mins.",
                    );
                    setToastMsg("112 Dispatch Confirmed");
                    playBeep();
                    setIs112Open(false);
                  }}
                  className="flex-1 bg-high hover:bg-amber-600 text-primary font-bold py-3 text-sm rounded tracking-wider uppercase"
                >
                  CONFIRM DISPATCH
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOCKDOWN MODAL */}
      {isLockdownOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur flex items-center justify-center z-50 p-4">
          <div className="bg-secondary border border-critical rounded-lg w-full max-w-sm overflow-hidden text-center p-6">
            <AlertCircle className="w-16 h-16 text-critical mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white tracking-widest mb-2">
              INITIATE LOCKDOWN?
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              This will restrict all electronic access points and broadcast
              alert status to all staff radios.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setIsLockdownOpen(false)}
                className="flex-1 border border-border text-text-secondary hover:text-white py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={toggleLockdown}
                className="flex-1 bg-critical hover:bg-red-600 text-white font-bold py-2 rounded uppercase tracking-wider"
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRILL MODE MODAL */}
      {isDrillModeOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-secondary border border-border shadow-[0_0_35px_rgba(255,255,255,0.05)] rounded-lg w-full max-w-sm overflow-hidden text-center p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white tracking-widest mb-2 flex items-center justify-center gap-2">
              ⚙️ EMERGENCY DRILLS
            </h3>
            <p className="text-xs text-text-secondary mb-6">
              Select a simulation scenario to trigger a tactical staff practice
              drill.
            </p>

            <div className="flex flex-col gap-2.5 mb-6">
              <button
                onClick={() => {
                  triggerBuiltInDrill("FIRE");
                  setIsDrillModeOpen(false);
                }}
                className="w-full py-2.5 bg-critical/10 border border-critical/30 hover:bg-critical/20 text-critical text-xs font-bold rounded-md transition duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                🔥 Fire Outbreak Simulation
              </button>
              <button
                onClick={() => {
                  triggerBuiltInDrill("MEDICAL");
                  setIsDrillModeOpen(false);
                }}
                className="w-full py-2.5 bg-high/10 border border-high/30 hover:bg-high/20 text-high text-xs font-bold rounded-md transition duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                🩺 Cardiac Arrest Simulation
              </button>
              <button
                onClick={() => {
                  triggerBuiltInDrill("SECURITY");
                  setIsDrillModeOpen(false);
                }}
                className="w-full py-2.5 bg-info/10 border border-info/30 hover:bg-info/20 text-info text-xs font-bold rounded-md transition duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                👤 Security Intruder Simulation
              </button>
              <button
                onClick={() => {
                  triggerBuiltInDrill("LEAK");
                  setIsDrillModeOpen(false);
                }}
                className="w-full py-2.5 bg-safe/10 border border-safe/30 hover:bg-safe/20 text-safe text-xs font-bold rounded-md transition duration-200 cursor-pointer flex items-center justify-center gap-2"
              >
                💧 Water Leak Simulation
              </button>
            </div>

            <button
              onClick={() => setIsDrillModeOpen(false)}
              className="w-full py-2 bg-card hover:bg-primary border border-border text-text-secondary hover:text-white text-xs font-bold rounded-md transition tracking-wider uppercase cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MOBILE STAFF & ACTIONS MODAL */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-50 p-4 md:hidden">
          <div className="bg-secondary border border-border shadow-2xl rounded-xl w-full max-w-sm max-h-[85vh] overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border bg-primary/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-info" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">
                  Personnel & Operations
                </h3>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-text-secondary hover:text-white transition p-1 rounded-full hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Personnel Status Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-3 pb-1 border-b border-border/50">
                  Personnel Status
                </h4>
                <div className="space-y-2">
                  {staff.map((s) => {
                    const isAssignedToActive =
                      activeIncidentId && s.status === "AVAILABLE";
                    return (
                      <div
                        key={s.id}
                        className="relative flex items-center gap-2.5 p-2 rounded bg-white/[0.02] border border-border/20"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-primary shrink-0"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.id}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-bold truncate text-white"
                            title={s.name}
                          >
                            {s.name}
                          </p>
                          <p
                            className="text-[9px] font-bold uppercase truncate"
                            style={{ color: s.color }}
                          >
                            {s.status === "AVAILABLE"
                              ? `Available — ${s.location || "Standby"}`
                              : s.status === "RESPONDING"
                                ? `Responding (${s.location})`
                                : s.status === "ON_BREAK"
                                  ? "On Break"
                                  : "Off Floor"}
                          </p>
                        </div>
                        <span
                          className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                          style={{ backgroundColor: s.color }}
                        ></span>

                        {isAssignedToActive && (
                          <button
                            onClick={() => {
                              assignStaffToIncident(s.id, activeIncidentId);
                              setIsMobileMenuOpen(false);
                            }}
                            className="text-[9px] bg-safe/25 text-safe px-2.5 py-1 rounded border border-safe/40 font-bold hover:bg-safe/40 cursor-pointer"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed top-16 md:top-20 lg:top-24 right-4 md:right-6 z-[70] bg-secondary/90 backdrop-blur-md border border-border text-white min-w-[250px] w-auto max-w-[calc(100vw-32px)] p-3 rounded-lg shadow-lg animate-in slide-in-from-right-4 fade-in flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-info shrink-0" />
            <p className="text-xs font-medium text-white/95 leading-tight">
              {toastMsg}
            </p>
          </div>
          <button
            id="close-toast-btn"
            onClick={() => setToastMsg(null)}
            className="p-1 shrink-0 hover:bg-white/10 rounded-full text-text-secondary hover:text-white transition"
            title="Close Notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TACTICAL ACTIONS FLOATING TRIGGER */}
      <button
        onClick={() => {
          setIsTacticalOpen((prev) => !prev);
        }}
        className={`fixed right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.25)] ${
          logExpanded ? "bottom-[256px] md:bottom-[288px]" : "bottom-[128px]"
        }`}
        style={{
          background: "rgba(239, 68, 68, 0.15)",
          border: "1.5px solid rgba(239, 68, 68, 0.45)",
          backdropFilter: "blur(12px)",
          boxShadow:
            "0 0 20px rgba(239, 68, 68, 0.2), inset 0 0 20px rgba(239, 68, 68, 0.05)",
        }}
        title="Tactical Operations Panel"
      >
        <Radio className="w-6 h-6 text-red-500 animate-pulse" />
        {/* Visual badge highlight */}
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-primary animate-ping" />
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-primary" />
      </button>

      {/* TACTICAL ACTIONS OVERLAY DRAWER/CARD */}
      {isTacticalOpen && (
        <div
          className={`fixed right-6 w-80 bg-secondary/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl p-4 z-50 animate-in slide-in-from-bottom-5 duration-200 block transition-all duration-300 ${
            logExpanded ? "bottom-[328px] md:bottom-[360px]" : "bottom-[200px]"
          }`}
        >
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5 bg-secondary">
            <div className="flex items-center gap-2 bg-secondary">
              <Radio className="w-4 h-4 text-red-400 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                Tactical Operations
              </h3>
            </div>
            <button
              onClick={() => setIsTacticalOpen(false)}
              className="text-text-secondary hover:text-white hover:bg-white/10 p-1 rounded transition duration-200 cursor-pointer"
              title="Close Tactical Actions"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                setIsTacticalOpen(false);
                setIs112Open(true);
              }}
              className="w-full py-2.5 bg-critical/20 text-critical text-xs font-bold rounded border border-critical/40 hover:bg-critical/30 transition cursor-pointer"
            >
              ESCALATE TO 112
            </button>
            <button
              onClick={() => {
                setIsTacticalOpen(false);
                setIsLockdownOpen(true);
              }}
              className="w-full py-2.5 bg-high/20 text-high text-xs font-bold rounded border border-high/40 hover:bg-high/30 transition cursor-pointer"
            >
              BROADCAST LOCKDOWN
            </button>
            <button
              onClick={() => {
                handleDeployBackup();
              }}
              disabled={deployBackupState === "DEPLOYING"}
              className={`w-full py-2.5 text-xs font-bold rounded border transition cursor-pointer ${
                deployBackupState === "SUCCESS"
                  ? "bg-green-600 text-white border-green-600"
                  : deployBackupState === "FAILED"
                    ? "bg-orange-600/20 text-orange-400 border-orange-600/40"
                    : "bg-blue-600/20 text-blue-400 border-blue-600/40 hover:bg-blue-600/30"
              }`}
            >
              {deployBackupState === "DEPLOYING"
                ? "⏳ DEPLOYING..."
                : deployBackupState === "SUCCESS"
                  ? "✓ BACKUP DEPLOYED"
                  : deployBackupState === "FAILED"
                    ? "⚠ NO STAFF AVAILABLE"
                    : "DEPLOY BACKUP"}
            </button>
            <button
              onClick={() => {
                setIsTacticalOpen(false);
                setIsDrillModeOpen(true);
              }}
              className="w-full py-2.5 bg-gray-700/50 text-gray-300 text-xs font-bold rounded border border-gray-600/50 hover:bg-gray-600/50 hover:text-white transition flex items-center justify-center gap-2 cursor-pointer"
            >
              ⚙️ DRILL MODE
            </button>
          </div>
        </div>
      )}

      {/* STAFF AI FLOATING BUTTON */}
      <button
        onClick={() => {
          setIsStaffAIOpen(true);
          setAiHasNotification(false);
        }}
        className={`fixed right-6 z-50
          w-14 h-14 rounded-full
          flex items-center justify-center
          transition-all duration-300
          hover:scale-110
          active:scale-95 cursor-pointer ${
            logExpanded ? "bottom-[192px] md:bottom-[224px]" : "bottom-[64px]"
          }`}
        style={{
          background: "rgba(6, 182, 212, 0.15)",
          border: "1.5px solid rgba(6, 182, 212, 0.4)",
          backdropFilter: "blur(12px)",
          boxShadow:
            "0 0 20px rgba(6, 182, 212, 0.2), " +
            "inset 0 0 20px rgba(6, 182, 212, 0.05)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 30px rgba(6, 182, 212, 0.35), " +
            "inset 0 0 20px rgba(6, 182, 212, 0.1)";
          e.currentTarget.style.background = "rgba(6, 182, 212, 0.22)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 20px rgba(6, 182, 212, 0.2), " +
            "inset 0 0 20px rgba(6, 182, 212, 0.05)";
          e.currentTarget.style.background = "rgba(6, 182, 212, 0.15)";
        }}
        title="NEXUS AI Assistant"
      >
        {/* Chat bubble icon — clean and minimal */}
        <svg
          viewBox="0 0 24 24"
          className="w-7 h-7"
          fill="none"
          stroke="rgba(6, 182, 212, 0.9)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 
            2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>

        {/* Notification dot */}
        {aiHasNotification && (
          <span
            className="absolute -top-0.5 -right-0.5
            w-3.5 h-3.5 bg-red-500 rounded-full 
            border-2 border-gray-950
            animate-pulse flex items-center 
            justify-center"
          ></span>
        )}
      </button>

      {/* STAFF AI CHAT PANEL */}
      {isStaffAIOpen && (
        <div className="fixed top-20 right-0 h-[calc(100vh-250px)] w-full md:w-[320px] bg-primary border-l border-border z-[55] flex flex-col shadow-2xl animate-in slide-in-from-right">
          <div className="h-14 border-b border-border bg-secondary flex justify-between items-center px-4 shrink-0">
            <div>
              <h3 className="text-info font-bold flex items-center gap-2">
                🤖 NEXUS Command AI
              </h3>
              <p className="text-[9px] text-text-secondary">
                Ask about protocols & operations
              </p>
            </div>
            <button
              onClick={() => setIsStaffAIOpen(false)}
              className="text-text-secondary hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">
                🤖
              </div>
              <div className="bg-secondary border border-border/50 text-white rounded-2xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed max-w-[85%]">
                NEXUS AI online. I have access to current incident data. How can
                I assist?
              </div>
            </div>

            {staffChatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}
              >
                {msg.sender === "ai" && (
                  <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">
                    🤖
                  </div>
                )}
                <div
                  className={`rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] ${msg.sender === "user" ? "bg-info/80 text-white rounded-tr-sm" : "bg-secondary border border-border/50 text-white rounded-tl-sm"}`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {staffChatLoading && (
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">
                  🤖
                </div>
                <div className="bg-secondary border border-border/50 text-text-secondary rounded-xl rounded-tl-sm px-3 py-2 text-xs italic flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                </div>
              </div>
            )}
            <div ref={staffChatEndRef} />
          </div>

          <div className="p-3 border-t border-border bg-secondary shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendStaffChatMessage();
              }}
              className="flex gap-2"
            >
              <button
                type="button"
                onClick={
                  isStaffChatRecording
                    ? () => staffChatRecognitionRef.current?.stop()
                    : startStaffChatRecording
                }
                className={`w-8 h-8 rounded flex flex-shrink-0 items-center justify-center transition border ${isStaffChatRecording ? "bg-critical/20 text-critical border-critical" : "bg-primary border-border text-text-secondary hover:text-white"}`}
                title="Use microphone"
              >
                <Mic
                  className={`w-3.5 h-3.5 ${isStaffChatRecording ? "animate-pulse" : ""}`}
                />
              </button>
              <input
                type="text"
                value={staffChatInput}
                onChange={(e) => setStaffChatInput(e.target.value)}
                placeholder={
                  isStaffChatRecording ? "Listening..." : "Query NEXUS..."
                }
                className="flex-1 min-w-0 bg-primary border border-border rounded px-3 py-2 text-xs text-white outline-none focus:border-info"
              />
              <button
                type="submit"
                disabled={!staffChatInput.trim() || staffChatLoading}
                className="w-8 h-8 flex-shrink-0 rounded bg-info text-primary flex items-center justify-center disabled:opacity-50 transition"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectedStaffRoute({ children }: { children: React.ReactNode }) {
  const isAuth = sessionStorage.getItem("nexus_staff_auth") === "true";
  return isAuth ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<RoleSelector />} />
        <Route path="/guest" element={<GuestDashboard />} />
        <Route
          path="/staff"
          element={
            <ProtectedStaffRoute>
              <StaffDashboard />
            </ProtectedStaffRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
