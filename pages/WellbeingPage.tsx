import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PagePanel } from '../components/PageHeader';
import { HeartIcon, ShieldCheckIcon } from '../components/icons';
import { apiUrl, getAuthHeaders, formatApiNetworkError } from '../utils/apiBase';

type Checkin = {
  id: string;
  workload: number;
  energy: number;
  note?: string | null;
  created_at: string;
};

const SCORE_LABELS = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high'];

const WellbeingPage: React.FC = () => {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [workload, setWorkload] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/wellbeing/me'), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setCheckins(data.checkins || []);
    } catch (err) {
      setError(formatApiNetworkError(err, 'Could not load check-ins'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const res = await fetch(apiUrl('/wellbeing/checkins'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ workload, energy, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setNote('');
      setSavedMsg('Saved privately — not shared with your lab or PI.');
      await load();
    } catch (err) {
      setError(formatApiNetworkError(err, 'Could not save check-in'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this private check-in?')) return;
    try {
      const res = await fetch(apiUrl(`/wellbeing/checkins/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Delete failed');
      setCheckins((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(formatApiNetworkError(err, 'Could not delete check-in'));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Researcher wellbeing"
        subtitle="Voluntary, private check-ins — not diagnosis, not surveillance, never shared with your lab by default."
        accent="rose"
        icon={<HeartIcon />}
      />

      <PagePanel className="border-rose-100 bg-rose-50/40">
        <div className="flex gap-3 text-[13px] text-slate-700">
          <ShieldCheckIcon className="h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-slate-900">Privacy first</p>
            <p>
              Only your account can read these entries. RILOS does not surface them on lab dashboards
              or PI review. For crisis support, contact local services — this is not a clinical tool.
            </p>
            <p className="text-[12px] text-slate-500">
              Related practice:{' '}
              <Link to="/tools-trainings" className="underline underline-offset-2 hover:text-slate-800">
                Trainings
              </Link>{' '}
              (lab orientation and skill courses).
            </p>
          </div>
        </div>
      </PagePanel>

      <PagePanel>
        <h2 className="text-[15px] font-semibold text-slate-900">How are you today?</h2>
        <p className="mt-1 text-[12px] text-slate-500">Optional. Skip anytime.</p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <label className="block">
            <span className="text-[13px] font-medium text-slate-700">
              Workload — {SCORE_LABELS[workload]}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={workload}
              onChange={(e) => setWorkload(Number(e.target.value))}
              className="mt-2 w-full accent-rose-700"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-slate-700">
              Energy — {SCORE_LABELS[energy]}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={energy}
              onChange={(e) => setEnergy(Number(e.target.value))}
              className="mt-2 w-full accent-teal-700"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-slate-700">Private note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What would help this week? Deadlines, experiments, rest…"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            />
          </label>

          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          {savedMsg ? <p className="text-[13px] text-teal-800">{savedMsg}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-rose-800 px-4 py-2 text-[13px] font-medium text-white hover:bg-rose-900 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save private check-in'}
          </button>
        </form>
      </PagePanel>

      <PagePanel>
        <h2 className="text-[15px] font-semibold text-slate-900">Your recent check-ins</h2>
        {loading ? (
          <p className="mt-3 text-[13px] text-slate-500">Loading…</p>
        ) : checkins.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">No check-ins yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {checkins.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-[13px] font-medium text-slate-900">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    Workload {c.workload}/5 · Energy {c.energy}/5
                  </p>
                  {c.note ? (
                    <p className="mt-1 text-[13px] text-slate-700 whitespace-pre-wrap">{c.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  className="text-[12px] text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </PagePanel>
    </div>
  );
};

export default WellbeingPage;
