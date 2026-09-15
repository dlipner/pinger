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
  UserPlus,
} from 'lucide-react';

type HospitalSite = 'BNH' | 'RHCH';
type Role = 'consultant' | 'resident';
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

interface UserProfile {
  id: string;
  name: string;
  role: Role;
  hospital: HospitalSite;
  stage?: TrainingStage;
  grade_detail?: string;
}

interface MissionData {
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

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeMission, setActiveMission] = useState<MissionData | null>(null);

  // Form State
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState<Role>('consultant');
  const [regHospital, setRegHospital] = useState<HospitalSite>('BNH');
  const [regStage, setRegStage] = useState<TrainingStage>('novice');
  const [regGrade, setRegGrade] = useState('');

  useEffect(() => {
    const savedAuth = localStorage.getItem('procedure_ping_authenticated');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }

    const savedProfile = localStorage.getItem('procedure_ping_user_profile');
    if (savedProfile) {
      try {
        setCurrentUser(JSON.parse(savedProfile));
      } catch (e) {
        localStorage.removeItem('procedure_ping_user_profile');
      }
    }

    const savedMission = localStorage.getItem('procedure_ping_mission_locked');
    if (savedMission) {
      try {
        const parsed: MissionData = JSON.parse(savedMission);
        if (parsed.expires_at > Date.now()) {
          setActiveMission(parsed);
        } else {
          localStorage.removeItem('procedure_ping_mission_locked');
        }
      } catch (e) {
        localStorage.removeItem('procedure_ping_mission_locked');
      }
    }
  }, []);

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
    } else {
      setPasscodeError(true);
    }
  }

  function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim()) return;

    // Generate a valid UUID so Postgres UUID columns accept it
    const generatedId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');

    const profile: UserProfile = {
      id: generatedId,
      name: regName.trim(),
      role: regRole,
      hospital: regHospital,
      stage: regRole === 'resident' ? regStage : undefined,
      grade_detail: regRole === 'resident' && regGrade.trim() ? regGrade.trim() : undefined,
    };

    localStorage.setItem('procedure_ping_user_profile', JSON.stringify(profile));
    setCurrentUser(profile);
  }

  function handleLogout() {
    if (confirm('Switch user identity / reset profile?')) {
      localStorage.removeItem('procedure_ping_user_profile');
      localStorage.removeItem('procedure_ping_mission_locked');
      setCurrentUser(null);
      setActiveMission(null);
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

  // SCREEN 2: Self Registration
  if (!currentUser) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-100 flex flex-col p-5 font-sans justify-center">
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-1 text-slate-900">
            <UserPlus className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-black">Set Up Your Profile</h1>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Enter your details once. Your phone will remember this setup.
          </p>

          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Dr. Jane Smith"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setRegRole('consultant')}
                  className={`py-3 px-4 rounded-xl border text-center font-bold text-xs transition ${
                    regRole === 'consultant'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Consultant
                </button>
                <button
                  type="button"
                  onClick={() => setRegRole('resident')}
                  className={`py-3 px-4 rounded-xl border text-center font-bold text-xs transition ${
                    regRole === 'resident'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Resident
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Primary Hospital Site
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setRegHospital('BNH')}
                  className={`py-2.5 px-3 rounded-xl border text-center font-bold text-xs transition ${
                    regHospital === 'BNH'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  BNH (Basingstoke)
                </button>
                <button
                  type="button"
                  onClick={() => setRegHospital('RHCH')}
                  className={`py-2.5 px-3 rounded-xl border text-center font-bold text-xs transition ${
                    regHospital === 'RHCH'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  RHCH (Winchester)
                </button>
              </div>
            </div>

            {regRole === 'resident' && (
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Training Stage
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 mt-1">
                    {TRAINING_STAGES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setRegStage(st.id)}
                        className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                          regStage === st.id
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-bold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-extrabold text-[11px]">{st.label}</span>
                        <span
                          className={`text-[9px] ${
                            regStage === st.id ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {st.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Grade / Rota Detail (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CT2, ST4, Fellow"
                    value={regGrade}
                    onChange={(e) => setRegGrade(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-600 font-bold text-xs text-slate-900"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-lg transition cursor-pointer"
            >
              Save Profile & Start
            </button>
          </form>
        </div>
      </main>
    );
  }

  // SCREEN 3: Active Mission Screen for Resident
  if (currentUser.role === 'resident' && activeMission) {
    return (
      <ResidentMissionView
        mission={activeMission}
        user={currentUser}
        onArrived={() => {
          localStorage.removeItem('procedure_ping_mission_locked');
          setActiveMission(null);
        }}
      />
    );
  }

  // SCREEN 4: Main Application
  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col justify-between p-4 font-sans pb-10">
      <header className="flex justify-between items-center bg-slate-900 text-white p-3 rounded-2xl mb-3 shadow-md">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-extrabold text-sm leading-tight flex items-center gap-1.5 flex-wrap">
              <span>{currentUser.name}</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                {currentUser.role === 'consultant' ? 'Consultant' : 'Resident'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-slate-500" />
              {HOSPITALS[currentUser.hospital].label}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Switch User / Edit Profile"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {currentUser.role === 'consultant' ? (
        <ConsultantPanel currentUser={currentUser} />
      ) : (
        <ResidentFeed
          currentUser={currentUser}
          onClaimSuccess={(mission) => {
            localStorage.setItem('procedure_ping_mission_locked', JSON.stringify(mission));
            setActiveMission(mission);
          }}
        />
      )}
    </main>
  );
}

/* ==========================================================================
   RESIDENT ACTIVE MISSION VIEW
   ========================================================================== */
function ResidentMissionView({
  mission,
  user,
  onArrived,
}: {
  mission: MissionData;
  user: UserProfile;
  onArrived: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    Math.max(0, Math.ceil((mission.expires_at - Date.now()) / 1000))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const left = Math.ceil((mission.expires_at - Date.now()) / 1000);
      if (left <= 0) {
        setSecondsRemaining(0);
      } else {
        setSecondsRemaining(left);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [mission.expires_at]);

  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-900 flex flex-col justify-between p-5 font-sans">
      <div className="flex items-center justify-between text-slate-400 text-xs py-2 border-b border-slate-800">
        <span className="font-bold flex items-center gap-1.5 text-white">
          <Stethoscope className="w-4 h-4 text-emerald-400" /> Active Procedure Mission
        </span>
        <span>{user.name}</span>
      </div>

      <div className="bg-emerald-600 text-white p-7 rounded-3xl shadow-2xl flex flex-col items-center text-center my-auto">
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
          <MapPin className="w-7 h-7 text-white animate-bounce" />
        </div>

        <span className="text-[11px] font-black uppercase tracking-widest text-emerald-200">
          Opportunity Claimed & Secured
        </span>

        <h1 className="text-2xl font-black mt-3 leading-snug">
          Please head to {mission.location} to carry out {mission.procedure_name}
        </h1>

        <p className="text-base font-semibold text-emerald-100 mt-2">
          with {mission.consultant_name}
        </p>

        <div className="bg-slate-950/40 border border-white/20 rounded-2xl px-6 py-4 mt-6 w-full flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-100 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Ready in:
          </span>
          <span className="font-mono text-2xl font-black tracking-widest text-white">
            {Math.floor(secondsRemaining / 60)}:
            {String(secondsRemaining % 60).padStart(2, '0')}
          </span>
        </div>

        <p className="text-[11px] text-emerald-200 mt-4">
          This screen is locked and will stay here until you arrive.
        </p>
      </div>

      <button
        type="button"
        onClick={onArrived}
        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition active:scale-[0.98] cursor-pointer"
      >
        I Have Arrived in Theatre
      </button>
    </main>
  );
}

/* ==========================================================================
   RESIDENT FEED VIEW (WITH FAILSAFE AUTO-POLLING)
   ========================================================================== */
function ResidentFeed({
  currentUser,
  onClaimSuccess,
}: {
  currentUser: UserProfile;
  onClaimSuccess: (mission: MissionData) => void;
}) {
  const [procedures, setProcedures] = useState<any[]>([]);

  async function fetchOpen() {
    const { data, error } = await supabase
      .from('procedures')
      .select('*')
      .eq('hospital_id', currentUser.hospital)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProcedures(data);
    }
  }

  useEffect(() => {
    fetchOpen();

    // 1. Supabase Realtime Listener (Without channel filters that drop events)
    const channel = supabase
      .channel('resident-feed-global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'procedures',
        },
        (payload) => {
          const row: any = payload.new;
          if (!row || row.hospital_id !== currentUser.hospital) return;

          if (payload.eventType === 'INSERT') {
            if (row.status === 'open') {
              setProcedures((prev) => [row, ...prev.filter((p) => p.id !== row.id)]);
            }
          } else if (payload.eventType === 'UPDATE') {
            if (row.status === 'open') {
              setProcedures((prev) => prev.map((p) => (p.id === row.id ? row : p)));
            } else {
              setProcedures((prev) => prev.filter((p) => p.id !== row.id));
            }
          }
        }
      )
      .subscribe();

    // 2. Failsafe Polling: Refreshes every 4s in case of hospital network drops
    const pollTimer = setInterval(fetchOpen, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollTimer);
    };
  }, [currentUser.hospital]);

  async function handleClaim(p: any) {
    const displayName = `${currentUser.name} (${currentUser.grade_detail || currentUser.stage})`;
    const mins = p.ready_in_minutes > 0 ? p.ready_in_minutes : 5;
    const expiresAt = Date.now() + mins * 60 * 1000;

    const mission: MissionData = {
      id: p.id,
      location: p.location,
      procedure_name: p.procedure_name,
      consultant_name: p.consultant_name,
      expires_at: expiresAt,
    };

    onClaimSuccess(mission);

    try {
      const { error } = await supabase
        .from('procedures')
        .update({
          status: 'claimed',
          claimed_by_id: currentUser.id,
          claimed_by_name: displayName,
        })
        .eq('id', p.id);

      if (error) {
        console.error('Claim database update error:', error);
      }
    } catch (err) {
      console.error('Database update error:', err);
    }
  }

  const eligible = procedures.filter((p) => {
    if (p.status !== 'open') return false;
    if (currentUser.stage && Array.isArray(p.target_stages) && p.target_stages.length > 0) {
      return p.target_stages.includes(currentUser.stage);
    }
    return true;
  });

  return (
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
        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Live sync
        </span>
      </div>

      {eligible.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-3xl">
          <Clock className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-600">No procedures currently open</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Procedures broadcast at {currentUser.hospital} suited for your stage will appear here instantly.
          </p>
        </div>
      ) : (
        eligible.map((item) => (
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
  );
}

/* ==========================================================================
   CONSULTANT PANEL VIEW
   ========================================================================== */
function ConsultantPanel({ currentUser }: { currentUser: UserProfile }) {
  const [proc, setProc] = useState(PROCEDURES[0]);
  const [location, setLocation] = useState(HOSPITALS[currentUser.hospital].locations[0]);
  const [timing, setTiming] = useState(5);
  const [targetStages, setTargetStages] = useState<TrainingStage[]>([
    'novice',
    'stage_1',
    'stage_2',
    'stage_3',
  ]);
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('consultant-global-listener')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'procedures',
        },
        (payload) => {
          if (activeBroadcast && payload.new.id === activeBroadcast.id) {
            setActiveBroadcast(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBroadcast]);

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
    setIsBroadcasting(true);
    try {
      const { data, error } = await supabase
        .from('procedures')
        .insert([
          {
            consultant_id: currentUser.id,
            consultant_name: currentUser.name,
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
        alert('Database broadcast error: ' + error.message);
        console.error(error);
        return;
      }

      if (data) {
        setActiveBroadcast(data);
      }
    } catch (e: any) {
      alert('Broadcast exception: ' + e.message);
      console.error(e);
    } finally {
      setIsBroadcasting(false);
    }
  }

  if (activeBroadcast && activeBroadcast.status === 'open') {
    return (
      <section className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 text-center shadow-md my-auto">
        <div className="animate-pulse flex justify-center mb-2">
          <Bell className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-lg font-black text-amber-950">Procedure Broadcasted</h2>
        <p className="text-slate-800 font-bold text-base mt-1">{activeBroadcast.procedure_name}</p>
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
      </section>
    );
  }

  if (activeBroadcast && activeBroadcast.status === 'claimed') {
    return (
      <section className="bg-emerald-50 border-2 border-emerald-400 rounded-3xl p-6 text-center shadow-md my-auto">
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
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col gap-3.5">
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
          {HOSPITALS[currentUser.hospital].locations.map((l) => (
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
    </section>
  );
}