import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/apiBase';
import { youtubeEmbedUrl } from '../../utils/protocolShare';
import AssessmentQuiz from './AssessmentQuiz';
import {
  CATEGORY_LABEL,
  courseHref,
  type Assessment,
  type TrainingItem,
  type TrainingSummary,
  type TrainingVideo,
} from './types';

type Props = {
  courseId: string;
};

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h4 key={i}>{line.replace(/^##\s+/, '')}</h4>;
    if (line.startsWith('# ')) return <h3 key={i}>{line.replace(/^#\s+/, '')}</h3>;
    if (line.startsWith('- ')) return <li key={i}>{line.replace(/^-\s+/, '')}</li>;
    if (!line.trim()) return <br key={i} />;
    return <p key={i}>{line}</p>;
  });
}

function lessonVideos(item: TrainingItem | null): TrainingVideo[] {
  if (!item) return [];
  if (Array.isArray(item.videos) && item.videos.length) return item.videos;
  if (item.video_url) return [{ url: item.video_url }];
  return [];
}

const TrainingCourseView: React.FC<Props> = ({ courseId }) => {
  const [training, setTraining] = useState<TrainingSummary | null>(null);
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentPassed, setAssessmentPassed] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '',
    item_type: 'document' as TrainingItem['item_type'],
    content_markdown: '',
    videoUrlsText: '',
    external_url: '',
    checklistText: '',
    estimated_minutes: 10,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/lab-training/${courseId}`, { headers: getAuthHeaders() });
      setTraining(res.data.training);
      setItems(res.data.items || []);
      setAssessment(res.data.assessment || null);
      setAssessmentPassed(Boolean(res.data.assessment_passed));
      setCanManage(Boolean(res.data.canManage));
      const first = res.data.items?.[0];
      setActiveItemId((prev) => prev || first?.id || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItem = useMemo(
    () => items.find((i) => i.id === activeItemId) || null,
    [items, activeItemId]
  );
  const videos = lessonVideos(activeItem);
  const activeVideo = videos[activeVideoIdx] || videos[0] || null;
  const embed = youtubeEmbedUrl(activeVideo?.url);

  useEffect(() => {
    setActiveVideoIdx(0);
  }, [activeItemId]);

  const markComplete = async (itemId: string) => {
    setBusy(true);
    setError(null);
    try {
      await axios.post(
        `/api/lab-training/${courseId}/items/${itemId}/complete`,
        {},
        { headers: getAuthHeaders() }
      );
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to mark complete');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('Archive this course for the lab?')) return;
    setBusy(true);
    try {
      await axios.delete(`/api/lab-training/${courseId}`, { headers: getAuthHeaders() });
      window.location.href = '/tools-trainings';
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to archive');
      setBusy(false);
    }
  };

  const addLesson = async () => {
    if (!lessonForm.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const videosPayload = lessonForm.videoUrlsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url, i) => ({ url, title: `Video ${i + 1}` }));
      await axios.post(
        `/api/lab-training/${courseId}/items`,
        {
          title: lessonForm.title.trim(),
          item_type: lessonForm.item_type,
          content_markdown: lessonForm.content_markdown || undefined,
          videos: videosPayload.length ? videosPayload : undefined,
          video_url: videosPayload[0]?.url,
          external_url: lessonForm.external_url || undefined,
          checklist: lessonForm.checklistText
            ? lessonForm.checklistText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
            : undefined,
          estimated_minutes: lessonForm.estimated_minutes,
        },
        { headers: getAuthHeaders() }
      );
      setLessonForm({
        title: '',
        item_type: 'document',
        content_markdown: '',
        videoUrlsText: '',
        external_url: '',
        checklistText: '',
        estimated_minutes: 10,
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to add lesson');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="tt-muted">Loading course…</p>;
  if (!training) {
    return (
      <div className="tt-panel">
        <p className="tt-error">{error || 'Course not found'}</p>
        <Link to="/tools-trainings" className="tt-link">
          ← All courses
        </Link>
      </div>
    );
  }

  const doneCount = items.filter((i) => i.completed).length;

  return (
    <div className="tt-course">
      <div className="tt-course-top">
        <Link to="/tools-trainings" className="tt-link">
          ← All courses
        </Link>
        <p className="tt-muted">
          {doneCount}/{items.length} lessons
          {assessment ? (assessmentPassed ? ' · quiz passed' : ' · quiz pending') : ''}
        </p>
      </div>

      <header className="tt-course-head">
        <p className="tt-kicker">{CATEGORY_LABEL[training.category] || training.category}</p>
        <h1>{training.title}</h1>
        <p>{training.summary}</p>
        <div className="tt-course-id-line">
          <span className="tt-badge is-muted">ID</span>
          <code>{training.id}</code>
          {training.slug ? (
            <>
              <span className="tt-badge is-muted">Slug</span>
              <code>{training.slug}</code>
            </>
          ) : null}
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={() => {
              const path = courseHref(training);
              const url =
                typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
              void navigator.clipboard?.writeText(url);
            }}
          >
            Copy course link
          </button>
        </div>
        <div className="tt-course-meta">
          {training.is_required ? <span className="tt-badge">Required</span> : <span className="tt-badge is-muted">Optional</span>}
          <span className="tt-muted">~{training.estimated_minutes} min</span>
          {training.level ? <span className="tt-muted">{training.level}</span> : null}
          {training.course_complete ? <span className="tt-badge">Course complete</span> : null}
        </div>
        <div className="tt-progress" aria-hidden>
          <span style={{ width: `${training.progress_pct}%` }} />
        </div>
        {training.introduction ? (
          <div className="tt-course-intro">
            <p className="tt-kicker">Course introduction</p>
            <div className="tt-doc">{renderMarkdown(training.introduction)}</div>
          </div>
        ) : null}
        {canManage ? (
          <button type="button" className="tt-btn tt-btn-ghost" disabled={busy} onClick={() => void archive()}>
            Archive course
          </button>
        ) : null}
      </header>

      <div className="tt-course-layout">
        <aside className="tt-toc">
          <p className="tt-kicker">Syllabus</p>
          <ul>
            {items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`tt-toc-item ${activeItemId === item.id ? 'is-active' : ''} ${
                    item.completed ? 'is-done' : ''
                  }`}
                  onClick={() => setActiveItemId(item.id)}
                >
                  <span className="tt-toc-num">{idx + 1}</span>
                  <span>
                    {item.title}
                    <small>
                      {item.item_type}
                      {item.completed ? ' · done' : ''}
                    </small>
                  </span>
                </button>
              </li>
            ))}
            {assessment ? (
              <li>
                <a className="tt-toc-item" href="#course-assessment">
                  <span className="tt-toc-num">✓</span>
                  <span>
                    Self-assessment
                    <small>{assessmentPassed ? 'passed' : `${assessment.pass_score}% to pass`}</small>
                  </span>
                </a>
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="tt-lesson">
          {activeItem ? (
            <>
              <p className="tt-kicker">{activeItem.item_type}</p>
              <h2>{activeItem.title}</h2>

              {embed ? (
                <div className="tt-video">
                  <iframe
                    title={activeVideo?.title || activeItem.title}
                    src={embed}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}

              {videos.length > 1 ? (
                <ul className="tt-video-list">
                  {videos.map((v, idx) => {
                    const ok = !!youtubeEmbedUrl(v.url);
                    return (
                      <li key={`${v.url}-${idx}`}>
                        <button
                          type="button"
                          className={`tt-video-row ${idx === activeVideoIdx ? 'is-active' : ''}`}
                          onClick={() => setActiveVideoIdx(idx)}
                          disabled={!ok}
                        >
                          <span className="tt-video-row-num">{idx + 1}</span>
                          <span>
                            {v.title || `Video ${idx + 1}`}
                            <small>{ok ? 'YouTube' : 'Invalid URL'}</small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {activeItem.item_type === 'link' && activeItem.external_url ? (
                <p>
                  <a
                    href={activeItem.external_url}
                    className="tt-btn tt-btn-primary"
                    target={activeItem.external_url.startsWith('/') ? undefined : '_blank'}
                    rel="noreferrer"
                  >
                    Open resource
                  </a>
                </p>
              ) : null}

              {activeItem.content_markdown ? (
                <div className="tt-doc">{renderMarkdown(activeItem.content_markdown)}</div>
              ) : null}

              {Array.isArray(activeItem.checklist) && activeItem.checklist.length ? (
                <ul className="tt-checklist">
                  {activeItem.checklist.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}

              {!activeItem.completed ? (
                <button
                  type="button"
                  className="tt-btn tt-btn-primary"
                  disabled={busy}
                  onClick={() => void markComplete(activeItem.id)}
                >
                  Mark lesson complete
                </button>
              ) : (
                <p className="tt-badge">Completed</p>
              )}
            </>
          ) : (
            <p className="tt-muted">Select a lesson from the syllabus.</p>
          )}

          {canManage ? (
            <div className="tt-add">
              <p className="tt-kicker">Add lesson (managers)</p>
              <input
                className="tt-input"
                placeholder="Lesson title"
                value={lessonForm.title}
                onChange={(e) => setLessonForm((f) => ({ ...f, title: e.target.value }))}
              />
              <select
                className="tt-input"
                value={lessonForm.item_type}
                onChange={(e) =>
                  setLessonForm((f) => ({
                    ...f,
                    item_type: e.target.value as TrainingItem['item_type'],
                  }))
                }
              >
                <option value="document">Document</option>
                <option value="video">Video (YouTube URLs)</option>
                <option value="link">Link</option>
                <option value="checklist">Checklist</option>
              </select>
              <textarea
                className="tt-input"
                rows={4}
                placeholder="Markdown / notes"
                value={lessonForm.content_markdown}
                onChange={(e) => setLessonForm((f) => ({ ...f, content_markdown: e.target.value }))}
              />
              {lessonForm.item_type === 'video' ? (
                <textarea
                  className="tt-input"
                  rows={3}
                  placeholder="One YouTube URL per line (playlist list view)"
                  value={lessonForm.videoUrlsText}
                  onChange={(e) => setLessonForm((f) => ({ ...f, videoUrlsText: e.target.value }))}
                />
              ) : null}
              {lessonForm.item_type === 'link' ? (
                <input
                  className="tt-input"
                  placeholder="URL or /protocols path"
                  value={lessonForm.external_url}
                  onChange={(e) => setLessonForm((f) => ({ ...f, external_url: e.target.value }))}
                />
              ) : null}
              {lessonForm.item_type === 'checklist' ? (
                <textarea
                  className="tt-input"
                  rows={3}
                  placeholder="One checklist item per line"
                  value={lessonForm.checklistText}
                  onChange={(e) => setLessonForm((f) => ({ ...f, checklistText: e.target.value }))}
                />
              ) : null}
              <button
                type="button"
                className="tt-btn tt-btn-primary"
                disabled={busy || !lessonForm.title.trim()}
                onClick={() => void addLesson()}
              >
                Add lesson
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {assessment ? (
        <AssessmentQuiz
          courseId={courseId}
          assessment={assessment}
          alreadyPassed={assessmentPassed}
          hardGate={Boolean(training.is_required)}
          onPassed={() => {
            setAssessmentPassed(true);
            void load();
          }}
        />
      ) : null}

      {error ? <p className="tt-error">{error}</p> : null}
    </div>
  );
};

export default TrainingCourseView;
