import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { MagnifyingGlassIcon } from '../icons';
import { formatApiNetworkError, getAuthToken, resolveApiBaseUrl } from '../../utils/apiBase';

type Work = {
  title: string;
  year: number | null;
  doi: string | null;
  citationCount: number;
  sourceUrl: string | null;
  isOpenAccess: boolean;
};

type Brief = {
  query: string;
  available: boolean;
  notice: string | null;
  provenance: { source: string; retrievedAt: string; topicId: string | null };
  topic: {
    name: string;
    description: string | null;
    domain: string | null;
    worksCount: number;
    citedByCount: number;
  } | null;
  relatedTopics: Array<{ name: string; worksCount: number }>;
  trend: Array<{ year: number; count: number }>;
  researchers: Array<{
    name: string;
    institution: string | null;
    citedByCount: number;
    sourceUrl: string;
  }>;
  institutions: Array<{
    name: string;
    country: string | null;
    worksCount: number;
    sourceUrl: string;
  }>;
  funders: Array<{ name: string; works: number }>;
  grants: Array<{ id: string; title: string; sponsor: string | null; deadline: string | null }>;
  datasets: Work[];
  clinical: Work[] | null;
  recent: Work[];
};

/** Stable wrapper — must stay outside the parent so typing does not remount the input. */
const PanelShell: React.FC<{
  tone: 'app' | 'folio';
  children: React.ReactNode;
  className?: string;
}> = ({ tone, children, className = '' }) =>
  tone === 'folio' ? (
    <div className={`ws-folio-quiet ${className}`.trim()}>{children}</div>
  ) : (
    <Card>{children}</Card>
  );

const ResearchIntelligencePanel: React.FC<{ initialQuery?: string; tone?: 'app' | 'folio' }> = ({
  initialQuery = '',
  tone = 'app',
}) => {
  const apiBase = resolveApiBaseUrl();
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);

  const run = async () => {
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/research/intelligence?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build the brief');
      setBrief(data.brief);
    } catch (e: unknown) {
      setError(formatApiNetworkError(e) || (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const maxYear = Math.max(1, ...(brief?.trend || []).map((row) => row.count));

  return (
    <div className="space-y-4">
      <PanelShell tone={tone}>
        <div className="space-y-3 p-4">
          <p className="text-[13px] text-slate-600">
            A brief from OpenAlex for this topic: publication trend, researchers, institutions,
            datasets, new papers, and open funding calls already in DRM.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run();
              }}
              placeholder="Topic, method, or disease…"
              className={
                tone === 'folio'
                  ? 'ws-sources-input min-w-0 flex-1'
                  : 'min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[14px]'
              }
              autoComplete="off"
              spellCheck={false}
            />
            {tone === 'folio' ? (
              <button
                type="button"
                className="ws-btn ws-btn-ink shrink-0"
                disabled={loading || q.trim().length < 2}
                onClick={() => void run()}
              >
                {loading ? 'Building…' : 'Build brief'}
              </button>
            ) : (
              <Button
                variant="primary"
                disabled={loading || q.trim().length < 2}
                onClick={() => void run()}
              >
                <span className="inline-flex items-center gap-1">
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  {loading ? 'Building…' : 'Build brief'}
                </span>
              </Button>
            )}
          </div>
        </div>
      </PanelShell>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {brief?.notice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {brief.notice}
        </p>
      ) : null}

      {brief?.available ? (
        <div className="ws-intel-brief space-y-4">
          <p className="text-[11px] text-slate-500">
            Source OpenAlex
            {brief.provenance.retrievedAt
              ? ` · retrieved ${new Date(brief.provenance.retrievedAt).toLocaleString()}`
              : ''}
            {brief.topic?.domain ? ` · ${brief.topic.domain}` : ''}
          </p>

          <div className="ws-intel-top">
            {brief.topic ? (
              <PanelShell tone={tone}>
                <div className="space-y-2 p-4">
                  <h3 className="text-[15px] font-semibold text-slate-900">{brief.topic.name}</h3>
                  {brief.topic.description ? (
                    <p className="text-[13px] leading-relaxed text-slate-700">
                      {brief.topic.description}
                    </p>
                  ) : null}
                  <p className="text-[12px] text-slate-500">
                    {brief.topic.worksCount.toLocaleString()} works ·{' '}
                    {brief.topic.citedByCount.toLocaleString()} citations
                  </p>
                  {brief.relatedTopics.length > 0 ? (
                    <p className="text-[12px] text-slate-600">
                      Related: {brief.relatedTopics.map((topic) => topic.name).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </PanelShell>
            ) : null}

            {brief.trend.length > 0 ? (
              <PanelShell tone={tone}>
                <div className="space-y-2 p-4">
                  <h3 className="text-[13px] font-semibold text-slate-800">Publication trend</h3>
                  <ul className="space-y-1">
                    {brief.trend.map((row) => (
                      <li
                        key={row.year}
                        className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-[12px]"
                      >
                        <span className="text-slate-500">{row.year}</span>
                        <span className="h-2 overflow-hidden rounded bg-slate-100">
                          <span
                            className="block h-2 rounded bg-teal-700"
                            style={{
                              width: `${Math.max(4, Math.round((row.count / maxYear) * 100))}%`,
                            }}
                          />
                        </span>
                        <span className="text-right text-slate-600">
                          {row.count.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </PanelShell>
            ) : null}
          </div>

          <div className="ws-intel-grid">
            <PanelShell tone={tone}>
              <div className="space-y-2 p-4">
                <h3 className="text-[13px] font-semibold text-slate-800">
                  Highly cited researchers linked to this topic
                </h3>
                {brief.researchers.length === 0 ? (
                  <p className="text-[12px] text-slate-500">No researcher list for this topic.</p>
                ) : (
                  <ul className="space-y-2">
                    {brief.researchers.map((person) => (
                      <li key={person.sourceUrl} className="text-[13px]">
                        <a
                          className="font-medium text-teal-800 hover:underline"
                          href={person.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {person.name}
                        </a>
                        <p className="text-[12px] text-slate-500">
                          {[
                            person.institution,
                            `${person.citedByCount.toLocaleString()} career citations`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PanelShell>
            <PanelShell tone={tone}>
              <div className="space-y-2 p-4">
                <h3 className="text-[13px] font-semibold text-slate-800">Institutions</h3>
                {brief.institutions.length === 0 ? (
                  <p className="text-[12px] text-slate-500">No institution list for this topic.</p>
                ) : (
                  <ul className="space-y-2">
                    {brief.institutions.map((place) => (
                      <li key={place.sourceUrl} className="text-[13px]">
                        <a
                          className="font-medium text-teal-800 hover:underline"
                          href={place.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {place.name}
                        </a>
                        <p className="text-[12px] text-slate-500">
                          {[
                            place.country,
                            place.worksCount > 0
                              ? `${place.worksCount.toLocaleString()} works on this topic`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </PanelShell>
            <PanelShell tone={tone}>
              <div className="space-y-3 p-4">
                <h3 className="text-[13px] font-semibold text-slate-800">Funding</h3>
                {brief.funders.length > 0 ? (
                  <p className="text-[12px] text-slate-600">
                    Funders named on highly cited works:{' '}
                    {brief.funders.map((funder) => funder.name).join(' · ')}
                  </p>
                ) : (
                  <p className="text-[12px] text-slate-500">No funder names on the sampled works.</p>
                )}
                {brief.grants.length > 0 ? (
                  <ul className="space-y-2">
                    {brief.grants.map((grant) => (
                      <li key={grant.id}>
                        <Link
                          className="text-[13px] font-medium text-teal-800 hover:underline"
                          to={`/grants-fundings?grantId=${encodeURIComponent(grant.id)}`}
                        >
                          {grant.title}
                        </Link>
                        <p className="text-[12px] text-slate-500">
                          {[grant.sponsor, grant.deadline ? `deadline ${grant.deadline}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-slate-500">
                    No open DRM funding call matched this topic title.
                  </p>
                )}
              </div>
            </PanelShell>
          </div>

          <div className="ws-intel-works">
            <WorkList
              tone={tone}
              title="New literature"
              empty="No recent works for this topic."
              works={brief.recent}
            />
            <WorkList
              tone={tone}
              title="Datasets"
              empty="No dataset records matched this topic."
              works={brief.datasets}
            />
            {brief.clinical ? (
              <div className="space-y-2">
                <WorkList
                  tone={tone}
                  title="Clinical translation signals"
                  empty="No clinical-trial literature matched this topic."
                  works={brief.clinical}
                />
                <p className="text-[11px] text-slate-500">
                  Published works matching a clinical-trial search. This is not medical advice or a
                  trial recommendation.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const WorkList: React.FC<{
  tone: 'app' | 'folio';
  title: string;
  empty: string;
  works: Work[];
}> = ({ tone, title, empty, works }) => {
  const body = (
    <div className="space-y-2 p-4">
      <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
      {works.length === 0 ? (
        <p className="text-[12px] text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {works.map((work) => (
            <li key={`${work.title}-${work.year || ''}`} className="text-[13px]">
              {work.sourceUrl ? (
                <a
                  className="font-medium text-slate-900 hover:underline"
                  href={work.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {work.title}
                </a>
              ) : (
                <span className="font-medium text-slate-900">{work.title}</span>
              )}
              <p className="text-[12px] text-slate-500">
                {[
                  work.year,
                  work.isOpenAccess ? 'open access' : null,
                  `${work.citationCount.toLocaleString()} citations`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  if (tone === 'folio') return <div className="ws-folio-quiet">{body}</div>;
  return <Card>{body}</Card>;
};

export default ResearchIntelligencePanel;
