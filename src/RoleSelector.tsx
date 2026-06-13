import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hotel, User, ShieldCheck, Lock, ArrowRight } from 'lucide-react';

export function RoleSelector() {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [password, setPassword] = useState('nexus2024');
  const [error, setError] = useState(false);

  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'nexus2024') {
      sessionStorage.setItem('nexus_staff_auth', 'true');
      navigate('/staff');
    } else {
      setError(true);
      setPassword('');
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="h-screen w-full bg-primary text-text-primary flex flex-col relative overflow-y-auto select-none custom-visible-scrollbar">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none flex items-center justify-center">
         <Hotel className="w-96 h-96 text-info" />
      </div>

      <div className="z-10 flex flex-col items-center justify-center flex-grow max-w-2xl w-full px-6 py-12 text-center mx-auto my-auto shrink-0">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-high flex items-center justify-center gap-3">
            <Hotel className="w-10 h-10 md:w-12 md:h-12" /> NEXUS
          </h1>
          <h2 className="text-xl md:text-2xl mt-4 font-light text-text-secondary">Hospitality Crisis Command Center</h2>
          <p className="mt-2 text-sm text-info uppercase tracking-widest font-mono">Every Second Counts. Every Life Matters.</p>
          <div className="w-24 h-px bg-white/20 mx-auto mt-6"></div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 w-full max-w-xl mx-auto">
          {/* Guest Card */}
          <button 
            onClick={() => navigate('/guest')}
            className="flex-1 flex flex-col items-center p-8 border border-info/50 rounded-xl bg-secondary/80 hover:bg-secondary hover:shadow-[0_0_25px_rgba(6,182,212,0.2)] hover:border-info/80 transition-all duration-300 group cursor-pointer"
          >
            <User className="w-16 h-16 text-info mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-2">I'm a Guest</h3>
            <p className="text-text-secondary text-sm">Report emergency or get help</p>
          </button>

          {/* Staff Card */}
          <button 
            onClick={() => setShowAuth(true)}
            className="flex-1 flex flex-col items-center p-8 border border-critical/50 rounded-xl bg-secondary/80 hover:bg-secondary hover:shadow-[0_0_25px_rgba(239,68,68,0.2)] hover:border-critical/80 transition-all duration-300 group cursor-pointer"
          >
            <ShieldCheck className="w-16 h-16 text-critical mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold text-white mb-2">I'm Staff</h3>
            <p className="text-text-secondary text-sm">Access command center</p>
          </button>
        </div>
      </div>

      <div className="w-full text-text-secondary text-[10px] sm:text-xs text-center font-mono uppercase py-6 shrink-0 z-10 border-t border-white/5 bg-primary/20 mt-auto">
        FRONT DESK: PRESS 0  |  FIRE EXIT: USE STAIRWELL  |  EMERGENCY: DIAL 112
      </div>

      {/* Staff Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className={`bg-secondary border border-border/50 rounded-xl p-8 w-full max-w-sm ${error ? 'animate-in slide-in-from-left-2 direction-alternate duration-100' : 'animate-in zoom-in-95 duration-200'}`}>
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-critical" /> STAFF AUTHENTICATION
              </h2>
              <p className="text-text-secondary text-sm mt-2">Enter your staff credentials</p>
            </div>

            <form onSubmit={handleStaffLogin} className="flex flex-col gap-4">
              <div>
                <input 
                  type="password" 
                  autoFocus 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter staff password"
                  className={`w-full bg-primary border ${error ? 'border-critical' : 'border-border'} rounded px-4 py-3 text-white placeholder-text-secondary outline-none focus:border-critical transition`}
                />
                <p className="text-gray-400 text-xs italic text-center mt-2">Demo credentials pre-filled for evaluation</p>
                {error && (
                  <p className="text-critical text-xs mt-2 text-center">❌ Invalid credentials. Try again.</p>
                )}
              </div>
              <p className="text-gray-600 text-xs italic text-center mt-1">🎤 Voice authentication — Coming in V2</p>

              <button 
                type="submit" 
                className="w-full bg-critical hover:bg-red-700 text-white font-bold py-3 rounded transition mt-2 flex items-center justify-center gap-2"
              >
                LOGIN <ArrowRight className="w-4 h-4" />
              </button>
              
              <button 
                type="button" 
                onClick={() => {
                  setShowAuth(false);
                  setError(false);
                  setPassword('');
                }}
                className="w-full text-text-secondary hover:text-white text-sm py-2 mt-2 transition"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
