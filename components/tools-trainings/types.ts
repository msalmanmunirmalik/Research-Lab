export type TrainingCategory =
  | 'orientation'
  | 'safety'
  | 'biosafety'
  | 'techniques'
  | 'equipment'
  | 'tools'
  | 'data_management'
  | 'compliance'
  | 'language'
  | 'skills'
  | 'culture'
  | 'emergency'
  | 'other';

export type TrainingSummary = {
  id: string;
  slug?: string | null;
  path?: string;
  title: string;
  summary: string;
  introduction?: string;
  category: TrainingCategory | string;
  audience: string;
  estimated_minutes: number;
  is_required: boolean;
  level?: string;
  pass_score?: number;
  item_count: number;
  completed_count: number;
  progress_pct: number;
  has_assessment?: boolean;
  assessment_passed?: boolean;
  course_complete?: boolean;
};

export function courseHref(t: Pick<TrainingSummary, 'id' | 'slug' | 'path'>) {
  if (t.path) return t.path;
  const key = t.slug || t.id;
  return `/tools-trainings/courses/${encodeURIComponent(key)}`;
}

export type TrainingVideo = {
  url: string;
  title?: string;
  minutes?: number;
};

export type TrainingItem = {
  id: string;
  title: string;
  item_type: 'document' | 'video' | 'link' | 'checklist';
  content_markdown?: string | null;
  video_url?: string | null;
  videos?: TrainingVideo[];
  external_url?: string | null;
  checklist?: string[] | null;
  estimated_minutes?: number;
  is_required?: boolean;
  completed?: boolean;
};

export type AssessmentQuestion = {
  id: string;
  type: 'mcq' | 'tf' | 'reflect';
  prompt: string;
  choices?: { id: string; label: string }[];
};

export type Assessment = {
  id: string;
  training_id: string;
  title: string;
  pass_score: number;
  questions: AssessmentQuestion[];
};

export const CATEGORY_LABEL: Record<string, string> = {
  orientation: 'Orientation',
  safety: 'Safety',
  biosafety: 'Biosafety',
  techniques: 'Techniques',
  equipment: 'Equipment',
  tools: 'Tools',
  data_management: 'Data & notebooks',
  compliance: 'Compliance',
  language: 'Language',
  skills: 'Skills',
  culture: 'Culture',
  emergency: 'Emergency',
  other: 'Other',
};
