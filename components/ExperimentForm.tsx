import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Input from './ui/Input';
import {
  NotebookFormModal,
  FormSection,
  Field,
  TextArea,
} from './notebook/NotebookFormPrimitives';
import { BeakerIcon, ChartBarIcon, PlusIcon } from './icons';
import { useEntityOptions, fetchProtocolOptions } from '../hooks/useEntityOptions';
import EntityLinkSelect from './EntityLinkSelect';
import { evidenceFromRecordUrl, experimentFromProtocolUrl } from '../utils/evidenceChain';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../utils/apiBase';
import Button from './ui/Button';

export interface ExperimentFormData {
  title: string;
  startDate: string;
  startTime: string;
  objective: string;
  description: string;
  protocolId: string;
  experimentId: string;
  protocolModifications: string;
  problems: string;
  troubleshooting: string;
  resultsLink: string;
  conditions: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  /** Tracker-only: combined modifications & conditions */
  modifications?: string;
  /** Tracker-only: run findings */
  findings?: string;
}

interface Protocol {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
}

interface ExperimentFormProps {
  initialData?: Partial<ExperimentFormData>;
  protocols?: Protocol[];
  onSubmit: (data: ExperimentFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: 'notebook' | 'tracker';
  banner?: React.ReactNode;
  submitLabel?: string;
}

function nowFields(): Pick<ExperimentFormData, 'startDate' | 'startTime'> {
  const d = new Date();
  return {
    startDate: d.toISOString().slice(0, 10),
    startTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function formatRecorded(startDate: string, startTime: string): string {
  try {
    const iso = startTime ? `${startDate}T${startTime}` : startDate;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `${startDate}${startTime ? ` · ${startTime}` : ''}`;
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: startTime ? 'short' : undefined,
    });
  } catch {
    return `${startDate}${startTime ? ` · ${startTime}` : ''}`;
  }
}

const ExperimentForm: React.FC<ExperimentFormProps> = ({
  initialData,
  protocols = [],
  onSubmit,
  onCancel,
  isLoading = false,
  mode = 'notebook',
  banner,
  submitLabel,
}) => {
  const isNotebook = mode === 'notebook';
  const { protocols: loadedProtocols, experiments: loadedExperiments } = useEntityOptions(
    isNotebook ? ['protocols', 'experiments'] : ['protocols']
  );

  const [protocolPickerOptions, setProtocolPickerOptions] = useState(loadedProtocols);

  useEffect(() => {
    setProtocolPickerOptions(loadedProtocols);
  }, [loadedProtocols]);

  const protocolOptions =
    protocols.length > 0
      ? protocols.map((p) => ({ id: p.id, label: p.title, meta: p.category }))
      : protocolPickerOptions;

  const [formData, setFormData] = useState<ExperimentFormData>(() => {
    const base: ExperimentFormData = {
      title: '',
      startDate: '',
      startTime: '',
      objective: '',
      description: '',
      protocolId: '',
      experimentId: '',
      protocolModifications: '',
      problems: '',
      troubleshooting: '',
      resultsLink: '',
      conditions: '',
      priority: 'medium',
      category: 'other',
      modifications: '',
      findings: '',
    };
    if (isNotebook) {
      return { ...base, startDate: nowFields().startDate, ...initialData };
    }
    return { ...base, ...nowFields(), ...initialData };
  });

  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [showQuickProtocol, setShowQuickProtocol] = useState(false);
  const [quickProtocolTitle, setQuickProtocolTitle] = useState('');
  const [quickProtocolSteps, setQuickProtocolSteps] = useState('');
  const [quickProtocolSaving, setQuickProtocolSaving] = useState(false);
  const [quickProtocolError, setQuickProtocolError] = useState('');

  useEffect(() => {
    if (!isNotebook && !initialData?.startDate) {
      const now = nowFields();
      setFormData((prev) => ({ ...prev, startDate: now.startDate, startTime: now.startTime }));
    }
  }, [isNotebook, initialData?.startDate]);

  useEffect(() => {
    if (initialData?.protocolId && protocolOptions.length > 0) {
      const match = protocolOptions.find((p) => p.id === initialData.protocolId);
      const fromProp = protocols.find((p) => p.id === initialData.protocolId);
      if (fromProp) setSelectedProtocol(fromProp);
      else if (match) {
        setSelectedProtocol({
          id: match.id,
          title: match.label,
          description: '',
          content: '',
          category: match.meta || '',
        });
      }
    }
  }, [initialData?.protocolId, protocolOptions, protocols]);

  const handleProtocolSelect = (protocolId: string) => {
    if (!protocolId) {
      setSelectedProtocol(null);
      setFormData((prev) => ({ ...prev, protocolId: '' }));
      return;
    }
    const fromProp = protocols.find((p) => p.id === protocolId);
    const match = protocolOptions.find((p) => p.id === protocolId);
    if (fromProp) {
      setSelectedProtocol(fromProp);
    } else if (match) {
      setSelectedProtocol({
        id: match.id,
        title: match.label,
        description: '',
        content: '',
        category: match.meta || '',
      });
    }
    setFormData((prev) => ({ ...prev, protocolId }));
  };

  const handleCreateQuickProtocol = async () => {
    const title = quickProtocolTitle.trim();
    if (!title) {
      setQuickProtocolError('Enter a protocol title');
      return;
    }
    setQuickProtocolSaving(true);
    setQuickProtocolError('');
    try {
      const response = await axios.post(
        '/api/protocols',
        {
          title,
          description: 'Created from an experiment run',
          category: 'other',
          difficulty_level: 'intermediate',
          estimated_duration: 60,
          materials: [],
          content: quickProtocolSteps.trim() || 'Add full steps in the Methods library.',
          safety_notes: '',
          tags: [],
          privacy_level: 'lab',
          version: '1.0',
        },
        { headers: getAuthHeaders() }
      );
      const saved = response.data.protocol || response.data;
      const id = String(saved?.id || '');
      if (!id) throw new Error('No protocol id returned');
      const refreshed = await fetchProtocolOptions();
      setProtocolPickerOptions(refreshed);
      handleProtocolSelect(id);
      setShowQuickProtocol(false);
      setQuickProtocolTitle('');
      setQuickProtocolSteps('');
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Could not create protocol';
      setQuickProtocolError(msg);
    } finally {
      setQuickProtocolSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNotebook) {
      onSubmit(formData);
      return;
    }
    // Tracker create/edit = study setup only (runs live on the workspace page)
    onSubmit({
      ...formData,
      hypothesis: formData.objective,
      description: formData.description || '',
      protocolModifications: formData.protocolModifications || '',
      resultsLink: '',
      findings: '',
      modifications: '',
    } as ExperimentFormData);
  };

  const modalTitle = isNotebook
    ? initialData?.title
      ? 'Edit experiment note'
      : 'Experiment note'
    : initialData?.title
      ? 'Edit experiment'
      : 'New experiment';

  const modalSubtitle = isNotebook
    ? 'Document an experimental procedure and observations'
    : 'Set up the study — title, aim, and method. Log bench runs on the experiment page.';

  const methodsLink = isNotebook ? '/protocols' : '/experiment-tracker?tab=protocols';

  const defaultSubmit = isNotebook
    ? isLoading
      ? 'Saving…'
      : 'Save note'
    : isLoading
      ? 'Saving…'
      : submitLabel || 'Save experiment';

  if (!isNotebook) {
    return (
      <>
        <NotebookFormModal
          title={modalTitle}
          subtitle={modalSubtitle}
          onCancel={onCancel}
          onSubmit={handleSubmit}
          submitLabel={defaultSubmit}
          maxWidth="max-w-lg"
        >
          {banner && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
              {banner}
            </div>
          )}

          <p className="text-[12px] text-slate-500 -mt-2">
            Started{' '}
            <span className="font-medium text-slate-700">
              {formatRecorded(formData.startDate, formData.startTime)}
            </span>
          </p>

          <Field label="Title" required>
            <Input
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Annealing temperature screen for PCR"
              required
              autoFocus
            />
          </Field>

          <Field label="Aim / hypothesis" hint="What question does this study answer?">
            <TextArea
              value={formData.objective}
              onChange={(e) => setFormData((prev) => ({ ...prev, objective: e.target.value }))}
              rows={3}
              placeholder="e.g. Test whether 58°C annealing reduces non-specific bands"
            />
          </Field>

          <Field label="Protocol" hint="From your library or create a new method">
            <div className="space-y-2">
              <EntityLinkSelect
                value={formData.protocolId}
                options={protocolOptions}
                onChange={handleProtocolSelect}
                placeholder="Choose a protocol…"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="text-[12px] border-slate-300"
                  onClick={() => {
                    setQuickProtocolError('');
                    setShowQuickProtocol(true);
                  }}
                >
                  <PlusIcon className="h-3.5 w-3.5 mr-1" />
                  Create new protocol
                </Button>
                <Link
                  to={methodsLink}
                  className="inline-flex items-center text-[12px] font-medium text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  Open full library
                </Link>
              </div>
            </div>
            {selectedProtocol && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                <p className="text-[13px] font-medium text-slate-900">{selectedProtocol.title}</p>
              </div>
            )}
            {protocolOptions.length === 0 && (
              <p className="mt-1.5 text-[12px] text-slate-500">
                No protocols yet — create one above or in the library.
              </p>
            )}
          </Field>
        </NotebookFormModal>

        {showQuickProtocol && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
              <h3 className="text-[15px] font-semibold text-slate-900">New protocol</h3>
              <p className="mt-1 text-[12px] text-slate-500">
                Saved to your library and linked to this experiment.
              </p>
              <div className="mt-4 space-y-3">
                <Field label="Title" required>
                  <Input
                    value={quickProtocolTitle}
                    onChange={(e) => setQuickProtocolTitle(e.target.value)}
                    placeholder="e.g. Colony PCR screening"
                    autoFocus
                  />
                </Field>
                <Field label="Procedure" hint="Optional — refine later in Methods">
                  <TextArea
                    value={quickProtocolSteps}
                    onChange={(e) => setQuickProtocolSteps(e.target.value)}
                    rows={4}
                    placeholder="Brief steps or paste an outline…"
                  />
                </Field>
                {quickProtocolError && (
                  <p className="text-[12px] text-red-600">{quickProtocolError}</p>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQuickProtocol(false)}
                  disabled={quickProtocolSaving}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleCreateQuickProtocol()} disabled={quickProtocolSaving}>
                  {quickProtocolSaving ? 'Saving…' : 'Create & select'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <NotebookFormModal
      title={modalTitle}
      subtitle={modalSubtitle}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel={defaultSubmit}
      maxWidth="max-w-2xl"
    >
      {banner && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
          {banner}
        </div>
      )}

      <FormSection title="Run" description="Identity and purpose of this attempt">
        <Field label="Title" required>
          <Input
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g. PCR attempt #3 — annealing gradient"
            required
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              required
            />
          </Field>
          <Field label="Time" hint="Optional">
            <Input
              type="time"
              value={formData.startTime}
              onChange={(e) => setFormData((prev) => ({ ...prev, startTime: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Objective" required hint="Why this run — question or intended outcome">
          <TextArea
            value={formData.objective}
            onChange={(e) => setFormData((prev) => ({ ...prev, objective: e.target.value }))}
            rows={2}
            placeholder="e.g. Test whether 58°C annealing reduces non-specific bands"
            required
          />
        </Field>
      </FormSection>

      <FormSection title="Method" description="What you ran and any deviations">
        <Field label="Protocol">
          <EntityLinkSelect
            value={formData.protocolId}
            options={protocolOptions}
            onChange={handleProtocolSelect}
            placeholder="None — choose a protocol"
          />
          {protocolOptions.length === 0 && (
            <p className="mt-1.5 text-[12px] text-slate-500">
              No protocols loaded.{' '}
              <Link
                to={methodsLink}
                className="font-medium text-slate-800 underline-offset-2 hover:underline"
              >
                Open method library
              </Link>
            </p>
          )}
        </Field>
        {selectedProtocol && (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-[13px] font-medium text-slate-900">{selectedProtocol.title}</p>
            {selectedProtocol.description && (
              <p className="mt-1 line-clamp-2 text-[12px] text-slate-600">
                {selectedProtocol.description}
              </p>
            )}
          </div>
        )}
        <Field label="Deviations from protocol" hint="Changed steps, reagents, or skipped sections">
          <TextArea
            value={formData.protocolModifications}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, protocolModifications: e.target.value }))
            }
            rows={2}
            placeholder="e.g. Used Taq instead of Q5; 30 cycles instead of 35"
          />
        </Field>
        <Field label="Conditions" hint="Sample, concentrations, instrument settings, lot numbers">
          <TextArea
            value={formData.conditions}
            onChange={(e) => setFormData((prev) => ({ ...prev, conditions: e.target.value }))}
            rows={2}
            placeholder="e.g. 50 ng template, BioRad T100, lot #A291"
          />
        </Field>
        <Field label="Linked experiment" hint="Optional — tie this note to Experiments">
          <EntityLinkSelect
            value={formData.experimentId}
            options={loadedExperiments}
            onChange={(id) => setFormData((prev) => ({ ...prev, experimentId: id }))}
            placeholder="None — choose an experiment"
          />
        </Field>
      </FormSection>

      <FormSection title="Observations" description="What you did and what you saw">
        <Field label="Procedure & observations" required>
          <TextArea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={6}
            placeholder="Step narrative and raw observations (gel bands, OD, instrument readings)…"
            required
          />
        </Field>
        <Field
          label="Outcome"
          hint="Brief takeaway. Use a Results note for full analysis; a Problem note for deep troubleshooting."
        >
          <TextArea
            value={formData.resultsLink}
            onChange={(e) => setFormData((prev) => ({ ...prev, resultsLink: e.target.value }))}
            rows={3}
            placeholder="e.g. Clear 250 bp band at 58–60°C; smear below 56°C"
          />
        </Field>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              window.open(
                evidenceFromRecordUrl({
                  title: formData.title,
                  protocolId: formData.protocolId,
                  experimentId: formData.experimentId,
                  summary: formData.resultsLink || formData.description || '',
                }),
                '_blank'
              )
            }
            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <ChartBarIcon className="mr-1.5 h-4 w-4" />
            Create evidence pack
          </button>
          <button
            type="button"
            onClick={() =>
              window.open(
                experimentFromProtocolUrl({
                  title: formData.title,
                  protocolId: formData.protocolId,
                }),
                '_blank'
              )
            }
            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <BeakerIcon className="mr-1.5 h-4 w-4" />
            Track in Experiments
          </button>
        </div>
      </FormSection>
    </NotebookFormModal>
  );
};

export default ExperimentForm;
