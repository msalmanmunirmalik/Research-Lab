import React, { useEffect, useState } from 'react';
import { XMarkIcon } from './icons';

export type DashboardReminderFormValues = {
  title: string;
  description: string;
  due_date: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
};

type Props = {
  isOpen: boolean;
  submitting?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: DashboardReminderFormValues) => void | Promise<void>;
};

const PRIORITIES: { id: DashboardReminderFormValues['priority']; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DashboardReminderForm: React.FC<Props> = ({
  isOpen,
  submitting = false,
  error,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [priority, setPriority] = useState<DashboardReminderFormValues['priority']>('normal');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setDescription('');
    setDueDate(defaultDueDate());
    setPriority('normal');
    setLocalError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setLocalError('Give the reminder a title.');
      return;
    }
    setLocalError('');
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate,
      priority,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-reminder-form-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2
              id="dashboard-reminder-form-title"
              className="text-[15px] font-semibold text-slate-900"
            >
              New reminder
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Creates a task assigned to you in Lab workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="dashboard-reminder-title"
              className="block text-[13px] font-medium text-slate-700 mb-1"
            >
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="dashboard-reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Book confocal for Friday"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
            />
          </div>

          <div>
            <label
              htmlFor="dashboard-reminder-notes"
              className="block text-[13px] font-medium text-slate-700 mb-1"
            >
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="dashboard-reminder-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any details to remember…"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-y min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="dashboard-reminder-due"
                className="block text-[13px] font-medium text-slate-700 mb-1"
              >
                Due date
              </label>
              <input
                id="dashboard-reminder-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
              />
            </div>
            <div>
              <label
                htmlFor="dashboard-reminder-priority"
                className="block text-[13px] font-medium text-slate-700 mb-1"
              >
                Priority
              </label>
              <select
                id="dashboard-reminder-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as DashboardReminderFormValues['priority'])
                }
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 bg-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {localError || error ? (
            <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {localError || error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[13px] font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3.5 py-2 text-[13px] font-medium text-white bg-amber-700 rounded-md hover:bg-amber-800 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Add reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardReminderForm;
