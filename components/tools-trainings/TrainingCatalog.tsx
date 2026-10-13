import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/apiBase';
import CourseComposer from './CourseComposer';
import { CATEGORY_LABEL, courseHref, type TrainingSummary } from './types';

type CatalogCourse = TrainingSummary & { preview?: boolean };

const TrainingCatalog: React.FC = () => {
  const [labId, setLabId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [trainings, setTrainings] = useState<CatalogCourse[]>([]);
  const [starterPreview, setStarterPreview] = useState<CatalogCourse[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/lab-training', { headers: getAuthHeaders() });
      setLabId(res.data.labId || null);
      setCanManage(Boolean(res.data.canManage));
      setTrainings(res.data.trainings || []);
      setStarterPreview(res.data.starterPreview || []);
      setCategories(res.data.categories || Object.keys(CATEGORY_LABEL));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load trainings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const catalog = trainings.length > 0 ? trainings : starterPreview;
  const showingPreview = trainings.length === 0 && starterPreview.length > 0;

  const filtered = useMemo(() => {
    if (filter === 'all') return catalog;
    if (filter === 'required') return catalog.filter((t) => t.is_required);
    return catalog.filter((t) => t.category === filter);
  }, [catalog, filter]);

  const required = catalog.filter((t) => t.is_required);
  const requiredDone = required.filter((t) => t.course_complete || t.progress_pct >= 100).length;
  const overallPct = trainings.length
    ? Math.round(trainings.reduce((s, t) => s + (t.progress_pct || 0), 0) / trainings.length)
    : 0;

  const seedStarter = async () => {
    setBusy(true);
    setError(null);
    try {
      await axios.post('/api/lab-training/seed-starter', {}, { headers: getAuthHeaders() });
      await loadList();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to seed starter pack');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="tt-muted">Loading trainings…</p>;

  return (
    <div className="tt-catalog">
      {showCreate && canManage && labId ? (
        <CourseComposer
          categories={categories}
          onCancel={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void loadList();
          }}
        />
      ) : (
        <>
          <section className="tt-path">
            <div>
              <p className="tt-kicker">
                {labId ? 'Your lab training path' : 'Starter training modules'}
              </p>
              <h2>
                {labId
                  ? 'Become bench-ready, then keep building'
                  : 'Orientation, safety, techniques, language & skills'}
              </h2>
              <p>
                {labId
                  ? 'Work through required orientation and safety first. Optional tracks cover techniques, scientific English, literature skills, and lab culture.'
                  : 'Browse the standard module set below. Join or create a lab to track progress, take quizzes, and let managers customize courses.'}
              </p>
            </div>
            {labId ? (
              <div className="tt-path-stats">
                <div>
                  <strong>
                    {requiredDone}/{required.length || 0}
                  </strong>
                  <span>required complete</span>
                </div>
                <div>
                  <strong>{overallPct}%</strong>
                  <span>overall progress</span>
                </div>
              </div>
            ) : (
              <div className="tt-intro-actions" style={{ margin: 0 }}>
                <Link to="/lab-workspace" className="tt-btn tt-btn-primary">
                  Open Lab workspace
                </Link>
              </div>
            )}
          </section>

          {showingPreview && labId && canManage ? (
            <div className="tt-panel" style={{ marginBottom: '1rem' }}>
              <p className="tt-muted" style={{ marginBottom: '0.75rem' }}>
                Your lab has no published courses yet. Add the starter pack to unlock the modules
                below for your members.
              </p>
              <button
                type="button"
                className="tt-btn tt-btn-primary"
                disabled={busy}
                onClick={() => void seedStarter()}
              >
                {busy ? 'Adding…' : 'Add starter pack'}
              </button>
            </div>
          ) : null}

          <div className="tt-intro-actions">
            {canManage && labId ? (
              <>
                <button
                  type="button"
                  className="tt-btn tt-btn-primary"
                  onClick={() => setShowCreate(true)}
                >
                  New course
                </button>
                {trainings.length === 0 ? (
                  <button
                    type="button"
                    className="tt-btn tt-btn-ghost"
                    disabled={busy}
                    onClick={() => void seedStarter()}
                  >
                    Add starter pack
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="tt-filters">
            <button
              type="button"
              className={`tt-chip ${filter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`tt-chip ${filter === 'required' ? 'is-active' : ''}`}
              onClick={() => setFilter('required')}
            >
              Required path
            </button>
            {(categories.length ? categories : Object.keys(CATEGORY_LABEL)).map((c) => (
              <button
                key={c}
                type="button"
                className={`tt-chip ${filter === c ? 'is-active' : ''}`}
                onClick={() => setFilter(c)}
              >
                {CATEGORY_LABEL[c] || c}
              </button>
            ))}
          </div>

          {error ? <p className="tt-error">{error}</p> : null}

          {filtered.length === 0 ? (
            <div className="tt-panel">
              <p className="tt-muted">
                {canManage
                  ? 'No courses yet — create one or add the starter orientation pack.'
                  : 'No published courses in this lab yet. Ask a manager to add orientation and safety modules.'}
              </p>
            </div>
          ) : (
            <ul className="tt-course-grid">
              {filtered.map((t) => {
                const href = courseHref(t);
                const isPreview = Boolean(t.preview) || showingPreview;
                return (
                  <li key={t.id} className="tt-course-card">
                    <div className="tt-course-card-body">
                      <div className="tt-course-card-head">
                        <h3>{t.title}</h3>
                        {t.is_required ? (
                          <span className="tt-badge">Required</span>
                        ) : (
                          <span className="tt-badge is-muted">
                            {CATEGORY_LABEL[t.category] || t.category}
                          </span>
                        )}
                      </div>
                      <p className="tt-course-id-line">
                        <code>{t.slug || t.id.slice(0, 8)}</code>
                      </p>
                      <p>{t.summary || 'No summary yet.'}</p>
                      {!isPreview ? (
                        <div className="tt-progress" aria-hidden>
                          <span style={{ width: `${t.progress_pct}%` }} />
                        </div>
                      ) : null}
                      <p className="tt-muted" style={{ marginTop: '0.45rem' }}>
                        {isPreview
                          ? `${t.item_count} lessons · ~${t.estimated_minutes} min`
                          : `${t.completed_count}/${t.item_count} lessons · ~${t.estimated_minutes} min`}
                        {t.has_assessment
                          ? t.assessment_passed
                            ? ' · quiz passed'
                            : ' · includes quiz'
                          : ''}
                      </p>
                    </div>
                    {isPreview ? (
                      <Link to="/lab-workspace" className="tt-btn tt-btn-ghost tt-course-cta">
                        {labId ? 'Seed to start' : 'Join a lab'}
                      </Link>
                    ) : (
                      <Link to={href} className="tt-btn tt-btn-primary tt-course-cta">
                        {t.course_complete || t.progress_pct >= 100
                          ? 'Review'
                          : t.progress_pct > 0
                            ? 'Continue'
                            : 'Start'}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default TrainingCatalog;
