import React, { useState } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../../utils/apiBase';
import type { Assessment } from './types';

type FeedbackRow = {
  id: string;
  type: string;
  ok: boolean;
  correct?: string;
  explanation?: string;
};

type Props = {
  courseId: string;
  assessment: Assessment;
  alreadyPassed: boolean;
  hardGate: boolean;
  onPassed: () => void;
};

const AssessmentQuiz: React.FC<Props> = ({
  courseId,
  assessment,
  alreadyPassed,
  hardGate,
  onPassed,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    pass_score: number;
    feedback: FeedbackRow[];
  } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await axios.post(
        `/api/lab-training/${courseId}/assessment/attempt`,
        { answers },
        { headers: getAuthHeaders() }
      );
      setResult(res.data);
      if (res.data.passed) onPassed();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to submit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tt-quiz" id="course-assessment">
      <header className="tt-section-head">
        <p className="tt-kicker">Self-assessment</p>
        <h3>{assessment.title}</h3>
        <p>
          Pass mark: {assessment.pass_score}%
          {hardGate
            ? ' · Required course — you must pass to complete.'
            : ' · Optional course — any honest attempt counts toward completion.'}
        </p>
        {alreadyPassed ? <p className="tt-badge">Already passed</p> : null}
      </header>

      <div className="tt-quiz-questions">
        {assessment.questions.map((q, idx) => (
          <fieldset key={q.id} className="tt-quiz-q">
            <legend>
              {idx + 1}. {q.prompt}
            </legend>
            {q.type === 'tf' ? (
              <div className="tt-quiz-choices">
                {['true', 'false'].map((v) => (
                  <label key={v} className="tt-check">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === v}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                    />
                    {v === 'true' ? 'True' : 'False'}
                  </label>
                ))}
              </div>
            ) : null}
            {q.type === 'mcq' ? (
              <div className="tt-quiz-choices">
                {(q.choices || []).map((c) => (
                  <label key={c.id} className="tt-check">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === c.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            ) : null}
            {q.type === 'reflect' ? (
              <textarea
                className="tt-input"
                rows={3}
                placeholder="Your short reflection"
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            ) : null}
            {result?.feedback?.find((f) => f.id === q.id) ? (
              <p
                className={`tt-quiz-feedback ${
                  result.feedback.find((f) => f.id === q.id)?.ok ? 'is-ok' : 'is-bad'
                }`}
              >
                {result.feedback.find((f) => f.id === q.id)?.explanation}
              </p>
            ) : null}
          </fieldset>
        ))}
      </div>

      {error ? <p className="tt-error">{error}</p> : null}
      {result ? (
        <p className={`tt-quiz-score ${result.passed ? 'is-ok' : 'is-bad'}`}>
          Score {result.score}% · {result.passed ? 'Passed' : `Need ${result.pass_score}% — review and retry`}
        </p>
      ) : null}

      <button
        type="button"
        className="tt-btn tt-btn-primary"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? 'Submitting…' : alreadyPassed || result?.passed ? 'Retake assessment' : 'Submit assessment'}
      </button>
    </section>
  );
};

export default AssessmentQuiz;
