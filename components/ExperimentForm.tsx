import React, { useState, useEffect } from 'react';
import Button from './ui/Button';
import Input from './ui/Input';
import {
  NotebookFormModal,
  FormSection,
  Field,
  TextArea,
} from './notebook/NotebookFormPrimitives';
import { BeakerIcon, ChartBarIcon, CheckCircleIcon, XMarkIcon } from './icons';
import { useEntityOptions } from '../hooks/useEntityOptions';
import EntityLinkSelect from './EntityLinkSelect';
import { evidenceFromRecordUrl, experimentFromProtocolUrl } from '../utils/evidenceChain';

interface ExperimentFormData {
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
  /** notebook = personal documentation; tracker = experiment lifecycle */
  mode?: 'notebook' | 'tracker';
  banner?: React.ReactNode;
}

const ExperimentForm: React.FC<ExperimentFormProps> = ({
  initialData,
  protocols = [],
  onSubmit,
  onCancel,
  isLoading = false,
  mode = 'notebook',
  banner,
}) => {
  const isNotebook = mode === 'notebook';
  const { protocols: loadedProtocols, experiments: loadedExperiments } = useEntityOptions([
    'protocols',
    'experiments',
  ]);
  const protocolOptions =
    protocols.length > 0
      ? protocols.map((p) => ({ id: p.id, label: p.title, meta: p.category }))
      : loadedProtocols;

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ExperimentFormData>({
    title: '',
    startDate: new Date().toISOString().slice(0, 10),
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
    ...initialData,
  });

  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

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

  const steps = [
    { id: 1, title: 'Basics' },
    { id: 2, title: 'Protocol' },
    { id: 3, title: 'Risks' },
    { id: 4, title: 'Review' },
  ];

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const title = isNotebook
    ? initialData?.title
      ? 'Edit experiment note'
      : 'Experiment note'
    : initialData?.title
      ? 'Edit experiment'
      : 'New experiment';

  const subtitle = isNotebook
    ? 'Record a run: purpose, what you did, and what you observed'
    : 'Plan and track a run in Experiments';

  // Notebook: single scrollable form (professional documentation UX)
  if (isNotebook) {
    return (
      <NotebookFormModal
        title={title}
        subtitle={subtitle}
        onCancel={onCancel}
        onSubmit={handleSubmit}
        submitLabel={isLoading ? 'Saving…' : 'Save note'}
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
                <a
                  href="/protocols"
                  className="font-medium text-slate-800 underline-offset-2 hover:underline"
                >
                  Open Protocol library
                </a>
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
          <Field
            label="Conditions"
            hint="Sample, concentrations, instrument settings, lot numbers"
          >
            <TextArea
              value={formData.conditions}
              onChange={(e) => setFormData((prev) => ({ ...prev, conditions: e.target.value }))}
              rows={2}
              placeholder="e.g. 50 ng template, BioRad T100, lot #A291"
            />
          </Field>
          <Field label="Linked experiment" hint="Optional — tie this note to Experiment tracker">
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
            <Button
              type="button"
              variant="outline"
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
              className="border-slate-300 text-[13px] text-slate-700"
            >
              <ChartBarIcon className="mr-1.5 h-4 w-4" />
              Create evidence pack
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(
                  experimentFromProtocolUrl({
                    title: formData.title,
                    protocolId: formData.protocolId,
                  }),
                  '_blank'
                )
              }
              className="border-slate-300 text-[13px] text-slate-700"
            >
              <BeakerIcon className="mr-1.5 h-4 w-4" />
              Track in Experiments
            </Button>
          </div>
        </FormSection>
      </NotebookFormModal>
    );
  }

  // Tracker mode: stepped wizard (unchanged structure, tighter copy)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="shrink-0 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
              <p className="mt-1 text-[13px] text-slate-600">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 flex items-center gap-1">
            {steps.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                      step >= s.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {s.id}
                  </span>
                  <span
                    className={`hidden truncate text-[12px] font-medium sm:block ${
                      step >= s.id ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-px flex-1 ${step > s.id ? 'bg-slate-900' : 'bg-slate-200'}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {banner && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
                {banner}
              </div>
            )}

            {step === 1 && (
              <>
                <Field label="Experiment title" required>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter experiment title"
                    required
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Start date" required>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Start time">
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, startTime: e.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Objective">
                  <TextArea
                    value={formData.objective}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, objective: e.target.value }))
                    }
                    rows={2}
                    placeholder="What question does this run answer?"
                  />
                </Field>
                <Field label="Description">
                  <TextArea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    placeholder="Brief description of the experiment…"
                  />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-[13px] text-slate-600">
                  Link a method from Protocol library. Do not paste the full SOP here.
                </p>
                <Field label="Protocol">
                  <EntityLinkSelect
                    value={formData.protocolId}
                    options={protocolOptions}
                    onChange={handleProtocolSelect}
                    placeholder="Choose a protocol…"
                  />
                </Field>
                {selectedProtocol && (
                  <div className="rounded-md border border-slate-200 px-4 py-3">
                    <p className="text-[13px] font-medium text-slate-900">
                      {selectedProtocol.title}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-600">{selectedProtocol.description}</p>
                  </div>
                )}
                <Field label="Protocol modifications">
                  <TextArea
                    value={formData.protocolModifications}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        protocolModifications: e.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Planned deviations…"
                  />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Known risks">
                  <TextArea
                    value={formData.problems}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, problems: e.target.value }))
                    }
                    rows={3}
                    placeholder="Risks or expected issues…"
                  />
                </Field>
                <Field label="Mitigations">
                  <TextArea
                    value={formData.troubleshooting}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, troubleshooting: e.target.value }))
                    }
                    rows={3}
                    placeholder="How you will address them…"
                  />
                </Field>
              </>
            )}

            {step === 4 && (
              <>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
                  <div className="flex gap-2">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                    <p>
                      This creates an experiment in the tracker. Upload outputs later in My data
                      &amp; results.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 rounded-md border border-slate-200 px-4 py-4 text-[13px] text-slate-700">
                  <p className="font-semibold text-slate-900">Summary</p>
                  <p>
                    <span className="text-slate-500">Title:</span> {formData.title || '—'}
                  </p>
                  <p>
                    <span className="text-slate-500">When:</span> {formData.startDate || '—'}
                    {formData.startTime ? ` · ${formData.startTime}` : ''}
                  </p>
                  <p>
                    <span className="text-slate-500">Protocol:</span>{' '}
                    {selectedProtocol?.title || 'None'}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 justify-between gap-2.5 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                  className="border-slate-300 text-slate-700"
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="border-slate-300 text-slate-700"
              >
                Cancel
              </Button>
              {step < steps.length ? (
                <Button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-none bg-slate-900 text-white shadow-none hover:bg-slate-800"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-none bg-slate-900 text-white shadow-none hover:bg-slate-800"
                >
                  {isLoading ? 'Saving…' : 'Create experiment'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExperimentForm;
