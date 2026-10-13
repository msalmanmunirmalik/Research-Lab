import { apiService } from '../services/apiService';

export interface Experiment {
  id: string;
  title: string;
  description: string;
  hypothesis: string;
  objectives: string[];
  methodology: string;
  expectedOutcomes: string[];
  status: 'planning' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'molecular_biology' | 'cell_biology' | 'biochemistry' | 'microbiology' | 'genetics' | 'immunology' | 'neuroscience' | 'other';
  estimatedDuration: number;
  actualDuration: number;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  labId: string;
  labName: string;
  researcherId: string;
  researcherName: string;
  collaborators: string[];
  equipment: string[];
  materials: string[];
  reagents: string[];
  safetyRequirements: string[];
  budget: number;
  actualCost: number;
  tags: string[];
  notes: string;
  results?: string;
  conclusions?: string;
  nextSteps?: string;
  attachments: string[];
  /** Linked Protocol library SOP */
  protocolId?: string | null;
  notebookEntryId?: string | null;
  milestones: Milestone[];
  risks: Risk[];
  progressPercentage: number;
  totalMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completedAt?: string;
  notes?: string;
}

export interface Risk {
  id: string;
  title: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
  status: 'active' | 'mitigated' | 'resolved';
}

export interface ExperimentTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  methodology: string;
  estimatedDuration: number;
  equipment: string[];
  materials: string[];
  reagents: string[];
  safetyRequirements: string[];
  milestones: Omit<Milestone, 'id' | 'status' | 'completedAt'>[];
  /** Prefer linking a Protocol library SOP instead of inlining full procedure text */
  protocolId?: string;
}

export interface CreateExperimentData {
  title: string;
  description: string;
  hypothesis: string;
  objectives: string[];
  methodology: string;
  expectedOutcomes: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'molecular_biology' | 'cell_biology' | 'biochemistry' | 'microbiology' | 'genetics' | 'immunology' | 'neuroscience' | 'other';
  estimatedDuration: number;
  dueDate?: string;
  labId: string;
  collaborators: string[];
  equipment: string[];
  materials: string[];
  reagents: string[];
  safetyRequirements: string[];
  budget: number;
  tags: string[];
  notes: string;
  templateId?: string;
  /** Optional link to Protocol library SOP - do not duplicate procedure text */
  protocolId?: string;
  milestones: Omit<Milestone, 'id' | 'status' | 'completedAt'>[];
  risks: Omit<Risk, 'id' | 'status'>[];
}

export interface UpdateExperimentData extends Partial<CreateExperimentData> {
  status?: 'planning' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  actualDuration?: number;
  startDate?: string;
  endDate?: string;
  actualCost?: number;
  results?: string;
  conclusions?: string;
  nextSteps?: string;
  attachments?: string[];
}

export interface ExperimentFilters {
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
}

export interface ExperimentAnalytics {
  totalExperiments: number;
  completedExperiments: number;
  runningExperiments: number;
  failedExperiments: number;
  avgDuration: number;
  avgCost: number;
  overdueExperiments: number;
}

export type ExperimentRunStatus = 'planned' | 'completed' | 'failed' | 'needs_repeat';

export interface ExperimentRun {
  id: string;
  experimentId: string;
  userId: string;
  userName?: string | null;
  recordedAt: string;
  title?: string | null;
  modifications: string;
  observations: string;
  outcomeSummary: string;
  status: ExperimentRunStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateExperimentRunData {
  recordedAt?: string;
  title?: string;
  modifications?: string;
  observations?: string;
  outcomeSummary?: string;
  status?: ExperimentRunStatus;
}

class ExperimentService {
  private baseUrl = '/api/experiments';

  private asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
      return (payload as { data: T[] }).data;
    }
    return [];
  }

  // Get all experiments with optional filters
  async getExperiments(filters: ExperimentFilters = {}): Promise<Experiment[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.append(key, value);
      }
    });

    const response = await apiService.get(`${this.baseUrl}?${params.toString()}`);
    return this.asArray<Experiment>(response.data);
  }

  // Get a single experiment by ID
  async getExperiment(id: string): Promise<Experiment> {
    const response = await apiService.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  // Create a new experiment
  async createExperiment(data: CreateExperimentData): Promise<Experiment> {
    const response = await apiService.post(this.baseUrl, data);
    return response.data;
  }

  // Update an experiment
  async updateExperiment(id: string, data: UpdateExperimentData): Promise<Experiment> {
    const response = await apiService.put(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  // Delete an experiment
  async deleteExperiment(id: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${id}`);
  }

  // Get experiment templates
  async getTemplates(filters: { category?: string; search?: string } = {}): Promise<ExperimentTemplate[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.append(key, value);
      }
    });

    const response = await apiService.get(`${this.baseUrl}/templates?${params.toString()}`);
    return this.asArray<ExperimentTemplate>(response.data);
  }

  // Create experiment template
  async createTemplate(data: {
    name: string;
    category: string;
    description: string;
    methodology: string;
    estimatedDuration: number;
    equipment: string[];
    materials: string[];
    reagents: string[];
    safetyRequirements: string[];
    isPublic: boolean;
  }): Promise<ExperimentTemplate> {
    const response = await apiService.post(`${this.baseUrl}/templates`, data);
    return response.data;
  }

  // Add milestone to experiment
  async addMilestone(experimentId: string, data: {
    title: string;
    description: string;
    dueDate: string;
  }): Promise<Milestone> {
    const response = await apiService.post(`${this.baseUrl}/${experimentId}/milestones`, data);
    return response.data;
  }

  // Update milestone status
  async updateMilestoneStatus(milestoneId: string, data: {
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    notes?: string;
  }): Promise<Milestone> {
    const response = await apiService.put(`${this.baseUrl}/milestones/${milestoneId}`, data);
    return response.data;
  }

  // Add progress log entry
  async addProgressLog(experimentId: string, data: {
    status: string;
    notes: string;
    durationLogged?: number;
    costLogged?: number;
    attachments?: string[];
  }): Promise<any> {
    const response = await apiService.post(`${this.baseUrl}/${experimentId}/progress`, data);
    return response.data;
  }

  // Get experiment analytics
  async getAnalytics(timeframe: number = 30): Promise<ExperimentAnalytics> {
    const response = await apiService.get(`${this.baseUrl}/analytics?timeframe=${timeframe}`);
    const raw =
      response.data && typeof response.data === 'object' && 'data' in response.data && !('total_experiments' in response.data) && !('totalExperiments' in response.data)
        ? (response.data as { data: Record<string, unknown> }).data || {}
        : (response.data || {});
    return {
      totalExperiments: Number(raw.totalExperiments ?? raw.total_experiments ?? 0),
      completedExperiments: Number(raw.completedExperiments ?? raw.completed_experiments ?? 0),
      runningExperiments: Number(raw.runningExperiments ?? raw.running_experiments ?? 0),
      failedExperiments: Number(raw.failedExperiments ?? raw.failed_experiments ?? 0),
      avgDuration: Number(raw.avgDuration ?? raw.avg_duration ?? 0),
      avgCost: Number(raw.avgCost ?? raw.avg_cost ?? 0),
      overdueExperiments: Number(raw.overdueExperiments ?? raw.overdue_experiments ?? 0),
    };
  }

  // Start experiment
  async startExperiment(id: string): Promise<Experiment> {
    return this.updateExperiment(id, {
      status: 'running',
      startDate: new Date().toISOString()
    });
  }

  // Pause experiment
  async pauseExperiment(id: string): Promise<Experiment> {
    return this.updateExperiment(id, {
      status: 'paused'
    });
  }

  // Complete experiment
  async completeExperiment(id: string, data: {
    results?: string;
    conclusions?: string;
    nextSteps?: string;
    actualDuration?: number;
    actualCost?: number;
  }): Promise<Experiment> {
    return this.updateExperiment(id, {
      status: 'completed',
      endDate: new Date().toISOString(),
      ...data
    });
  }

  // Fail experiment
  async failExperiment(id: string, reason: string): Promise<Experiment> {
    return this.updateExperiment(id, {
      status: 'failed',
      endDate: new Date().toISOString(),
      notes: reason
    });
  }

  // Cancel experiment
  async cancelExperiment(id: string, reason: string): Promise<Experiment> {
    return this.updateExperiment(id, {
      status: 'cancelled',
      endDate: new Date().toISOString(),
      notes: reason
    });
  }

  async listRuns(experimentId: string): Promise<ExperimentRun[]> {
    const response = await apiService.get(`${this.baseUrl}/${experimentId}/runs`);
    const payload = response.data;
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.runs)) return payload.runs;
    return [];
  }

  async createRun(experimentId: string, data: CreateExperimentRunData): Promise<ExperimentRun> {
    const response = await apiService.post(`${this.baseUrl}/${experimentId}/runs`, data);
    return response.data;
  }

  async updateRun(
    experimentId: string,
    runId: string,
    data: Partial<CreateExperimentRunData>
  ): Promise<ExperimentRun> {
    const response = await apiService.put(`${this.baseUrl}/${experimentId}/runs/${runId}`, data);
    return response.data;
  }

  async deleteRun(experimentId: string, runId: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${experimentId}/runs/${runId}`);
  }

  // Get experiment progress log
  async getProgressLog(experimentId: string): Promise<any[]> {
    const response = await apiService.get(`${this.baseUrl}/${experimentId}/progress`);
    return response.data;
  }

  // Get experiment comments
  async getComments(experimentId: string): Promise<any[]> {
    const response = await apiService.get(`${this.baseUrl}/${experimentId}/comments`);
    return response.data;
  }

  // Add comment to experiment
  async addComment(experimentId: string, data: {
    comment: string;
    isInternal: boolean;
  }): Promise<any> {
    const response = await apiService.post(`${this.baseUrl}/${experimentId}/comments`, data);
    return response.data;
  }

  // Export experiment data
  async exportExperiment(id: string, format: 'pdf' | 'json' | 'csv' = 'json'): Promise<Blob> {
    const response = await apiService.get(`${this.baseUrl}/${id}/export?format=${format}`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Duplicate experiment
  async duplicateExperiment(id: string, newTitle: string): Promise<Experiment> {
    const originalExperiment = await this.getExperiment(id);
    
    const duplicateData: CreateExperimentData = {
      title: newTitle,
      description: originalExperiment.description,
      hypothesis: originalExperiment.hypothesis,
      objectives: originalExperiment.objectives,
      methodology: originalExperiment.methodology,
      expectedOutcomes: originalExperiment.expectedOutcomes,
      priority: originalExperiment.priority,
      category: originalExperiment.category,
      estimatedDuration: originalExperiment.estimatedDuration,
      dueDate: originalExperiment.dueDate,
      labId: originalExperiment.labId,
      collaborators: originalExperiment.collaborators,
      equipment: originalExperiment.equipment,
      materials: originalExperiment.materials,
      reagents: originalExperiment.reagents,
      safetyRequirements: originalExperiment.safetyRequirements,
      budget: originalExperiment.budget,
      tags: originalExperiment.tags,
      notes: originalExperiment.notes,
      milestones: originalExperiment.milestones.map(m => ({
        title: m.title,
        description: m.description,
        dueDate: m.dueDate
      })),
      risks: originalExperiment.risks.map(r => ({
        title: r.title,
        description: r.description,
        probability: r.probability,
        impact: r.impact,
        mitigation: r.mitigation
      }))
    };

    return this.createExperiment(duplicateData);
  }
}

export const experimentService = new ExperimentService();
