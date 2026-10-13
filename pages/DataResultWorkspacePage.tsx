import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EvidencePackWorkspace from '../components/evidence/EvidencePackWorkspace';
import { apiUrl, getAuthHeaders } from '../utils/apiBase';
import { resultWorkspaceUrl } from '../utils/evidenceChain';
import {
  buildFilesFromPack,
  EvidencePackData,
  loadPackFromMetadata,
  sanitizePackForStorage,
} from '../utils/evidencePack';

type ResultRow = {
  id: string;
  title: string;
  summary: string;
  status: string;
  type: string;
  category: string;
  description?: string;
  methodology?: string;
  results?: string;
  conclusions?: string;
  tags?: string[];
  privacy_level?: string;
  privacyLevel?: string;
  protocol_id?: string | null;
  protocolId?: string | null;
  experiment_id?: string | null;
  experimentId?: string | null;
  notebook_entry_id?: string | null;
  notebookEntryId?: string | null;
  metadata?: Record<string, unknown>;
  author?: string;
  date?: string;
};

function pickId(row: ResultRow, camel: keyof ResultRow, snake: keyof ResultRow): string | null {
  const a = row[camel];
  const b = row[snake];
  const v = a ?? b;
  return v ? String(v) : null;
}

const DataResultWorkspacePage: React.FC = () => {
  const { resultId = '', experimentId: routeExperimentId } = useParams<{
    resultId: string;
    experimentId?: string;
  }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<ResultRow | null>(null);
  const [experimentTitle, setExperimentTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!resultId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/data/results/${encodeURIComponent(resultId)}`), {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Result not found');
      }
      const data = await res.json();
      const row = (data.result || data) as ResultRow;
      setEntry(row);

      const expId = pickId(row, 'experimentId', 'experiment_id');
      // Canonical URL: prefer experiment-scoped route when linked
      if (expId && routeExperimentId !== expId) {
        navigate(resultWorkspaceUrl({ resultId: row.id, experimentId: expId }), { replace: true });
        return;
      }
      if (!expId && routeExperimentId) {
        navigate(resultWorkspaceUrl({ resultId: row.id }), { replace: true });
        return;
      }

      if (expId) {
        try {
          const er = await fetch(apiUrl(`/experiments/${encodeURIComponent(expId)}`), {
            headers: getAuthHeaders(),
          });
          if (er.ok) {
            const ed = await er.json();
            setExperimentTitle(ed.title || ed.name || 'Experiment');
          }
        } catch {
          setExperimentTitle(null);
        }
      } else {
        setExperimentTitle(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load result');
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [resultId, routeExperimentId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePack = async (patch: {
    title: string;
    summary: string;
    methodology: string;
    conclusions: string;
    pack: EvidencePackData;
  }) => {
    if (!entry) return;
    setSaving(true);
    setError('');
    try {
      const clean = sanitizePackForStorage(patch.pack);
      const files = buildFilesFromPack(clean.artifacts);
      const experimentId = pickId(entry, 'experimentId', 'experiment_id');
      const protocolId = pickId(entry, 'protocolId', 'protocol_id');
      const notebookEntryId = pickId(entry, 'notebookEntryId', 'notebook_entry_id');
      const res = await fetch(apiUrl(`/data/results/${encodeURIComponent(entry.id)}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: patch.title,
          type: entry.type,
          category: entry.category,
          summary: patch.summary,
          description: entry.description || '',
          methodology: patch.methodology,
          results: entry.results || '',
          conclusions: patch.conclusions,
          tags: entry.tags || [],
          privacy_level: entry.privacyLevel || entry.privacy_level || 'lab',
          protocolId,
          experimentId,
          notebookEntryId,
          files,
          metadata: {
            ...(entry.metadata || {}),
            pack: clean,
            artifactKinds: clean.artifacts.map((a) => a.kind),
          },
          status: entry.status,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Save failed');
      }
      const updated = await res.json();
      const row = (updated.result || updated) as ResultRow;
      setEntry({ ...entry, ...row, title: patch.title, summary: patch.summary });
    } catch (err: any) {
      setError(err?.message || 'Could not save');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const deletePack = async () => {
    if (!entry || !confirm(`Delete "${entry.title}"?`)) return;
    try {
      await fetch(apiUrl(`/data/results/${encodeURIComponent(entry.id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const expId = pickId(entry, 'experimentId', 'experiment_id');
      navigate(expId ? `/experiments/${encodeURIComponent(expId)}?tab=findings` : '/data-results');
    } catch {
      setError('Could not delete');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center text-[13px] text-slate-500">
        Opening result…
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center">
        <p className="text-[15px] font-medium text-slate-900 mb-2">{error || 'Result not found'}</p>
        <Link to="/data-results" className="text-[13px] text-sky-700 hover:underline">
          Back to Data & Results
        </Link>
      </div>
    );
  }

  const experimentId = pickId(entry, 'experimentId', 'experiment_id');
  const pack = loadPackFromMetadata(entry.metadata);

  return (
    <div className="pb-8">
      {error && (
        <div className="max-w-7xl mx-auto mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}
      <EvidencePackWorkspace
        key={entry.id}
        entry={{
          id: entry.id,
          title: entry.title,
          summary: entry.summary || '',
          status: entry.status,
          type: entry.type,
          category: entry.category,
          methodology: entry.methodology,
          conclusions: entry.conclusions,
          protocolId: pickId(entry, 'protocolId', 'protocol_id'),
          experimentId,
          notebookEntryId: pickId(entry, 'notebookEntryId', 'notebook_entry_id'),
          metadata: entry.metadata,
        }}
        pack={pack}
        isSaving={saving}
        backHref={experimentId ? `/experiments/${encodeURIComponent(experimentId)}` : '/data-results'}
        backLabel={experimentId ? 'Experiment' : 'All results'}
        experimentTitle={experimentTitle}
        onDeletePack={() => void deletePack()}
        onSavePack={async (patch) => {
          await savePack(patch);
        }}
      />
    </div>
  );
};

export default DataResultWorkspacePage;
