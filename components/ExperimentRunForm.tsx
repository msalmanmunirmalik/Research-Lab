import React, { useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import {
  NotebookFormModal,
  Field,
  TextArea,
} from './notebook/NotebookFormPrimitives';
import type { CreateExperimentRunData, ExperimentRun, ExperimentRunStatus } from '../services/experimentService';

function nowLocal(): { date: string; time: string } {
  const d = new Date();
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

type Props = {
  initial?: Partial<ExperimentRun>;
  onSubmit: (data: CreateExperimentRunData) => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  /** Prefill from last run (duplicate) */
  duplicateFrom?: ExperimentRun | null;
};

const ExperimentRunForm: React.FC<Props> = ({
  initial,
  onSubmit,
  onCancel,
  isLoading = false,
  duplicateFrom,
}) => {
  const now = nowLocal();
  const seed = duplicateFrom || initial;
  const [date, setDate] = useState(
    seed?.recordedAt ? String(seed.recordedAt).slice(0, 10) : now.date
  );
  const [time, setTime] = useState(() => {
    if (seed?.recordedAt && String(seed.recordedAt).includes('T')) {
      const t = String(seed.recordedAt).slice(11, 16);
      return t || now.time;
    }
    return duplicateFrom ? now.time : now.time;
  });
  const [title, setTitle] = useState(seed?.title || '');
  const [modifications, setModifications] = useState(seed?.modifications || '');
  const [observations, setObservations] = useState(
    duplicateFrom ? '' : seed?.observations || ''
  );
  const [outcomeSummary, setOutcomeSummary] = useState(
    duplicateFrom ? '' : seed?.outcomeSummary || ''
  );
  const [status, setStatus] = useState<ExperimentRunStatus>(
    (seed?.status as ExperimentRunStatus) || 'completed'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const recordedAt = time ? `${date}T${time}:00` : `${date}T12:00:00`;
    void onSubmit({
      recordedAt,
      title: title.trim() || undefined,
      modifications,
      observations,
      outcomeSummary,
      status,
    });
  };

  const isEdit = Boolean(initial?.id);

  return (
    <NotebookFormModal
      title={isEdit ? 'Edit run' : duplicateFrom ? 'Duplicate run' : 'Log today’s run'}
      subtitle="One bench session — date is set for you; note what changed and what you saw"
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={isLoading ? 'Saving…' : isEdit ? 'Update run' : 'Save run'}
      maxWidth="max-w-lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <Field label="Run label" hint="Optional — e.g. Attempt #3, Repeat after thaw">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Attempt #"
          autoFocus
        />
      </Field>

      <Field
        label="Modifications & conditions"
        hint="Deviations from the SOP, reagents, settings, sample"
      >
        <TextArea
          value={modifications}
          onChange={(e) => setModifications(e.target.value)}
          rows={3}
          placeholder="e.g. 58°C annealing; 50 ng template; Taq instead of Q5"
        />
      </Field>

      <Field label="Observations" hint="What you did and saw at the bench">
        <TextArea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          rows={4}
          placeholder="Step narrative, gel bands, OD, instrument readings…"
        />
      </Field>

      <Field label="Outcome" hint="Brief takeaway for this attempt">
        <TextArea
          value={outcomeSummary}
          onChange={(e) => setOutcomeSummary(e.target.value)}
          rows={2}
          placeholder="e.g. Clear band; needs repeat at higher template"
        />
      </Field>

      <Field label="Status">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ExperimentRunStatus)}
        >
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="needs_repeat">Needs repeat</option>
          <option value="planned">Planned</option>
        </Select>
      </Field>
    </NotebookFormModal>
  );
};

export default ExperimentRunForm;
