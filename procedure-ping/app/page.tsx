'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Bell,
  CheckCircle2,
  Clock,
  MapPin,
  Stethoscope,
  User,
  LogOut,
  Building2,
  Lock,
  UserCheck,
} from 'lucide-react';

type HospitalSite = 'BNH' | 'RHCH';
type TrainingStage = 'novice' | 'stage_1' | 'stage_2' | 'stage_3';

const TRAINING_STAGES: { id: TrainingStage; label: string; sub: string }[] = [
  { id: 'novice', label: 'Novice', sub: 'Pre-IAC' },
  { id: 'stage_1', label: 'Stage 1', sub: 'CT1 - CT3' },
  { id: 'stage_2', label: 'Stage 2', sub: 'ST4 - ST5' },
  { id: 'stage_3', label: 'Stage 3', sub: 'ST6 - ST8' },
];

const HOSPITALS: Record<HospitalSite, { name: string; label: string; locations: string[] }> = {
  BNH: {
    name: 'Basingstoke & North Hampshire Hospital',
    label: 'BNH (Basingstoke)',
    locations: [
      'Main Th 1', 'Main Th 2', 'Main Th 3', 'Main Th 4', 'Main Th 5', 'Main Th 6', 'Main Th 7',
      'DTC 1', 'DTC 2', 'DTC 3', 'DTC 4',
      'Maternity Th',
      'LW Room 1', 'LW Room 2', 'LW Room 3', 'LW Room 4',
      'LW Room 5', 'LW Room 6', 'LW Room 7', 'LW Room 8',
    ],
  },
  RHCH: {
    name: 'Royal Hampshire County Hospital',
    label: 'RHCH (Winchester)',
    locations: [
      'Theatre 1', 'Theatre 2', 'Theatre 3', 'Theatre 4', 'Theatre 5',
      'TCA', 'TCB', 'TCC',
      'Heathcote A', 'Heathcote B',
      'HOC 1', 'HOC 2',
      'Labour Ward',
    ],
  },
};

const PROCEDURES = [
  'Arterial Line',
  'Central Line',
  'Spinal',
  'Thoracic Epidural',
  'Lumbar Epidural',
  'Intubation',
  'Awake Tracheal Intubation',
  'Rapid Sequence Induction',
  'Upper Limb Block',
  'Lower Limb Block',
  'Rib Fracture Block',
];

const TIMINGS = [0, 5, 10, 15];

interface UserRecord {
  id: string;
  full_name: string;
  role: 'consultant' | 'resident';
  hospital: HospitalSite;
  stage?: TrainingStage;
  grade_detail?: string;
  is_active: boolean;
}

interface ActiveMission {
  id: string;
  location: string;
  procedure_name: string;
  consultant_name: string;
  expires_at: number;
}

export default function ProcedurePingApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const [activeUsers, setActiveUsers] = useState<UserRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);

  // Consultant Broadcast State
  const [proc, setProc] = useState(PROCEDURES[0]);
  const [location, setLocation] = useState(HOSPITALS.BNH.locations[0]);
  const [timing, setTiming] = useState(5);
  const [targetStages, setTargetStages] = useState<TrainingStage[]>([
    'novice',
    'stage_1',
    'stage_2',
    'stage_3',
  ]);
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Resident Feed & Active Mission State
  const [availableProcedures, setAvailableProcedures] = useState<any[]>([]);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  // 1. Load authentication, user profile, and active mission on startup
  useEffect(() => {
    const savedAuth = localStorage.getItem('procedure_ping_authenticated');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
      fetchUsersAndVerify();
    } else {
      setIsAuthenticated(false);
    }

    const savedMissionStr = localStorage.getItem('procedure_ping_mission_v3');
    if (savedMissionStr) {
      try {
        const parsed: ActiveMission = JSON.parse(savedMissionStr);
        const diff = Math.ceil((parsed.expires_at - Date.now()) / 1000);
        if (diff > 0) {
          setActiveMission(parsed);
          setSecondsRemaining(diff);
        } else {
          localStorage.removeItem('procedure_ping_mission_v3');
        }
      } catch (err) {
        console.error('Failed to parse saved mission', err);
      }
    }
  }, []);

  // 2. Mission Countdown Clock (Only runs while an active mission exists)
  useEffect(() => {
    if (!activeMission) return;

    const interval = setInterval(() => {
      const remaining = Math.ceil((activeMission.expires_at - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsRemaining(0);
      } else {
        setSecondsRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeMission]);

  // 3. Supabase Realtime Listener (Only operates when NOT in an active mission)
  useEffect(() => {
    if (!currentUser || activeMission) return;

    fetchActiveProcedures(currentUser.hospital);

    const channel = supabase
      .channel(`realtime:procedures:${currentUser.hospital}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'procedures',
          filter: `hospital_id=eq.${currentUser.hospital}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (payload.new.status === 'open') {
              setAvailableProcedures((prev) => [
                payload.new,
                ...prev.filter((p) => p.id !== payload.new.id),
              ]);
            }
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.status === 'open') {
              setAvailableProcedures((prev) =>
                prev.map((item) => (item.id === payload.new.id ? payload.new : item))
              );
            } else {
              setAvailableProcedures((prev) =>
                prev.filter((item) => item.id !== payload.new.id)
              );
            }

            if (activeBroadcast && activeBroadcast.id === payload.new.id) {
              setActiveBroadcast(payload.new);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, activeBroadcast, activeMission]);

  async function fetchUsersAndVerify() {
    const { data: users, error } = await supabase
      .from('department_users')
      .select('*')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error || !users) return;

    setActiveUsers(users);

    const savedUserId = localStorage.getItem('procedure_ping_user_id');
    if (savedUserId) {
      const match = users.find((u) => u.id === savedUserId);
      if (match) {
        setCurrentUser(match);
        setLocation(HOSPITALS[match.hospital].locations[0]);
      } else {
        localStorage.removeItem('procedure_ping_user_id');
        setCurrentUser(null);
      }
    }
  }

  async function fetchActiveProcedures(hospital: HospitalSite) {
    const { data, error } = await supabase
      .from('procedures')
      .select('*')
      .eq('hospital_id', hospital)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAvailableProcedures(data);
    }
  }

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasscodeError(false);

    const { data, error } = await supabase
      .from('department_settings')
      .select('access_code')
      .eq('id', 'config')
      .single();

    if (
      !error &&
      data &&
      data.access_code.trim().toLowerCase() === passcodeInput.trim().toLowerCase()
    ) {
      localStorage.setItem('procedure_ping_authenticated', 'true');
      setIsAuthenticated(true);
      fetchUsersAndVerify();
    } else {
      setPasscodeError(true);
    }
  }

  function handleSelectUser(user: UserRecord) {
    localStorage.setItem('procedure_ping_user_id', user.id);
    setCurrentUser(user);
    setLocation(HOSPITALS[user.hospital].locations[0]);
  }

  function handleLogout() {
    if (confirm('Switch user identity?')) {
      localStorage.removeItem('procedure_ping_user_id');
      localStorage.removeItem('procedure_ping_mission_v3');
      setCurrentUser(null);
      setActiveMission(null);
      fetchUsersAndVerify();
    }
  }

  function toggleStage(stage: TrainingStage) {
    if (targetStages.includes(stage)) {
      if (targetStages.length > 1) {
        setTargetStages(targetStages.filter((s) => s !== stage));
      }
    } else {
      setTargetStages([...targetStages, stage]);
    }
  }

  async function handleBroadcast() {
    if (!currentUser || currentUser.role !== 'consultant') return;
    setIsBroadcasting(true);

    try {
      const { data, error } = await supabase
        .from('procedures')
        .insert([
          {
            consultant_id: currentUser.id,
            consultant_name: currentUser.full_name,
            procedure_name: proc,
            location: location,
            ready_in_minutes: timing,
            target_stages: targetStages,
            status: 'open',
            hospital_id: currentUser.hospital,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('Broadcast error:', error);
        return;
      }

      if (data) {
        setActiveBroadcast(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsBroadcasting(false);
    }
  }

  // Resident Claim: Locks UI immediately into mission screen
  async function handleClaim(procedure: any) {
    if (!currentUser || currentUser.role !== 'resident') return;

    const displayName = `${currentUser.full_name} (${currentUser.grade_detail || currentUser.stage})`;
    const durationMins = procedure.ready_in_minutes > 0 ? procedure.ready_in_minutes : 5;
    const expiresAt = Date.now() + durationMins * 60 * 1000;

    const newMission: ActiveMission = {
      id: procedure.id,
      location: procedure.location,
      procedure_name: procedure.procedure_name,
      consultant_name: procedure.consultant_name,
      expires_at: expiresAt,
    };

    // 1. Lock state immediately
    localStorage.setItem('procedure_ping_mission_v3', JSON.stringify(newMission));
    setActiveMission(newMission);
    setSecondsRemaining(durationMins * 60);

    // 2. Notify Supabase database
    try {
      await supabase
        .from('procedures')
        .update({
          status: 'claimed',
          claimed_by_id: currentUser.id,
          claimed_by_name: displayName,
        })
        .eq('id', procedure.id);
    } catch (err) {
      console.error('Error claiming in background:', err);
    }
  }

  function handleArrived() {
    localStorage.removeItem('procedure_ping_mission_v3');
    setActiveMission(null);
    setSecondsRemaining(0);
    if (currentUser) {
      fetchActiveProcedures(currentUser.hospital);
    }
  }

  // SCREEN 1: Passcode Gate
  if (!isAuthenticated) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-900 flex flex-col justify-center p-6 font-sans">
        <div className="bg-white p-7 rounded-3xl shadow-2xl">
          <div className="flex items-center gap-2 mb-2 text-slate-900">
            <Lock className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-black">Department Access</h1>
          </div>
          <p className="text-xs text-slate-600 mb-5 leading-relaxed">
            Enter the HHFT Anaesthetics access passcode to unlock ProcedurePing.
          </p>

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                required
                autoFocus
                placeholder="Enter Access Code (e.g. HHFT2026)"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full p-3.5 rounded-xl border-2 border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-center text-lg uppercase tracking-wider text-slate-900"
              />
              {passcodeError && (
                <p className="text-xs text-red-600 font-bold mt-2 text-center">
                  Invalid passcode. Please check with your College Tutor or Lead.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-lg transition"
            >
              Verify & Enter
            </button>
          </form>
        </div>
      </main>
    );
  }

  // SCREEN 2: User Selection
  if (!currentUser) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-100 flex flex-col p-5 font-sans justify-center">
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-1 text-slate-900">
            <UserCheck className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-black">Select Your Profile</h1>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Choose your name from the rota list. If your name is missing, contact the department administrator.
          </p>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {activeUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelectUser(u)}
                className="w-full p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-400 border border-slate-200 rounded-2xl flex items-center justify-between text-left transition"
              >
                <div>
                  <div className="font-extrabold text-sm text-slate-900">{u.full_name}</div>
                  <div className="text-[11px] text-slate-500">
                    {u.hospital} • {u.role === 'consultant' ? 'Consultant' : `${u.grade_detail || u.stage}`}
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700 uppercase bg-white px-2 py-1 rounded-lg border border-slate-200">
                  Select
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 3: ACTIVE MISSION SCREEN (Locked exclusively on resident screen when procedure is claimed)
  if (currentUser.role === 'resident' && activeMission) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-900 flex flex-col justify-between p-5 font-sans">
        <div className="flex items-center justify-between text-slate-400 text-xs py-2 border-b border-slate-800">
          <span className="font-bold flex items-center gap-1.5 text-white">
            <Stethoscope className="w-4 h-4 text-emerald-400" /> ProcedurePing Active Mission
          </span>
          <span>{currentUser.full_name}</span>
        </div>

        <div className="bg-emerald-600 text-white p-7 rounded-3xl shadow-2xl flex flex-col items-center text-center my-auto">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
            <MapPin className="w-7 h-7 text-white animate-bounce" />
          </div>

          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-200">
            Opportunity Claimed & Secured
          </span>

          <h1 className="text-2xl font-black mt-3 leading-snug">
            Please head to {activeMission.location} to carry out {activeMission.procedure_name}
          </h1>

          <p className="text-base font-semibold text-emerald-100 mt-2">
            with {activeMission.consultant_name}
          </p>

          {/* Countdown timer */}
          <div className="bg-slate-950/40 border border-white/20 rounded-2xl px-6 py-4 mt-6 w-full flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-100 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Ready in:
            </span>
            <span className="font-mono text-2xl font-black tracking-widest text-white">
              {Math.floor(secondsRemaining / 60)}:
              {String(secondsRemaining % 60).padStart(2, '0')}
            </span>
          </div>

          <p className="text-[11px] text-emerald-200 mt-4 leading-relaxed">
            This screen stays locked on your phone until you tap below upon arrival in theatre.
          </p>
        </div>

        <button
          type="button"
          onClick={handleArrived}
          className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition active:scale-[0.98] cursor-pointer"
        >
          I Have Arrived in Theatre
        </button>
      </main>
    );
  }

  const currentHospitalData = HOSPITALS[currentUser.hospital];

  const eligibleProcedures = availableProcedures.filter((p) => {
    if (p.status !== 'open') return false;
    if (currentUser.role === 'resident' && currentUser.stage) {
      if (Array.isArray(p.target_stages) && p.target_stages.length > 0) {
        return p.target_stages.includes(currentUser.stage);
      }
    }
    return true;
  });

  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col justify-between p-4 font-sans pb-10">
      {/* Header */}
      <header className="flex justify-between items-center bg-slate-900 text-white p-3 rounded-2xl mb-3 shadow-md">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-extrabold text-sm leading-tight flex items-center gap-1.5 flex-wrap">
              <span>{currentUser.full_name}</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                {currentUser.role === 'consultant' ? 'Consultant' : currentUser.grade_detail || currentUser.stage}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-slate-500" />
              {currentHospitalData.label}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Switch User"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* ================= CONSULTANT VIEW ================= */}
      {currentUser.role === 'consultant' && (
        <section className="flex-1 flex flex-col gap-3.5">
          {activeBroadcast && activeBroadcast.status === 'open' ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 text-center shadow-md">
              <div className="animate-pulse flex justify-center mb-2">
                <Bell className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-lg font-black text-amber-950">Procedure Broadcasted</h2>
              <p className="text-slate-800 font-bold text-base mt-1">
                {activeBroadcast.procedure_name}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {activeBroadcast.location} ({currentUser.hospital})
              </p>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="mt-5 w-full py-3 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-xl text-xs transition"
              >
                Cancel / Proceed Solo
              </button>
            </div>
          ) : activeBroadcast && activeBroadcast.status === 'claimed' ? (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-3xl p-6 text-center shadow-md">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h2 className="text-lg font-black text-emerald-950">Procedure Accepted!</h2>
              <div className="bg-white border border-emerald-200 rounded-2xl p-3.5 my-3 shadow-sm">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Claimed by</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">
                  {activeBroadcast.claimed_by_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
              >
                Procedure Complete / Reset
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">1. Procedure</label>
                <div className="grid grid-cols-2 gap-1.5 mt-1 max-h-44 overflow-y-auto p-1 bg-slate-100 rounded-2xl border border-slate-200">
                  {PROCEDURES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProc(p)}
                      className={`p-2 text-xs font-semibold rounded-xl border text-left transition ${
                        proc === p
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    2. Target Training Stage(s)
                  </label>
                  <span className="text-[10px] text-slate-400">Select 1 or more</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {TRAINING_STAGES.map((st) => {
                    const isSelected = targetStages.includes(st.id);
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => toggleStage(st.id)}
                        className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-bold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-extrabold text-[11px]">{st.label}</span>
                        <span className={`text-[9px] ${isSelected ? 'text-emerald-100 font-medium' : 'text-slate-400'}`}>
                          {st.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  3. Location ({currentUser.hospital})
                </label>
                <div className="grid grid-cols-3 gap-1 mt-1 max-h-28 overflow-y-auto p-1 bg-slate-100 rounded-xl border border-slate-200">
                  {currentHospitalData.locations.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLocation(l)}
                      className={`p-1.5 text-[11px] font-semibold rounded-lg border text-center transition truncate ${
                        location === l
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm font-bold'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">4. Ready In</label>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  {TIMINGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTiming(t)}
                      className={`p-2 text-xs font-bold rounded-xl border text-center transition ${
                        timing === t
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {t === 0 ? 'Now' : `${t}m`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleBroadcast}
                disabled={isBroadcasting}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-base rounded-2xl shadow-lg transition active:scale-[0.98] mt-auto cursor-pointer"
              >
                {isBroadcasting ? 'Broadcasting...' : `Broadcast ${proc}`}
              </button>
            </>
          )}
        </section>
      )}

      {/* ================= RESIDENT VIEW (FEED) ================= */}
      {currentUser.role === 'resident' && (
        <section className="flex-1 flex flex-col gap-3">
          <div className="flex justify-between items-center mb-0.5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Available at {currentUser.hospital}
              </h2>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                Stage: {currentUser.grade_detail || currentUser.stage}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">Live sync</span>
          </div>

          {eligibleProcedures.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-3xl">
              <Clock className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">No procedures currently open</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Procedures broadcast at {currentUser.hospital} suited for your stage will appear here instantly.
              </p>
            </div>
          ) : (
            eligibleProcedures.map((item) => (
              <div
                key={item.id}
                className="bg-white border-2 border-emerald-500/20 hover:border-emerald-500/40 p-4 rounded-3xl shadow-sm flex flex-col gap-3 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {item.ready_in_minutes === 0 ? 'Ready Now' : `Ready in ${item.ready_in_minutes} mins`}
                    </span>
                    <h3 className="font-black text-base text-slate-900 mt-1">{item.procedure_name}</h3>
                    <div className="text-xs font-bold text-slate-700 mt-0.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      with <span className="text-slate-950 underline decoration-slate-300 underline-offset-2">{item.consultant_name}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center text-xs font-bold text-slate-600 gap-1.5 bg-slate-50 p-2 rounded-xl">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {item.location} ({item.hospital_id})
                </div>

                <button
                  type="button"
                  onClick={() => handleClaim(item)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition active:scale-[0.98] cursor-pointer shadow-md"
                >
                  Accept Procedure
                </button>
              </div>
            ))
          )}
        </section>
      )}
    </main>
  );
}