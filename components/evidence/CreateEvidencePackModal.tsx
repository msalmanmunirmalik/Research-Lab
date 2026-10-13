import React, { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { Field, TextArea } from '../notebook/NotebookFormPrimitives';
import { useEntityOptions } from '../../hooks/useEntityOptions';
import EntityLinkSelect from '../EntityLinkSelect';
import { XMarkIcon } from '../icons';

export type PackBasics = {
  title: string;
  summary: string;
  type: 'experiment' | 'analysis' | 'image' | 'document' | 'code';
  category: string;
  description: string;
  protocolId: string;
  experimentId: string;
  notebookEntryId: string;
  privacy_level: 'personal' | 'team' | 'lab' | 'institution' | 'global';
  tags: string[];
};

type Props = {
  initial?: Partial<PackBasics>;
  isSubmitting?: boolean;
  onCancel: () => void;
  onCreate: (basics: PackBasics) => void | Promise<void>;
};

/** Minimal “new folder” dialog — content is added inside the pack afterward. */
const CreateEvidencePackModal: React.FC<Props> = ({
  initial,
  isSubmitting,
  onCancel,
  onCreate,
}) => {
  const { protocols, experiments, notebookEntries } = useEntityOptions([
    'protocols',
    'experiments',
    'notebook',
  ]);
  const [title, setTitle] = useState(initial?.title || '');
  const [summary, setSummary] = useState(initial?.summary || '');
  const [type, setType] = useState<PackBasics['type']>(initial?.type || 'experiment');
  const [category, setCategory] = useState(initial?.category || 'molecular_biology');
  const [description, setDescription] = useState(initial?.description || '');
  const [protocolId, setProtocolId] = useState(initial?.protocolId || '');
  const [experimentId, setExperimentId] = useState(initial?.experimentId || '');
  const [notebookEntryId, setNotebookEntryId] = useState(initial?.notebookEntryId || '');
  const [showLinks, setShowLinks] = useState(
    Boolean(initial?.protocolId || initial?.experimentId || initial?.notebookEntryId)
  );
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give the pack a name — like a lab folder for this experiment.');
      return;
    }
    setError('');
    await onCreate({
      title: title.trim(),
      summary: summary.trim() || title.trim(),
      type,
      category,
      description,
      protocolId,
      experimentId,
      notebookEntryId,
      privacy_level: initial?.privacy_level || 'lab',
      tags: initial?.tags || [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/45">
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-sky-50/80 via-white to-white flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              New evidence pack
            </h2>
            <p className="mt-1 text-[13px] text-slate-600">
              Like a lab folder for one run — you’ll add notes, tables, sheets, and figures inside
              next.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              {error}
            </div>
          )}
          <Field label="Pack name" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026-03-10_WB_compoundX"
              autoFocus
              required
            />
          </Field>
          <Field label="What is in this folder?" hint="Optional — you can refine later">
            <TextArea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Dose-response blot + densitometry; n=3"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Work type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as PackBasics['type'])}
                options={[
                  { value: 'experiment', label: 'Experiment' },
                  { value: 'analysis', label: 'Analysis' },
                  { value: 'image', label: 'Imaging' },
                  { value: 'document', label: 'Report' },
                  { value: 'code', label: 'Computational' },
                ]}
              />
            </Field>
            <Field label="Field">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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

          {!showLinks ? (
            <button
              type="button"
              onClick={() => setShowLinks(true)}
              className="text-[13px] font-medium text-sky-700 hover:underline"
            >
              + Link experiment / protocol (optional)
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <Field label="Experiment">
                <EntityLinkSelect
                  value={experimentId}
                  options={experiments}
                  onChange={setExperimentId}
                  placeholder="None"
                />
              </Field>
              <Field label="Protocol">
                <EntityLinkSelect
                  value={protocolId}
                  options={protocols}
                  onChange={setProtocolId}
                  placeholder="None"
                />
              </Field>
              <Field label="Notebook">
                <EntityLinkSelect
                  value={notebookEntryId}
                  options={notebookEntries}
                  onChange={setNotebookEntryId}
                  placeholder="None"
                />
              </Field>
              <Field label="Conditions note">
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Batch, lot, time point…"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-[13px] font-medium text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-[13px] font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating…' : 'Create pack & open folder'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateEvidencePackModal;
