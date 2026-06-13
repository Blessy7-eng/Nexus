import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Edit2, Check, AlertTriangle, Mic, X, Map, Bell, Send, Loader2 } from 'lucide-react';
import { io } from 'socket.io-client';

export function GuestDashboard() {
  const navigate = useNavigate();
  const [room, setRoom] = useState(localStorage.getItem('nexus_guest_room') || '');
  const [isEditingRoom, setIsEditingRoom] = useState(!localStorage.getItem('nexus_guest_room'));
  const [tempRoom, setTempRoom] = useState(room);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [sosState, setSosState] = useState<'IDLE' | 'SENT'>('IDLE');
  const [isSosModalOpen, setIsSosModalOpen] = useState(false);
  const [sosTranscript, setSosTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [sosStatusMsg, setSosStatusMsg] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  
  const [isEvacModalOpen, setIsEvacModalOpen] = useState(false);
  const [evacData, setEvacData] = useState<any>(null);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{sender: 'ai' | 'user', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [isChatRecording, setIsChatRecording] = useState(false);
  
  const [staffMessages, setStaffMessages] = useState<any[]>([]);

  const recognitionRef = useRef<any>(null);
  const chatRecognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!room) {
      setStaffMessages([]);
      return;
    }

    // Fetch existing notifications for this room on mount or room change
    fetch(`/api/notifications/guest?roomNumber=${encodeURIComponent(room)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.notifications)) {
          // Reverse so latest messages are shown at the top
          const reversed = [...data.notifications].reverse();
          setStaffMessages(reversed);
        }
      })
      .catch(err => console.error("Error loading guest notifications:", err));

    const socket = io();
    socket.on('guest_notification', (payload) => {
      if (payload.data && String(payload.data.roomNumber).trim() === String(room).trim()) {
        setStaffMessages(prev => [payload.data, ...prev]);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (chatEndRef.current) {
       chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = '';
      
      recognitionRef.current.onresult = (event: any) => {
        const transcriptText = Array.from(event.results)
          .map((r: any) => r[0].transcript).join('');
        setSosTranscript(transcriptText);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };

      chatRecognitionRef.current = new SpeechRecognition();
      chatRecognitionRef.current.continuous = false;
      chatRecognitionRef.current.interimResults = true;
      chatRecognitionRef.current.lang = '';

      chatRecognitionRef.current.onresult = (event: any) => {
        const transcriptText = Array.from(event.results)
          .map((r: any) => r[0].transcript).join('');
        setChatInput(transcriptText);
      };
      
      chatRecognitionRef.current.onend = () => {
        setIsChatRecording(false);
      };
    }
    
    return () => {
       if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch(e){}
       }
       if (chatRecognitionRef.current) {
          try { chatRecognitionRef.current.stop(); } catch(e){}
       }
    };
  }, []);

  const saveRoom = () => {
    if (tempRoom.trim().length > 0) {
      setRoom(tempRoom.trim());
      localStorage.setItem('nexus_guest_room', tempRoom.trim());
      setIsEditingRoom(false);
    }
  };

  const startChatRecording = () => {
    if (!chatRecognitionRef.current) return alert('Speech API not supported in this browser.');
    try {
      setChatInput('');
      setIsChatRecording(true);
      chatRecognitionRef.current.start();
    } catch(e: any) {
      console.error("Guest chat error:", e.message);
      setIsChatRecording(false);
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return alert('Speech API not supported in this browser.');
    try {
      setSosTranscript('');
      setIsRecording(true);
      recognitionRef.current.start();
    } catch(e: any) {
      console.error("SOS recording error:", e.message);
      setIsRecording(false);
    }
  };

  const sendSos = async () => {
    if (!room) return;
    setSosStatusMsg('🔄 Sending alert...');
    try {
      const res = await fetch('/api/sos/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomNumber: room, rawText: sosTranscript, timestamp: new Date().toISOString() })
      });
      if (res.ok) {
        setSosStatusMsg('✓ Alert received by command center');
        setTimeout(() => setSosStatusMsg('✓ Staff being dispatched to Room ' + room), 1500);
        setTimeout(() => {
           setIsSosModalOpen(false);
           setSosState('SENT');
           setSosStatusMsg('');
           setTimeout(() => setSosState('IDLE'), 30000); // Re-enable after 30s
        }, 3000);
      } else {
        setSosStatusMsg('❌ Failed to send alert. CALL 112.');
      }
    } catch (e) {
      setSosStatusMsg('❌ Network error. CALL 112.');
    }
  };

  const loadEvacuation = async () => {
    setIsEvacModalOpen(true);
    if (!isOnline) {
       const cached = localStorage.getItem('nexus_evacuation_cache');
       if (cached) {
         try {
           setEvacData(JSON.parse(cached));
         } catch (e) {
           console.error("Failed to parse cached evacuation data");
         }
       }
       return;
    }
    try {
      const res = await fetch('/api/evacuation/guest');
      const data = await res.json();
      setEvacData(data);
      localStorage.setItem('nexus_evacuation_cache', JSON.stringify(data));
    } catch(e) {
      console.error('Failed to load evac routes');
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, {sender: 'user', text: msg}]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/ai/guest-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, roomNumber: room, language: detectedLanguage })
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, {sender: 'ai', text: data.response}]);
      if (data.detectedLanguage) {
        setDetectedLanguage(data.detectedLanguage);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, {sender: 'ai', text: 'Please call the front desk for assistance. Dial 0.'}]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-primary text-text-primary flex flex-col justify-between max-w-md mx-auto relative overflow-hidden select-none">
      
      {/* HEADER (56px) */}
      <div className="h-14 border-b border-border bg-secondary flex justify-between items-center px-4 shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-text-secondary hover:text-white transition">
           <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="font-bold text-info flex items-center justify-center gap-1">
           <AlertTriangle className="w-4 h-4" /> NEXUS
           <span className="text-[10px] ml-1">{isOnline ? <span className="text-safe">● LIVE</span> : <span className="text-critical animate-pulse">● OFFLINE</span>}</span>
        </div>
        <div className="w-5 h-5 flex-shrink-0"></div>
      </div>

      {/* BODY CONTINUED */}
      <div className="flex-1 flex flex-col p-4 pb-16 md:pb-20 gap-4 overflow-y-auto">
        
        {/* ROOM NUMBER (52px) */}
        <div className="bg-secondary/50 border border-border rounded-lg h-14 flex items-center px-4 justify-between shrink-0">
          {isEditingRoom ? (
            <div className="flex items-center gap-2 w-full">
               <span className="text-text-secondary text-sm whitespace-nowrap">Room:</span>
               <select 
                 value={tempRoom} 
                 onChange={e => setTempRoom(e.target.value)}
                 className="flex-1 bg-primary border border-border rounded px-2 py-1 text-white text-sm outline-none cursor-pointer"
               >
                 <option value="" disabled>Select your room / location</option>
                 <optgroup label="Group 1 — Floor 1" className="text-gray-400 bg-secondary font-sans">
                   <option value="Main Lobby" className="text-white bg-primary">Main Lobby</option>
                   <option value="Restaurant" className="text-white bg-primary">Restaurant</option>
                   <option value="Reception" className="text-white bg-primary">Reception</option>
                 </optgroup>
                 <optgroup label="Group 2 — Floor 4" className="text-gray-400 bg-secondary font-sans">
                   <option value="Room 401" className="text-white bg-primary">Room 401</option>
                   <option value="Room 402" className="text-white bg-primary">Room 402</option>
                   <option value="Room 403" className="text-white bg-primary">Room 403</option>
                   <option value="Room 404" className="text-white bg-primary">Room 404</option>
                   <option value="Room 405" className="text-white bg-primary">Room 405</option>
                   <option value="Room 406" className="text-white bg-primary">Room 406</option>
                   <option value="Room 407" className="text-white bg-primary">Room 407</option>
                   <option value="Room 408" className="text-white bg-primary">Room 408</option>
                   <option value="Room 409" className="text-white bg-primary">Room 409</option>
                   <option value="Room 412" className="text-white bg-primary">Room 412</option>
                   <option value="Elevator Bank B" className="text-white bg-primary">Elevator Bank B</option>
                 </optgroup>
                 <optgroup label="Group 3 — Amenities" className="text-gray-400 bg-secondary font-sans">
                   <option value="Pool Deck" className="text-white bg-primary">Pool Deck</option>
                   <option value="Gym" className="text-white bg-primary">Gym</option>
                   <option value="Sauna" className="text-white bg-primary">Sauna</option>
                   <option value="Sky Bar" className="text-white bg-primary">Sky Bar</option>
                 </optgroup>
                 <optgroup label="Group 4 — Other Areas" className="text-gray-400 bg-secondary font-sans">
                   <option value="Parking Level B2" className="text-white bg-primary">Parking Level B2</option>
                   <option value="Electrical Storage" className="text-white bg-primary">Electrical Storage</option>
                   <option value="Corridor A" className="text-white bg-primary">Corridor A</option>
                   <option value="Corridor B" className="text-white bg-primary">Corridor B</option>
                   <option value="Rooftop" className="text-white bg-primary">Rooftop</option>
                 </optgroup>
               </select>
               <button onClick={saveRoom} className="bg-safe/20 text-safe px-3 py-1 rounded border border-safe/40 text-sm font-bold flex items-center gap-1">
                 <Check className="w-3 h-3" /> Save
               </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
               <span className="text-sm font-bold flex items-center gap-2 text-white">
                  Room: <span className="text-safe text-lg">{room}</span> <Check className="w-4 h-4 text-safe" />
               </span>
               <button onClick={() => setIsEditingRoom(true)} className="p-2 text-text-secondary hover:text-white">
                  <Edit2 className="w-4 h-4" />
               </button>
            </div>
          )}
        </div>

        {/* SOS BUTTON (160px height section) */}
        <div className="flex flex-col items-center justify-center py-4 shrink-0 h-48">
          {sosState === 'IDLE' ? (
            <button 
               onClick={() => {
                 if (!room) return setIsEditingRoom(true);
                 if (!isOnline) return alert("Offline - Call Front Desk (Dial 0)");
                 setIsSosModalOpen(true);
               }}
               className={`w-32 h-32 rounded-full flex flex-col items-center justify-center text-white font-bold transition-transform active:scale-95 ${!room ? 'bg-gray-600 cursor-not-allowed' : 'bg-critical shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse'}`}
            >
              <AlertTriangle className="w-10 h-10 mb-1" />
              <span className="text-sm">HELP</span>
            </button>
          ) : (
            <div className="w-32 h-32 rounded-full bg-safe flex flex-col items-center justify-center text-white font-bold shadow-[0_0_30px_rgba(59,130,246,0.5)]">
              <Check className="w-10 h-10 mb-1" />
              <span className="text-xs text-center px-2">Help Coming!</span>
            </div>
          )}
          {sosState === 'IDLE' && (
             <p className="text-text-secondary mt-4 text-xs font-bold font-mono tracking-widest uppercase">
               {room ? 'Tap to send SOS' : 'Enter room number first'}
             </p>
          )}
          {sosState === 'SENT' && (
             <p className="text-safe mt-4 text-xs font-bold font-mono text-center">
               Staff notified — Room {room}<br/>Est. arrival: 2-4 min
             </p>
          )}
        </div>

        {/* EVACUATION ROUTES (48px) */}
        <button 
          onClick={loadEvacuation}
          className="h-12 w-full bg-secondary/80 border border-info/30 rounded-lg text-info font-bold flex items-center justify-center gap-2 hover:bg-secondary transition shrink-0"
        >
          <Map className="w-4 h-4" /> View Safe Exit Routes
        </button>

        {/* STAFF MESSAGES */}
        <div className="flex-1 bg-secondary/30 rounded flex flex-col border border-border min-h-[100px] overflow-hidden">
           <div className="bg-secondary px-3 py-1.5 border-b border-border flex items-center gap-2 text-xs font-bold text-text-secondary">
              <Bell className="w-3.5 h-3.5" /> Staff Messages
           </div>
           <div className="flex-1 overflow-y-auto p-2 space-y-2">
             {staffMessages.length === 0 ? (
               <div className="h-full flex items-center justify-center text-safe text-sm font-medium">
                  ✓ No alerts — Enjoy your stay!
               </div>
             ) : (
               staffMessages.map((msg, i) => (
                 <div key={i} className="bg-primary border-l-2 border-info p-2.5 rounded shadow-sm relative pr-8 animate-in fade-in slide-in-from-top-1 duration-200">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-bold text-info">{msg.staffName || 'Staff'}</span>
                   </div>
                   <p className="text-sm text-white/90">{msg.message}</p>
                   <button
                     onClick={() => {
                       setStaffMessages(prev => prev.filter((_, index) => index !== i));
                     }}
                     className="absolute top-2.5 right-2 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors duration-155 p-1 cursor-pointer"
                     title="Dismiss notification"
                     aria-label="Dismiss notification"
                   >
                     <X className="w-3.5 h-3.5" />
                   </button>
                 </div>
               ))
             )}
           </div>
        </div>

      </div>

      {/* FIXED SYSTEM FOOTER */}
      <footer className="w-full fixed bottom-0 left-0 z-50 bg-gray-950 border-t border-gray-800 px-3 md:px-6 h-9 flex items-center justify-between select-none font-sans">
        {/* LEFT */}
        <div className="flex items-center text-gray-500 text-[9px] min-[400px]:text-[10px] md:text-xs font-semibold">
          <span className="hidden min-[400px]:inline">© 2026 NEXUS — Delta Techies</span>
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

      {/* ===================== MODALS ===================== */}
      
      {/* 1. SOS MODAL */}
      {isSosModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in slide-in-from-bottom flex justify-between pb-10">
           <div className="flex justify-between items-center">
             <div>
                <h2 className="text-critical text-2xl font-black grow shadow-critical/50 drop-shadow-lg flex items-center gap-2">
                   <AlertTriangle /> REPORT EMERGENCY
                </h2>
                <p className="text-text-secondary text-sm mt-1">Describe what happened using speech or text</p>
             </div>
             <button onClick={() => setIsSosModalOpen(false)} className="bg-secondary/50 p-2 rounded-full text-white/50 hover:text-white">
                <X className="w-6 h-6" />
             </button>
           </div>

           <div className="flex-1 flex flex-col items-center justify-center">
              <button 
                 onClick={isRecording ? () => recognitionRef.current?.stop() : startRecording}
                 className={`w-28 h-28 rounded-full flex flex-col items-center justify-center text-white mb-6 transition-all duration-300 ${isRecording ? 'bg-critical shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-secondary border border-border/80'}`}
              >
                 <Mic className="w-10 h-10 mb-2" />
                 <span className="text-xs font-bold">{isRecording ? "LISTENING..." : "TAP TO SPEAK"}</span>
              </button>

              <textarea 
                 value={sosTranscript}
                 onChange={e => setSosTranscript(e.target.value)}
                 placeholder="Speak or type your emergency in any language..."
                 className="w-full h-24 bg-primary/80 border border-border rounded-lg p-3 text-white placeholder-text-secondary/50 outline-none resize-none"
              />
              {detectedLanguage && (
                 <div className="w-full text-right text-info text-xs mt-1 font-mono">
                    Detected: {detectedLanguage}
                 </div>
              )}
           </div>

           <div className="flex flex-col gap-3">
              {sosStatusMsg && (
                 <div className="bg-primary border border-info/30 rounded p-3 text-info text-sm text-center font-bold tracking-widest w-full">
                    {sosStatusMsg}
                 </div>
              )}
              <button 
                 onClick={sendSos}
                 disabled={!sosTranscript.trim() || !!sosStatusMsg}
                 className="w-full bg-critical py-4 rounded-xl text-white font-black tracking-wider text-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 🚨 SEND EMERGENCY ALERT
              </button>
           </div>
        </div>
      )}

      {/* 2. EVACUATION MODAL */}
      {isEvacModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in slide-in-from-bottom">
           <div className="flex justify-between items-center mb-8">
             <h2 className="text-info text-2xl font-black flex items-center gap-2">
                <Map className="w-6 h-6" /> SAFE ROUTES
             </h2>
             <button onClick={() => setIsEvacModalOpen(false)} className="bg-secondary/50 p-2 rounded-full text-white/50 hover:text-white">
                <X className="w-6 h-6" />
             </button>
           </div>

           {evacData ? (
             <div className="flex flex-col gap-6 text-lg font-medium text-white/90">
                <div className="bg-safe/20 border border-safe/40 rounded-xl p-6">
                   <h3 className="text-safe text-sm font-bold font-mono mb-2 uppercase flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-safe"></div> Nearest Exit
                   </h3>
                   <p className="text-2xl font-bold">{evacData.nearestExit || 'Follow lit exit signs'}</p>
                </div>
                
                <div className="space-y-4 pt-2">
                   {evacData.floorInstructions && Object.entries(evacData.floorInstructions).map(([fl, inst]) => (
                     <div key={fl} className="flex gap-3 items-start">
                        <span className="bg-secondary px-2 py-1 rounded text-sm text-text-secondary shrink-0 font-bold w-12 text-center">F {fl}</span>
                        <p className="pt-0.5">{inst as string}</p>
                     </div>
                   ))}
                </div>

                {evacData.assemblyPoint && (
                   <div className="flex gap-3 items-start mt-2">
                      <span className="text-2xl">📍</span>
                      <div>
                         <p className="text-text-secondary text-sm font-bold">Assembly Point:</p>
                         <p className="text-white">{evacData.assemblyPoint}</p>
                      </div>
                   </div>
                )}

                {evacData.avoidZones && evacData.avoidZones.length > 0 && (
                   <div className="mt-4 border-t border-critical/30 pt-4">
                      <h3 className="text-critical font-bold mb-2 flex items-center gap-2">🔴 AVOID ZONES:</h3>
                      <ul className="list-disc pl-6 text-critical/90">
                         {evacData.avoidZones.map((z:string, i:number) => <li key={i}>{z}</li>)}
                      </ul>
                   </div>
                )}
                
                <div className="mt-auto bg-high/10 text-high p-4 rounded text-center border border-high/30 flex items-center justify-center gap-2">
                   <AlertTriangle className="w-5 h-5" /> 
                   <span>{evacData.specialNote || 'Do NOT use elevators'}</span>
                </div>
             </div>
           ) : (
              <div className="flex-1 flex items-center justify-center">
                 <Loader2 className="w-8 h-8 text-info animate-spin" />
              </div>
           )}
        </div>
      )}

      {/* 3. AI CHAT PANEL */}
      {!isChatOpen && (
        <button
          onClick={() => { setIsChatOpen(true); setHasUnreadChat(false); }}
          className="fixed bottom-[52px] right-6 z-50
            w-14 h-14 rounded-full
            flex items-center justify-center
            transition-all duration-200
            hover:scale-110
            active:scale-95 cursor-pointer"
          style={{
            background: 'rgba(6, 182, 212, 0.15)',
            border: '1.5px solid rgba(6, 182, 212, 0.4)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.2), ' +
                       'inset 0 0 20px rgba(6, 182, 212, 0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 
              '0 0 30px rgba(6, 182, 212, 0.35), ' +
              'inset 0 0 20px rgba(6, 182, 212, 0.1)';
            e.currentTarget.style.background = 
              'rgba(6, 182, 212, 0.22)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 
              '0 0 20px rgba(6, 182, 212, 0.2), ' +
              'inset 0 0 20px rgba(6, 182, 212, 0.05)';
            e.currentTarget.style.background = 
              'rgba(6, 182, 212, 0.15)';
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          
          {/* Notification/Unread dot */}
          {hasUnreadChat && (
            <span className="absolute -top-0.5 -right-0.5
              w-3.5 h-3.5 bg-red-500 rounded-full 
              border-2 border-gray-950
              animate-pulse flex items-center 
              justify-center">
            </span>
          )}
        </button>
      )}

      {isChatOpen && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[380px] bg-primary border-l border-border z-50 flex flex-col shadow-2xl animate-in slide-in-from-right">
           <div className="h-14 border-b border-border bg-secondary flex justify-between items-center px-4 shrink-0">
             <h3 className="text-info font-bold flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-info/20 flex items-center justify-center">🤖</div>
                NEXUS AI Assistant
             </h3>
             <button onClick={() => setIsChatOpen(false)} className="text-text-secondary hover:text-white">
                <X className="w-5 h-5" />
             </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex gap-3">
                 <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">🤖</div>
                 <div className="bg-secondary border border-border/50 text-white rounded-2xl rounded-tl-sm px-4 py-2 text-sm leading-relaxed max-w-[85%]">
                    Hi! I'm NEXUS, your hotel safety assistant. Ask me anything about safety, exits, or emergency procedures — in any language! 🌍
                 </div>
              </div>
              
              {chatMessages.map((msg, idx) => (
                 <div key={idx} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                    {msg.sender === 'ai' && <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">🤖</div>}
                    <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed max-w-[85%] ${msg.sender === 'user' ? 'bg-safe text-white rounded-tr-sm' : 'bg-secondary border border-border/50 text-white rounded-tl-sm'}`}>
                       {msg.text}
                    </div>
                 </div>
              ))}
              {chatLoading && (
                 <div className="flex gap-3">
                   <div className="w-6 h-6 rounded bg-info/20 shrink-0 flex items-center justify-center text-xs mt-1">🤖</div>
                   <div className="bg-secondary border border-border/50 text-text-secondary rounded-2xl rounded-tl-sm px-4 py-2 text-sm italic flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> NEXUS is thinking...
                   </div>
                 </div>
              )}
              <div ref={chatEndRef} />
           </div>
           
           <div className="p-3 border-t border-border bg-secondary shrink-0">
              <form onSubmit={e => { e.preventDefault(); sendChatMessage(); }} className="flex gap-2">
                 <button 
                   type="button" 
                   onClick={isChatRecording ? () => chatRecognitionRef.current?.stop() : startChatRecording}
                   className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${isChatRecording ? 'bg-critical/20 text-critical border-critical' : 'bg-primary border-border text-text-secondary hover:text-white'}`}
                 >
                   <Mic className={`w-4 h-4 ${isChatRecording ? 'animate-pulse' : ''}`} />
                 </button>
                 <input 
                   type="text" 
                   value={chatInput}
                   onChange={e => setChatInput(e.target.value)}
                   placeholder={isChatRecording ? "Listening..." : "Ask about safety..."}
                   className="flex-1 bg-primary border border-border rounded-full px-4 py-2 text-sm text-white outline-none focus:border-info"
                 />
                 <button 
                   type="submit" 
                   disabled={!chatInput.trim() || chatLoading}
                   className="w-10 h-10 rounded-full bg-info text-primary flex items-center justify-center disabled:opacity-50 transition"
                 >
                   <Send className="w-4 h-4 ml-0.5" />
                 </button>
              </form>
           </div>
        </div>
      )}
      
    </div>
  );
}
