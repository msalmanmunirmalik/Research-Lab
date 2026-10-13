import React, { useMemo, useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import { Field, TextArea, TagListField } from './notebook/NotebookFormPrimitives';
import { useEntityOptions } from '../hooks/useEntityOptions';
import EntityLinkSelect from './EntityLinkSelect';
import EvidenceBlockEditor from './EvidenceBlockEditor';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  SparklesIcon,
} from './icons';
import {
  EvidenceBlock,
  EvidenceFormat,
  EvidenceFileRef,
  blockHasContent,
  buildFilesFromEvidence,
  createEmptyBlock,
  formatsFromBlocks,
  isEvidenceBlockArray,
  narrativeFromBlocks,
  sanitizeBlocksForStorage,
  summarizeEvidence,
} from '../utils/evidenceBlocks';

export type DataResultFormValues = {
  title: string;
  type: 'experiment' | 'analysis' | 'image' | 'document' | 'code';
  category: string;
  summary: string;
  description: string;
  methodology: string;
  results: string;
  conclusions: string;
  tags: string[];
  privacy_level: 'personal' | 'team' | 'lab' | 'institution' | 'global';
  protocolId: string;
  experimentId: string;
  notebookEntryId: string;
  evidenceFormats: EvidenceFormat[];
  evidenceBlocks: EvidenceBlock[];
  metadata: {
    linkedExperiment?: string;
    sampleCount?: number;
    replicates?: number;
    instruments?: string;
    reagents?: string;
    analysisMethod?: string;
    software?: string;
    evidenceFormats?: EvidenceFormat[];
    evidenceBlocks?: EvidenceBlock[];
  };
  fileNames: string[];
  files?: EvidenceFileRef[];
};

type Props = {
  mode?: 'create' | 'edit';
  initialData?: Partial<DataResultFormValues>;
  onSubmit: (data: DataResultFormValues) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
};

type StepId = 'basics' | 'evidence' | 'wrap';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'basics', label: 'Basics', hint: 'Name it' },
  { id: 'evidence', label: 'Evidence', hint: 'Add pack' },
  { id: 'wrap', label: 'Finish', hint: 'Link & save' },
];

const defaultValues: DataResultFormValues = {
  title: '',
  type: 'experiment',
  category: 'molecular_biology',
  summary: '',
  description: '',
  methodology: '',
  results: '',
  conclusions: '',
  tags: [],
  privacy_level: 'lab',
  protocolId: '',
  experimentId: '',
  notebookEntryId: '',
  evidenceFormats: ['narrative'],
  evidenceBlocks: [
    {
      id: 'blk_default_narrative',
      type: 'narrative',
      title: 'Findings',
      body: '',
    },
  ],
  metadata: {},
  fileNames: [],
};

function hydrateInitial(initial?: Partial<DataResultFormValues>): DataResultFormValues {
  const metaBlocks = initial?.metadata?.evidenceBlocks;
  const topBlocks = initial?.evidenceBlocks;
  let blocks: EvidenceBlock[] = isEvidenceBlockArray(topBlocks)
    ? topBlocks
    : isEvidenceBlockArray(metaBlocks)
      ? metaBlocks
      : [];

  const formatsFromMeta = initial?.metadata?.evidenceFormats;
  const formats: EvidenceFormat[] = initial?.evidenceFormats?.length
    ? initial.evidenceFormats
    : Array.isArray(formatsFromMeta) && formatsFromMeta.length
      ? formatsFromMeta
      : blocks.length
        ? formatsFromBlocks(blocks)
        : ['narrative'];

  if (
    blocks.length === 0 &&
    (initial?.results?.trim() || initial?.description?.trim()) &&
    formats.includes('narrative')
  ) {
    blocks = [
      {
        id: `blk_seed_${Date.now().toString(36)}`,
        type: 'narrative',
        title: 'Findings',
        body: initial?.results?.trim() || initial?.description || '',
      },
    ];
  }

  if (blocks.length === 0 && !initial) {
    blocks = defaultValues.evidenceBlocks.map((b) => ({ ...b, id: `blk_${Date.now().toString(36)}` }));
  }

  return {
    ...defaultValues,
    ...initial,
    evidenceFormats: formats,
    evidenceBlocks: blocks,
    metadata: { ...defaultValues.metadata, ...initial?.metadata },
    fileNames: initial?.fileNames || [],
  };
}

export function prepareDataResultPayload(form: DataResultFormValues) {
  const evidenceBlocks = sanitizeBlocksForStorage(form.evidenceBlocks);
  const evidenceFormats = form.evidenceFormats.length
    ? form.evidenceFormats
    : formatsFromBlocks(evidenceBlocks);
  const narrative = narrativeFromBlocks(evidenceBlocks);
  const results = form.results.trim() || narrative;
  const files = buildFilesFromEvidence(evidenceBlocks, form.fileNames);
  const metadata = {
    ...form.metadata,
    linkedExperiment: form.experimentId || form.metadata.linkedExperiment,
    evidenceFormats,
    evidenceBlocks,
  };
  return {
    evidenceBlocks,
    evidenceFormats,
    results,
    files,
    metadata,
    summaryLine: summarizeEvidence(evidenceBlocks),
  };
}

function applyPreset(formats: EvidenceFormat[]): {
  evidenceFormats: EvidenceFormat[];
  evidenceBlocks: EvidenceBlock[];
} {
  return {
    evidenceFormats: formats,
    evidenceBlocks: formats.map((f) => createEmptyBlock(f)),
  };
}

const PRESETS: { id: string; label: string; blurb: string; formats: EvidenceFormat[] }[] = [
  {
    id: 'notes',
    label: 'Quick notes',
    blurb: 'Text only — capture while it is fresh',
    formats: ['narrative'],
  },
  {
    id: 'figure-table',
    label: 'Figure + table',
    blurb: 'Classic gel/blot + quantification',
    formats: ['figure', 'table', 'narrative'],
  },
  {
    id: 'sheet',
    label: 'Instrument export',
    blurb: 'CSV/TSV sheet + short notes',
    formats: ['sheet', 'narrative'],
  },
  {
    id: 'analysis',
    label: 'Full analysis',
    blurb: 'Stats, code, and interpretation',
    formats: ['stats', 'code', 'narrative', 'table'],
  },
];

const DataResultForm: React.FC<Props> = ({
  mode = 'create',
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}) => {
  const { protocols, experiments, notebookEntries } = useEntityOptions([
    'protocols',
    'experiments',
    'notebook',
  ]);
  const [form, setForm] = useState<DataResultFormValues>(() => hydrateInitial(initialData));
  const [step, setStep] = useState<StepId>(
    initialData?.evidenceBlocks?.length || initialData?.results ? 'evidence' : 'basics'
  );
  const [showMoreBasics, setShowMoreBasics] = useState(Boolean(initialData?.description));
  const [error, setError] = useState('');

  const set = <K extends keyof DataResultFormValues>(key: K, value: DataResultFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setMeta = (
    key: keyof DataResultFormValues['metadata'],
    value: string | number | undefined
  ) => {
    setForm((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [key]: value },
    }));
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const filledBlocks = form.evidenceBlocks.filter(blockHasContent).length;
  const packSummary = useMemo(
    () => summarizeEvidence(form.evidenceBlocks),
    [form.evidenceBlocks]
  );

  const basicsOk = Boolean(form.title.trim() && form.summary.trim());

  const save = async () => {
    if (!form.title.trim()) {
      setError('Add a title so you can find this later.');
      setStep('basics');
      return;
    }
    if (!form.summary.trim()) {
      setError('Add a one-line summary for collaborators.');
      setStep('basics');
      return;
    }
    setError('');
    const prepared = prepareDataResultPayload(form);
    await onSubmit({
      ...form,
      results: prepared.results,
      evidenceBlocks: prepared.evidenceBlocks,
      evidenceFormats: prepared.evidenceFormats,
      files: prepared.files,
      fileNames: prepared.files.map((f) => f.name),
      metadata: prepared.metadata,
    });
  };

  const goNext = () => {
    if (step === 'basics' && !basicsOk) {
      setError('Title and summary are required to continue.');
      return;
    }
    setError('');
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].id);
  };

  const goBack = () => {
    setError('');
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
  };

  const pickPreset = (formats: EvidenceFormat[]) => {
    const next = applyPreset(formats);
    setForm((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/45 backdrop-blur-[1px]">
      <div
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-form-title"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-sky-50/90 via-white to-white px-5 sm:px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="evidence-form-title"
                className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight"
              >
                {mode === 'edit' ? 'Edit evidence pack' : 'Log evidence'}
              </h2>
              <p className="mt-1 text-[13px] text-slate-600">
                Three quick steps — name it, add your data, then link & save.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper */}
          <ol className="mt-4 flex items-center gap-1 sm:gap-2">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex;
              return (
                <li key={s.id} className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (i > stepIndex && !basicsOk) {
                        setError('Finish Basics first (title + summary).');
                        return;
                      }
                      setError('');
                      setStep(s.id);
                    }}
                    className={`w-full rounded-xl px-2.5 py-2 text-left border transition-colors ${
                      active
                        ? 'bg-sky-700 text-white border-sky-700 shadow-sm'
                        : done
                          ? 'bg-sky-50 text-sky-900 border-sky-100 hover:bg-sky-100'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                          active
                            ? 'bg-white/20 text-white'
                            : done
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {done ? <CheckIcon className="w-3 h-3" /> : i + 1}
                      </span>
                      <span className="text-[12px] sm:text-[13px] font-semibold truncate">
                        {s.label}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 text-[10px] sm:text-[11px] truncate pl-6 ${
                        active ? 'text-sky-100' : 'text-slate-400'
                      }`}
                    >
                      {s.hint}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
              {error}
            </div>
          )}

          {step === 'basics' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                  What is this result?
                </h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Keep it concrete — future you will search by this title.
                </p>
              </div>

              <Field label="Title" required>
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. qPCR run 12 — Ct values + melt curves"
                  autoFocus
                  required
                />
              </Field>

              <Field
                label="One-line summary"
                required
                hint="What a collaborator should understand in 10 seconds"
              >
                <TextArea
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  rows={2}
                  placeholder="e.g. Dose-response for compound X; n=3; figure + quantification"
                  required
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Work type">
                  <Select
                    value={form.type}
                    onChange={(e) => set('type', e.target.value as DataResultFormValues['type'])}
                    options={[
                      { value: 'experiment', label: 'Experiment outputs' },
                      { value: 'analysis', label: 'Analysis / derived' },
                      { value: 'image', label: 'Imaging-focused' },
                      { value: 'document', label: 'Report / write-up' },
                      { value: 'code', label: 'Computational' },
                    ]}
                  />
                </Field>
                <Field label="Research field">
                  <Select
                    value={form.category}
                    onChange={(e) => set('category', e.target.value)}
                    options={[
                      { value: 'molecular_biology', label: 'Molecular biology' },
                      { value: 'cell_biology', label: 'Cell biology' },
                      { value: 'biochemistry', label: 'Biochemistry' },
                      { value: 'microbiology', label: 'Microbiology' },
                      { value: 'bioinformatics', label: 'Bioinformatics' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </Field>
              </div>

              {!showMoreBasics ? (
                <button
                  type="button"
                  onClick={() => setShowMoreBasics(true)}
                  className="text-[13px] font-medium text-sky-700 hover:underline"
                >
                  + Add context / conditions (optional)
                </button>
              ) : (
                <Field label="Context / conditions" hint="Sample IDs, time points, treatments, batch notes">
                  <TextArea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={3}
                    placeholder="Optional — helps when re-reading months later"
                  />
                </Field>
              )}
            </div>
          )}

          {step === 'evidence' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">
                    Add your data
                  </h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Pick a starter, then toggle formats. Mix freely — text + image + table is normal.
                  </p>
                </div>
                <p className="text-[12px] text-slate-500 shrink-0">{packSummary}</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPreset(p.formats)}
                    className="text-left rounded-xl border border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40 px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
                      <SparklesIcon className="w-3.5 h-3.5 text-sky-600" />
                      {p.label}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">{p.blurb}</p>
                  </button>
                ))}
              </div>

              <EvidenceBlockEditor
                blocks={form.evidenceBlocks}
                activeFormats={form.evidenceFormats}
                onFormatsChange={(evidenceFormats) => set('evidenceFormats', evidenceFormats)}
                onBlocksChange={(evidenceBlocks) => set('evidenceBlocks', evidenceBlocks)}
                compact
              />
            </div>
          )}

          {step === 'wrap' && (
            <div className="space-y-6 max-w-2xl">
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3">
                <p className="text-[13px] font-medium text-slate-900">{form.title || 'Untitled'}</p>
                <p className="text-[12px] text-slate-600 mt-0.5 line-clamp-2">
                  {form.summary || 'No summary'}
                </p>
                <p className="text-[11px] text-sky-800 mt-1.5">
                  {filledBlocks} evidence block{filledBlocks === 1 ? '' : 's'} ready · {packSummary}
                </p>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight mb-1">
                  Interpretation
                </h3>
                <p className="text-[12px] text-slate-500 mb-3">Optional — fill what you know now.</p>
                <div className="space-y-3">
                  <Field label="Methods (brief)">
                    <TextArea
                      value={form.methodology}
                      onChange={(e) => set('methodology', e.target.value)}
                      rows={2}
                      placeholder="Instrument, pipeline, software…"
                    />
                  </Field>
                  <Field label="Conclusions">
                    <TextArea
                      value={form.conclusions}
                      onChange={(e) => set('conclusions', e.target.value)}
                      rows={2}
                      placeholder="What this means; caveats; next step…"
                    />
                  </Field>
                </div>
              </div>

              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight mb-1">
                  Link to lab work
                </h3>
                <p className="text-[12px] text-slate-500 mb-3">
                  Provenance makes results citable. Skip if you are just capturing raw notes.
                </p>
                <div className="space-y-3">
                  <Field label="Experiment">
                    <EntityLinkSelect
                      value={form.experimentId}
                      options={experiments}
                      onChange={(id) => set('experimentId', id)}
                      placeholder="None"
                    />
                  </Field>
                  <Field label="Protocol">
                    <EntityLinkSelect
                      value={form.protocolId}
                      options={protocols}
                      onChange={(id) => set('protocolId', id)}
                      placeholder="None"
                    />
                  </Field>
                  <Field label="Notebook entry">
                    <EntityLinkSelect
                      value={form.notebookEntryId}
                      options={notebookEntries}
                      onChange={(id) => set('notebookEntryId', id)}
                      placeholder="None"
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Samples (n)">
                  <Input
                    type="number"
                    value={form.metadata.sampleCount ?? ''}
                    onChange={(e) =>
                      setMeta('sampleCount', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </Field>
                <Field label="Replicates">
                  <Input
                    type="number"
                    value={form.metadata.replicates ?? ''}
                    onChange={(e) =>
                      setMeta('replicates', e.target.value ? Number(e.target.value) : undefined)
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TagListField
                  label="Tags"
                  values={form.tags}
                  onChange={(v) => set('tags', v)}
                  placeholder="Add tag"
                />
                <Field label="Visibility">
                  <Select
                    value={form.privacy_level}
                    onChange={(e) =>
                      set(
                        'privacy_level',
                        e.target.value as DataResultFormValues['privacy_level']
                      )
                    }
                    options={[
                      { value: 'personal', label: 'Only me' },
                      { value: 'team', label: 'My team' },
                      { value: 'lab', label: 'My lab' },
                      { value: 'institution', label: 'Institution' },
                      { value: 'global', label: 'Public' },
                    ]}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium text-slate-500 hover:text-slate-800 px-2 py-2"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Back
              </button>
            )}
            {step !== 'wrap' ? (
              <>
                {basicsOk && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void save()}
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-[13px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : 'Save now'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-1 px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800"
                >
                  Continue
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void save()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                {isSubmitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save evidence pack'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataResultForm;
