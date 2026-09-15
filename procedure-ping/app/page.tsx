'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, CheckCircle2, Clock, MapPin, Stethoscope, User, LogOut, ShieldAlert } from 'lucide-react';

const PROCEDURES = ['ETT', 'Arterial Line', 'CVC', 'Spinal', 'Lumbar Puncture'];
const LOCATIONS = ['Theatre 1', 'Theatre 2', 'Theatre 3', 'Theatre 4', 'PACU', 'ICU'];
const TIMINGS = [0, 5, 10, 15];

interface UserProfile {
  id: string;
  name: string;
  role: 'consultant' | 'resident';
  grade?: string;
}

export default function ProcedurePingApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Setup Form State
  const [setupName, setSetupName] = useState('');
  const [setupRole, setSetupRole] = useState<'consultant' | 'resident'>('consultant');
  const [setupGrade, setSetupGrade] = useState('CT1');

  // Consultant Broadcast State
  const [proc, setProc] = useState(PROCEDURES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [timing, setTiming] = useState(5);
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Resident Feed State
  const [availableProcedures, setAvailableProcedures] = useState<any[]>([]);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  // 1. Load user profile on launch
  useEffect(() => {
    const saved = localStorage.getItem('procedure_ping_profile');
    if (saved) {
      try {
        setProfile(JSON.parse(saved));
      } catch (e) {
        setIsSettingUp(true);
      }
    } else {
      setIsSettingUp(true);
    }
  }, []);

  // 2. Realtime listener
  useEffect(() => {
    if (!profile) return;

    fetchActiveProcedures();

    const channel = supabase
      .channel('realtime:procedures')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'procedures' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAvailableProcedures((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAvailableProcedures((prev) =>
              prev.map((item) => (item.id === payload.new.id ? payload.new : item))
            );
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
  }, [profile, activeBroadcast]);

  async function fetchActiveProcedures() {
    const { data, error } = await supabase
      .from('procedures')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAvailableProcedures(data);
    }
  }

  // Save profile setup
  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!setupName.trim()) return;

    const newProfile: UserProfile = {
      id: crypto.randomUUID(),
      name: setupName.trim(),
      role: setupRole,
      grade: setupRole === 'resident' ? setupGrade : undefined,
    };

    localStorage.setItem('procedure_ping_profile', JSON.stringify(newProfile));
    setProfile(newProfile);
    setIsSettingUp(false);
  }

  function handleResetProfile() {
    if (confirm('Reset your profile and role?')) {
      localStorage.removeItem('procedure_ping_profile');
      setProfile(null);
      setIsSettingUp(true);
    }
  }

  // Consultant: Broadcast Procedure
  async function handleBroadcast() {
    if (!profile || profile.role !== 'consultant') return;
    setIsBroadcasting(true);

    try {
      const { data, error } = await supabase
        .from('procedures')
        .insert([
          {
            consultant_id: profile.id,
            consultant_name: profile.name,
            procedure_name: proc,
            location: location,
            ready_in_minutes: timing,
            status: 'open',
            hospital_id: 'HOSP_1',
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

  // Resident: Claim Procedure
  async function handleClaim(id: string) {
    if (!profile || profile.role !== 'resident') return;

    const displayName = profile.grade ? `${profile.name} (${profile.grade})` : profile.name;

    try {
      const { data, error } = await supabase.rpc('claim_procedure', {
        target_procedure_id: id,
        claiming_trainee_id: profile.id,
        claiming_trainee_name: displayName,
      });

      if (error) {
        console.error('Claim error:', error);
        return;
      }

      if (data?.success) {
        setClaimStatus(`Claimed! Head to ${data.procedure.location}`);
      } else {
        setClaimStatus('Opportunity already claimed by another resident!');
      }
      setTimeout(() => setClaimStatus(null), 4000);
    } catch (err) {
      console.error(err);
    }
  }

  // First-Time Profile Modal
  if (isSettingUp || !profile) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-100 flex flex-col justify-center p-5 font-sans">
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-4 text-slate-900">
            <Stethoscope className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl font-black">Welcome to ProcedurePing</h1>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Identify yourself so colleagues and residents know who is broadcasting or claiming.
          </p>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">I am a:</label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setSetupRole('consultant')}
                  className={`py-3 rounded-xl font-bold text-sm border transition ${
                    setupRole === 'consultant'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Consultant
                </button>
                <button
                  type="button"
                  onClick={() => setSetupRole('resident')}
                  className={`py-3 rounded-xl font-bold text-sm border transition ${
                    setupRole === 'resident'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Resident / Trainee
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Your Full Title & Name</label>
              <input
                type="text"
                required
                placeholder={setupRole === 'consultant' ? 'e.g. Dr. Lipner' : 'e.g. Dr. Alex Taylor'}
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                className="w-full mt-1.5 p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900 bg-white"
              />
            </div>

            {setupRole === 'resident' && (
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Grade / Stage</label>
                <select
                  value={setupGrade}
                  onChange={(e) => setSetupGrade(e.target.value)}
                  className="w-full mt-1.5 p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-900 bg-white"
                >
                  <option value="Novice">Novice</option>
                  <option value="FY2">FY2</option>
                  <option value="CT1">CT1</option>
                  <option value="CT2">CT2</option>
                  <option value="ST4+">ST4+ (Registrar)</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-lg transition mt-4"
            >
              Get Started
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col justify-between p-4 font-sans pb-10">
      {/* Top Header - Locks identity */}
      <header className="flex justify-between items-center bg-slate-900 text-white p-3.5 rounded-2xl mb-4 shadow-md">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-emerald-400" />
          <div>
            <div className="font-extrabold text-sm leading-tight flex items-center gap-1.5">
              {profile.name}
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-bold border border-slate-700">
                {profile.role === 'consultant' ? 'Consultant' : profile.grade || 'Resident'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleResetProfile}
          title="Switch User / Reset Profile"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* ================= CONSULTANT VIEW ================= */}
      {profile.role === 'consultant' && (
        <section className="flex-1 flex flex-col gap-5">
          {activeBroadcast && activeBroadcast.status === 'open' ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 text-center shadow-md">
              <div className="animate-pulse flex justify-center mb-3">
                <Bell className="w-10 h-10 text-amber-600" />
              </div>
              <h2 className="text-xl font-black text-amber-950">Procedure Broadcasted</h2>
              <p className="text-slate-800 font-semibold mt-1">
                {activeBroadcast.procedure_name} in {activeBroadcast.location}
              </p>
              <p className="text-xs text-amber-800 mt-2">Waiting for a resident to accept...</p>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="mt-6 w-full py-3.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-xl text-sm transition"
              >
                Cancel / Proceed Solo
              </button>
            </div>
          ) : activeBroadcast && activeBroadcast.status === 'claimed' ? (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-3xl p-6 text-center shadow-md">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
              <h2 className="text-xl font-black text-emerald-950">Procedure Accepted!</h2>
              <div className="bg-white border border-emerald-200 rounded-2xl p-4 my-4 shadow-sm">
                <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Claimed by</div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {activeBroadcast.claimed_by_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition"
              >
                Procedure Complete / Reset
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Procedure</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {PROCEDURES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProc(p)}
                      className={`p-3 text-sm font-semibold rounded-xl border text-left transition ${
                        proc === p
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">2. Location</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {LOCATIONS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLocation(l)}
                      className={`p-2.5 text-xs font-semibold rounded-xl border text-center transition ${
                        location === l
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">3. Ready In</label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {TIMINGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTiming(t)}
                      className={`p-2.5 text-xs font-bold rounded-xl border text-center transition ${
                        timing === t
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
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
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-lg rounded-2xl shadow-lg transition active:scale-[0.98] mt-auto cursor-pointer"
              >
                {isBroadcasting ? 'Broadcasting...' : 'Broadcast Opportunity'}
              </button>
            </>
          )}
        </section>
      )}

      {/* ================= RESIDENT VIEW ================= */}
      {profile.role === 'resident' && (
        <section className="flex-1 flex flex-col gap-3">
          {claimStatus && (
            <div className="p-3 bg-slate-900 text-white font-semibold text-center text-sm rounded-xl shadow-md">
              {claimStatus}
            </div>
          )}

          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Available Procedures</h2>
            <span className="text-[11px] text-slate-400 font-medium">Real-time alerts active</span>
          </div>

          {availableProcedures.filter((p) => p.status === 'open').length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-3xl">
              <Clock className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-base font-bold text-slate-600">No active procedures</p>
              <p className="text-xs text-slate-400 mt-1">
                When a consultant posts an opportunity, it will appear here instantly with their name.
              </p>
            </div>
          ) : (
            availableProcedures
              .filter((p) => p.status === 'open')
              .map((item) => (
                <div
                  key={item.id}
                  className="bg-white border-2 border-emerald-500/20 hover:border-emerald-500/40 p-4 rounded-3xl shadow-sm flex flex-col gap-3.5 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        {item.ready_in_minutes === 0 ? 'Ready Now' : `Ready in ${item.ready_in_minutes} mins`}
                      </span>
                      <h3 className="font-black text-lg text-slate-900 mt-1.5">{item.procedure_name}</h3>
                      <div className="text-sm font-bold text-slate-700 mt-0.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        with <span className="text-slate-950 underline decoration-slate-300 underline-offset-2">{item.consultant_name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center text-xs font-bold text-slate-600 gap-1.5 bg-slate-50 p-2.5 rounded-xl">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {item.location}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleClaim(item.id)}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl transition active:scale-[0.98] cursor-pointer shadow-md"
                  >
                    Accept Opportunity
                  </button>
                </div>
              ))
          )}
        </section>
      )}
    </main>
  );
}