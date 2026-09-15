'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, CheckCircle2, Clock, MapPin, Stethoscope } from 'lucide-react';

const PROCEDURES = ['ETT', 'Arterial Line', 'CVC', 'Spinal', 'Lumbar Puncture'];
const LOCATIONS = ['Theatre 1', 'Theatre 2', 'Theatre 3', 'Theatre 4', 'PACU', 'ICU'];
const TIMINGS = [0, 5, 10, 15];

export default function ProcedurePingApp() {
  const [role, setRole] = useState<'consultant' | 'trainee'>('consultant');

  // Hardcoded mock user IDs for local testing
  const consultantUser = { id: 'a1111111-1111-1111-1111-111111111111', name: 'Dr. Smith' };
  const traineeUser = { id: 'b2222222-2222-2222-2222-222222222222', name: 'Dr. Taylor (CT1)' };

  // Consultant selection state
  const [proc, setProc] = useState(PROCEDURES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [timing, setTiming] = useState(5);
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);

  // Trainee state
  const [availableProcedures, setAvailableProcedures] = useState<any[]>([]);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  // Fetch initial list & subscribe to Supabase Realtime
  useEffect(() => {
    fetchActiveProcedures();

    const channel = supabase
      .channel('realtime:procedures')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'procedures' },
        (payload) => {
          console.log('Realtime change received:', payload);
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
  }, [activeBroadcast]);

  async function fetchActiveProcedures() {
    const { data, error } = await supabase
      .from('procedures')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching initial procedures:', error);
    }
    if (data) {
      setAvailableProcedures(data);
    }
  }

  // Consultant: Broadcast Procedure with direct alert feedback
  async function handleBroadcast() {
    alert('Button tapped! Checking Supabase connection...');

    try {
      const { data, error } = await supabase
        .from('procedures')
        .insert([
          {
            consultant_id: consultantUser.id,
            consultant_name: consultantUser.name,
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
        alert('Supabase Error: ' + error.message);
        console.error('Supabase insert error details:', error);
        return;
      }

      alert('Success! Broadcast added to database.');
      console.log('Row saved:', data);
      setActiveBroadcast(data);
    } catch (err: any) {
      alert('Local app error: ' + err.message);
      console.error('Crash in handleBroadcast:', err);
    }
  }

  // Trainee: Claim Procedure
  async function handleClaim(id: string) {
    try {
      const { data, error } = await supabase.rpc('claim_procedure', {
        target_procedure_id: id,
        claiming_trainee_id: traineeUser.id,
        claiming_trainee_name: traineeUser.name,
      });

      if (error) {
        alert('Error claiming: ' + error.message);
        return;
      }

      if (data?.success) {
        setClaimStatus('Claimed! Head to ' + data.procedure.location);
      } else {
        setClaimStatus('Opportunity missed! Someone claimed it first.');
      }
      setTimeout(() => setClaimStatus(null), 4000);
    } catch (err: any) {
      alert('Local error claiming: ' + err.message);
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col justify-between p-4 font-sans pb-12">
      {/* Role Switcher Toolbar */}
      <header className="flex justify-between items-center bg-slate-900 text-white p-3 rounded-2xl mb-4 shadow-sm">
        <span className="font-bold tracking-tight text-sm flex items-center gap-1.5">
          <Stethoscope className="w-4 h-4 text-emerald-400" /> ProcedurePing
        </span>
        <div className="flex bg-slate-800 p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setRole('consultant')}
            className={`px-3 py-1 rounded-md transition ${
              role === 'consultant' ? 'bg-emerald-600 font-semibold text-white' : 'text-slate-400'
            }`}
          >
            Consultant
          </button>
          <button
            type="button"
            onClick={() => setRole('trainee')}
            className={`px-3 py-1 rounded-md transition ${
              role === 'trainee' ? 'bg-emerald-600 font-semibold text-white' : 'text-slate-400'
            }`}
          >
            Trainee
          </button>
        </div>
      </header>

      {/* Consultant View */}
      {role === 'consultant' && (
        <section className="flex-1 flex flex-col gap-5">
          {activeBroadcast && activeBroadcast.status === 'open' ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center shadow-sm">
              <div className="animate-pulse flex justify-center mb-3">
                <Bell className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-black text-amber-900">Broadcasting...</h2>
              <p className="text-slate-700 font-medium mt-1">
                {activeBroadcast.procedure_name} in {activeBroadcast.location}
              </p>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="mt-6 w-full py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl text-sm"
              >
                Cancel / Proceed Solo
              </button>
            </div>
          ) : activeBroadcast && activeBroadcast.status === 'claimed' ? (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-6 text-center shadow-sm">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h2 className="text-xl font-black text-emerald-950">Procedure Claimed!</h2>
              <p className="text-emerald-800 font-semibold mt-1">
                {activeBroadcast.claimed_by_name} is on their way.
              </p>
              <button
                type="button"
                onClick={() => setActiveBroadcast(null)}
                className="mt-6 w-full py-3 bg-slate-900 text-white font-bold rounded-xl text-sm"
              >
                Mark Complete / Reset
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
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition active:scale-[0.98] mt-auto cursor-pointer"
              >
                Broadcast Opportunity
              </button>
            </>
          )}
        </section>
      )}

      {/* Trainee View */}
      {role === 'trainee' && (
        <section className="flex-1 flex flex-col gap-3">
          {claimStatus && (
            <div className="p-3 bg-slate-900 text-white font-semibold text-center text-sm rounded-xl">
              {claimStatus}
            </div>
          )}

          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Opportunities</h2>

          {availableProcedures.filter((p) => p.status === 'open').length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-500">No active procedures right now.</p>
              <p className="text-xs text-slate-400 mt-0.5">Keep this tab open for real-time alerts.</p>
            </div>
          ) : (
            availableProcedures
              .filter((p) => p.status === 'open')
              .map((item) => (
                <div key={item.id} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{item.procedure_name}</h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">with {item.consultant_name}</p>
                    </div>
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-lg">
                      {item.ready_in_minutes === 0 ? 'Ready Now' : `In ${item.ready_in_minutes} mins`}
                    </span>
                  </div>

                  <div className="flex items-center text-xs text-slate-600 gap-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {item.location}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleClaim(item.id)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition active:scale-[0.98] cursor-pointer"
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