/**
 * Mirrors grading rules in server/routes/labTraining.ts
 */
function gradeAssessment(
  questions: any[],
  answers: Record<string, unknown>,
  passScore: number
): { score: number; passed: boolean } {
  const gradable = questions.filter((q) => q.type === 'mcq' || q.type === 'tf');
  const total = gradable.length || 1;
  let correct = 0;
  for (const q of questions) {
    if (q.type === 'reflect') continue;
    const given = answers?.[q.id];
    const ok =
      String(given ?? '').trim().toLowerCase() === String(q.correct ?? '').trim().toLowerCase();
    if (ok) correct += 1;
  }
  const score = Math.round((correct / total) * 100);
  return { score, passed: score >= passScore };
}

describe('lab training assessment grading', () => {
  const questions = [
    { id: 's1', type: 'tf', correct: 'false' },
    { id: 's2', type: 'mcq', correct: 'b' },
    { id: 's3', type: 'reflect' },
  ];

  it('passes at 80% when two of two gradable are correct', () => {
    const r = gradeAssessment(questions, { s1: 'false', s2: 'b', s3: 'notes' }, 80);
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
  });

  it('fails below pass score', () => {
    const r = gradeAssessment(questions, { s1: 'true', s2: 'b', s3: 'notes' }, 80);
    expect(r.score).toBe(50);
    expect(r.passed).toBe(false);
  });
});
