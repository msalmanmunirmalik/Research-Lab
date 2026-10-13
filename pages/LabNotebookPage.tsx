import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import Card, { CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import ExperimentForm from '../components/ExperimentForm';
import IdeaForm from '../components/IdeaForm';
import ResultsForm from '../components/ResultsForm';
import MeetingForm from '../components/MeetingForm';
import ProblemForm from '../components/ProblemForm';
import NotebookSummaryModal, {
  NotebookSummaryResult,
} from '../components/NotebookSummaryModal';
import LinkedEntityChips, { buildWorkflowLinks } from '../components/LinkedEntityChips';
import { useEntityDeepLink } from '../hooks/useEntityDeepLink';
import { notifyDashboardSync } from '../utils/dashboardSync';
import DocumentImportModal from '../components/DocumentImportModal';
import {
  smartParseNotebookText,
  notebookPayloadToFormInitial,
} from '../utils/notebookImport';
import { evidenceFromRecordUrl } from '../utils/evidenceChain';
import { 
  BookOpenIcon,
  PlusIcon, 
  SearchIcon, 
  FilterIcon, 
  UserIcon,
  TagIcon,
  EyeIcon,
  EditIcon,
  TrashIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LightbulbIcon,
  BeakerIcon,
  ChartBarIcon,
  DocumentTextIcon,
  UsersIcon,
  StarIcon,
  ArrowRightIcon,
  SaveIcon,
  XMarkIcon,
  ShareIcon,
  DownloadIcon,
  PrinterIcon,

  BellIcon,
  SparklesIcon,
  BrainIcon,
  CubeIcon,
  WrenchScrewdriverIcon,
  DocumentArrowUpIcon,
  TargetIcon,
  UserGroupIcon,
  AcademicCapIcon,
  ClipboardListIcon,
  DocumentIcon,
  PresentationChartLineIcon,
  HomeIcon,
  BuildingOfficeIcon,
  PencilIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  UserCircleIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  Bars3Icon,
  Squares2X2Icon,
  TrendingUpIcon,
  FireIcon
} from '../components/icons';
import { PageHeader, PagePanel } from '../components/PageHeader';

// Simplified Personal NoteBook Entry Interface
interface LabNotebookEntry {
  id: string;
  title: string;
  content: string;
  entry_type: 'experiment' | 'observation' | 'idea' | 'meeting' | 'results' | 'problem' | 'protocol' | 'analysis';
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  objectives: string;
  methodology: string;
  results: string;
  conclusions: string;
  next_steps: string;
  lab_id: string;
  lab_name: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  privacy_level: 'private' | 'lab' | 'institution' | 'public';
  estimated_duration: number;
  actual_duration: number;
  cost: number;
  equipment_used: string[];
  materials_used: string[];
  safety_notes: string;
  references: string[];
  collaborators: string[];
  protocolId?: string | null;
  experimentId?: string | null;
  protocol_id?: string | null;
  experiment_id?: string | null;
}

// Simplified interfaces for essential features only
interface QuickNote {
  id: string;
  content: string;
  color: 'yellow' | 'blue' | 'green' | 'pink';
  created_at: string;
}

interface RecentActivity {
  id: string;
  type: 'entry_created' | 'entry_updated' | 'experiment_completed' | 'collaboration_added';
  description: string;
  user_name: string;
  timestamp: string;
  icon: React.ComponentType<any>;
  color: string;
}

interface SmartSuggestion {
  id: string;
  type: 'protocol' | 'collaboration' | 'equipment' | 'safety' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
}

const LabNotebookPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<LabNotebookEntry[]>([]);
  
  // Simplified state management
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);
  const [showEntryTypeModal, setShowEntryTypeModal] = useState(false);
  
  // Form states for documentation entry types
  const [showExperimentForm, setShowExperimentForm] = useState(false);
  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LabNotebookEntry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showResultsForm, setShowResultsForm] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showQuickNoteModal, setShowQuickNoteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | undefined>(undefined);

  const openHighlightedEntry = useCallback((entry: LabNotebookEntry) => {
    setSelectedEntry(entry);
    setShowViewModal(true);
  }, []);
  const { focusedId } = useEntityDeepLink(entries, openHighlightedEntry);

  // Evidence-chain handoff: /lab-notebook?create=experiment&experimentId=&protocolId=&title=
  useEffect(() => {
    const create = searchParams.get('create');
    const experimentId = searchParams.get('experimentId');
    const protocolId = searchParams.get('protocolId');
    const title = searchParams.get('title');
    if (create !== 'experiment' && !experimentId && !protocolId) return;

    setFormInitialData({
      title: title || '',
      experimentId: experimentId || '',
      protocolId: protocolId || '',
    });
    setShowExperimentForm(true);

    const next = new URLSearchParams(searchParams);
    next.delete('create');
    next.delete('experimentId');
    next.delete('protocolId');
    next.delete('title');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  
  // Summary generation state
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryType, setSummaryType] = useState<'daily' | 'weekly' | 'project' | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<NotebookSummaryResult | null>(null);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  // Simplified entry form
  const [entryForm, setEntryForm] = useState({
    title: '',
    content: '',
    entry_type: 'experiment' as const,
    status: 'planning' as const,
    priority: 'medium' as const,
    objectives: '',
    methodology: '',
    results: '',
    conclusions: '',
    next_steps: '',
    lab_id: 'lab1',
    lab_name: 'Main Lab',
    creator_name: user?.username || 'Unknown',
    tags: [] as string[],
    privacy_level: 'lab' as const,
    estimated_duration: 0,
    actual_duration: 0,
    cost: 0,
    equipment_used: [] as string[],
    materials_used: [] as string[],
    safety_notes: '',
    references: [] as string[],
    collaborators: [] as string[]
  });

  const [quickNoteForm, setQuickNoteForm] = useState({
    content: '',
    color: 'yellow' as const
  });

  // #region agent log
  // H1: Missing state declarations - verify if quickNotes, recentActivity, smartSuggestions are declared
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  // #endregion

  // Documentation-focused entry types (ops live in Lab ops)
  const entryTypes = [
    {
      id: 'experiment',
      name: 'Experiment note',
      description: 'Document an experimental procedure and observations',
      icon: BeakerIcon,
    },
    {
      id: 'idea',
      name: 'Idea',
      description: 'Capture research ideas and concepts',
      icon: LightbulbIcon,
    },
    {
      id: 'results',
      name: 'Results note',
      description: 'Record findings and analysis in your notebook',
      icon: ChartBarIcon,
    },
    {
      id: 'problem',
      name: 'Problem',
      description: 'Log issues and how you resolved them',
      icon: ExclamationTriangleIcon,
    },
  ];

  // Handlers for documentation entry types
  const clearFormInitial = () => setFormInitialData(undefined);

  const handleEntryTypeSelect = (type: string) => {
    setShowEntryTypeModal(false);
    clearFormInitial();
    switch (type) {
      case 'experiment':
        setShowExperimentForm(true);
        break;
      case 'idea':
        setShowIdeaForm(true);
        break;
      case 'results':
        setShowResultsForm(true);
        break;
      case 'problem':
        setShowProblemForm(true);
        break;
      default:
        setShowNewEntryModal(true);
    }
  };

  const openImportedEntry = (payload: ReturnType<typeof notebookPayloadToFormInitial>) => {
    clearFormInitial();
    setFormInitialData(payload);
    switch (payload.entry_type) {
      case 'idea':
        setShowIdeaForm(true);
        break;
      case 'results':
        setShowResultsForm(true);
        break;
      case 'problem':
        setShowProblemForm(true);
        break;
      case 'experiment':
      default:
        setShowExperimentForm(true);
        break;
    }
  };

  const fetchEntries = async () => {
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔍 Fetching lab entries, token:', token ? 'exists' : 'missing');
      if (!token) {
        console.log('No auth token found');
        setEntries([]);
        return;
      }

      // #region agent log
      const apiUrlEntries2 = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:351',message:'fetchEntries API call',data:{apiUrl:apiUrlEntries2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`${apiUrlEntries2}/lab-notebooks`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📝 Lab entries API response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📝 Lab entries data received:', data);
        setEntries(data.entries || data || []);
      } else {
        console.log('API request failed');
        setEntries([]);
      }
    } catch (error) {
      console.error('Error fetching entries:', error);
      setEntries([]);
    }
  };

  // Fetch quick notes from API
  const fetchQuickNotes = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:428',message:'fetchQuickNotes called',data:{hasSetQuickNotes:typeof setQuickNotes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔍 Fetching quick notes, token:', token ? 'exists' : 'missing');
      if (!token) {
        console.log('No auth token found');
        setQuickNotes([]);
        return;
      }

      // #region agent log
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:453',message:'Checking import.meta.env',data:{apiUrl,hasEnv:!!(import.meta as any).env,hasViteApiUrl:!!(import.meta as any).env?.VITE_API_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`${apiUrl}/quick-notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📝 Quick notes API response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📝 Quick notes data received:', data);
        setQuickNotes(data || []);
      } else {
        console.log('API request failed');
        setQuickNotes([]);
      }
    } catch (error) {
      console.error('Error fetching quick notes:', error);
      setQuickNotes([]);
    }
  };

  const handleFormSubmit = async (data: any, type: string) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      const joinList = (value: unknown) =>
        Array.isArray(value)
          ? value.filter(Boolean).join('\n')
          : typeof value === 'string'
            ? value
            : '';

      const contentParts: string[] = [];
      if (type === 'experiment') {
        if (data.objective) contentParts.push(`Objective\n${data.objective}`);
        if (data.conditions) contentParts.push(`Conditions\n${data.conditions}`);
        if (data.description) contentParts.push(`Procedure & observations\n${data.description}`);
        if (data.protocolModifications) {
          contentParts.push(`Protocol deviations\n${data.protocolModifications}`);
        }
        if (data.resultsLink) contentParts.push(`Outcome\n${data.resultsLink}`);
      } else if (type === 'idea') {
        if (data.description) contentParts.push(data.description);
        if (data.rationale) contentParts.push(`Why it matters\n${data.rationale}`);
        if (data.next_check || data.timeline) {
          contentParts.push(`Next check\n${data.next_check || data.timeline}`);
        }
      } else if (type === 'results') {
        if (data.description) contentParts.push(data.description);
        if (data.key_findings?.length) {
          contentParts.push(`Key findings\n${joinList(data.key_findings)}`);
        }
        if (data.statistical_analysis) {
          contentParts.push(`Statistics\n${data.statistical_analysis}`);
        }
        if (data.conclusions) contentParts.push(`Conclusion\n${data.conclusions}`);
        if (data.caveats || data.limitations?.length) {
          contentParts.push(
            `Caveats\n${data.caveats || joinList(data.limitations)}`
          );
        }
        if (data.next_steps?.length) {
          contentParts.push(`Next experiments\n${joinList(data.next_steps)}`);
        }
      } else if (type === 'problem') {
        if (data.description) contentParts.push(data.description);
        if (data.likely_cause) contentParts.push(`Likely cause\n${data.likely_cause}`);
        if (data.current_solution) contentParts.push(`What was tried\n${data.current_solution}`);
        if (data.resolution) contentParts.push(`Resolution\n${data.resolution}`);
        if (data.lessons_learned) {
          contentParts.push(`Prevention / lesson\n${data.lessons_learned}`);
        }
      } else if (data.description || data.content) {
        contentParts.push(data.description || data.content);
      }

      const entryData = {
        title: data.title,
        content: contentParts.filter(Boolean).join('\n\n') || data.description || data.content || '',
        entry_type: type,
        status: data.status || 'completed',
        priority: data.priority || data.severity || 'medium',
        objectives: data.objective || data.objectives || data.rationale || '',
        methodology:
          data.methodology ||
          data.protocolModifications ||
          data.conditions ||
          data.current_solution ||
          '',
        results:
          data.results ||
          data.resultsLink ||
          joinList(data.key_findings) ||
          data.resolution ||
          '',
        conclusions: data.conclusions || data.lessons_learned || data.caveats || '',
        next_steps: joinList(data.next_steps) || data.next_check || data.timeline || '',
        lab_id: data.lab_id,
        protocolId: data.protocolId || data.protocol_id || null,
        experimentId: data.experimentId || data.experiment_id || null,
        tags: data.tags || [],
        privacy_level: data.privacy_level || 'lab',
        estimated_duration: data.estimated_duration || 0,
        actual_duration: data.actual_duration || 0,
        cost: data.cost || 0,
        equipment_used: data.equipment || data.equipment_used || data.affected_equipment || [],
        materials_used: data.materials || data.materials_used || [],
        safety_notes: data.safety_notes || '',
        references: data.references || data.data_files || [],
        collaborators: data.collaborators || [],
      };

      const apiUrlCreate = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      const response = await fetch(`${apiUrlCreate}/lab-notebooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(entryData),
      });

      if (response.ok) {
        const newEntry = await response.json();
        console.log('✅ Entry created successfully:', newEntry);

        switch (type) {
          case 'experiment':
            setShowExperimentForm(false);
            break;
          case 'idea':
            setShowIdeaForm(false);
            break;
          case 'results':
            setShowResultsForm(false);
            break;
          case 'progress_review':
            break;
          case 'problem':
            setShowProblemForm(false);
            break;
        }
        fetchEntries();
        fetchRecentActivity();
        notifyDashboardSync('lab-notebook');
      } else {
        const errorData = await response.json();
        console.error('Failed to create entry:', errorData);
      }
    } catch (error) {
      console.error('Error creating entry:', error);
    }
  };

  // Fetch recent activity
  const fetchRecentActivity = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.log('No auth token found');
        setRecentActivity([]);
        return;
      }

      // #region agent log
      const apiUrlActivity = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:617',message:'fetchRecentActivity checking import.meta.env',data:{apiUrl:apiUrlActivity,hasSetRecentActivity:typeof setRecentActivity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`${apiUrlActivity}/lab-notebooks/activity`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data.activities || []);
      } else {
        console.log('API request failed');
        setRecentActivity([]);
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      setRecentActivity([]);
    }
  };

  // Fetch smart suggestions
  const fetchSmartSuggestions = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.log('No auth token found');
        setSmartSuggestions([]);
        return;
      }

      // #region agent log
      const apiUrlSuggestions = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:689',message:'fetchSmartSuggestions checking import.meta.env',data:{apiUrl:apiUrlSuggestions,hasSetSmartSuggestions:typeof setSmartSuggestions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1,H2'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`${apiUrlSuggestions}/lab-notebooks/suggestions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSmartSuggestions(data.suggestions || []);
      } else {
        console.log('API request failed');
        setSmartSuggestions([]);
      }
    } catch (error) {
      console.error('Error fetching smart suggestions:', error);
      setSmartSuggestions([]);
    }
  };

  // Load data
  // Generate notebook summary (AI daily / weekly digest)
  const generateSummary = async (type: 'daily' | 'weekly' | 'project', projectId?: string) => {
    try {
      setGeneratingSummary(true);
      setSummaryType(type);
      const token =
        localStorage.getItem('authToken') || localStorage.getItem('token') || '';
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';

      const today = new Date();
      const startOfToday = today.toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const response = await axios.post(
        `${apiUrl}/notebook-summaries/generate`,
        {
          summaryType: type,
          projectId: projectId || undefined,
          dateRange:
            type === 'daily'
              ? { start: startOfToday, end: startOfToday }
              : type === 'weekly'
                ? { start: weekAgo, end: startOfToday }
                : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const payload = response.data?.summary;
      if (payload && typeof payload === 'object') {
        setGeneratedSummary(payload as NotebookSummaryResult);
      } else {
        setGeneratedSummary({
          summary: String(payload || response.data?.content || 'Summary generated.'),
          keyFindings: [],
          nextSteps: [],
          mode: response.data?.mode || 'basic',
        });
      }
      setSummaryGeneratedAt(response.data?.generatedAt || new Date().toISOString());
      setShowSummaryModal(true);
    } catch (error: any) {
      console.error('Error generating summary:', error);
      alert(`Error generating summary: ${error.response?.data?.error || error.message}`);
    } finally {
      setGeneratingSummary(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchQuickNotes();
    fetchRecentActivity();
    fetchSmartSuggestions();
  }, []);

  // Handle view entry
  const handleViewEntry = (entry: LabNotebookEntry) => {
    setSelectedEntry(entry);
    setShowViewModal(true);
  };

  // Handle edit entry
  const handleEditEntry = (entry: LabNotebookEntry) => {
    setSelectedEntry(entry);
    setShowEditModal(true);
  };

  // Handle delete entry
  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) {
      return;
    }

      try {
        const token = localStorage.getItem('authToken');
        if (!token) {
          console.error('No auth token found');
          return;
        }

        // #region agent log
        const apiUrlDelete = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
        fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:823',message:'deleteEntry API call',data:{apiUrl:apiUrlDelete,entryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const response = await fetch(`${apiUrlDelete}/lab-notebooks/${entryId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
        console.log('✅ Entry deleted successfully');
        // Refresh entries and activity
        fetchEntries();
        fetchRecentActivity();
        notifyDashboardSync('lab-notebook');
        } else {
        const errorData = await response.json();
        console.error('Failed to delete entry:', errorData);
        }
      } catch (error) {
        console.error('Error deleting entry:', error);
    }
  };

  // Handle update entry
  const handleUpdateEntry = async (entryId: string, updatedData: any) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      // #region agent log
      const apiUrlUpdate = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
      fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:853',message:'updateEntry API call',data:{apiUrl:apiUrlUpdate,entryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`${apiUrlUpdate}/lab-notebooks/${entryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
      });

      if (response.ok) {
        console.log('✅ Entry updated successfully');
        // Refresh entries and activity
        fetchEntries();
        fetchRecentActivity();
        setShowEditModal(false);
        notifyDashboardSync('lab-notebook');
      } else {
        const errorData = await response.json();
        console.error('Failed to update entry:', errorData);
      }
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    if (!Array.isArray(entries)) {
      return [];
    }
    let filtered = entries.filter(entry => {
      const title = (entry.title || '').toLowerCase();
      const content = (entry.content || '').toLowerCase();
      const tags = Array.isArray(entry.tags) ? entry.tags : [];
      const needle = searchTerm.toLowerCase();
      const matchesSearch =
        !needle ||
        title.includes(needle) ||
        content.includes(needle) ||
        tags.some((tag) => String(tag).toLowerCase().includes(needle));
      const matchesType = filterType === 'all' || entry.entry_type === filterType;
      const matchesStatus = filterStatus === 'all' || entry.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        default:
          return 0;
      }
    });

    return filtered;
  }, [entries, searchTerm, filterType, filterStatus, sortBy]);

  // Helper functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'planning': return 'bg-yellow-100 text-yellow-800';
      case 'on_hold': return 'bg-gray-100 text-gray-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSuggestionPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateEntry = () => {
    if (entryForm.title.trim()) {
      const newEntry: LabNotebookEntry = {
        id: Date.now().toString(),
        title: entryForm.title,
        content: entryForm.content,
        entry_type: entryForm.entry_type,
        status: entryForm.status,
        priority: entryForm.priority,
        objectives: entryForm.objectives,
        methodology: entryForm.methodology,
        results: entryForm.results,
        conclusions: entryForm.conclusions,
        next_steps: entryForm.next_steps,
        lab_id: entryForm.lab_id,
        lab_name: entryForm.lab_name,
        creator_name: entryForm.creator_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: entryForm.tags,
        privacy_level: entryForm.privacy_level,
        estimated_duration: entryForm.estimated_duration,
        actual_duration: entryForm.actual_duration,
        cost: entryForm.cost,
        equipment_used: entryForm.equipment_used,
        materials_used: entryForm.materials_used,
        safety_notes: entryForm.safety_notes,
        references: entryForm.references,
        collaborators: entryForm.collaborators
      };
      setEntries(prev => [newEntry, ...prev]);
        setEntryForm({
          title: '',
          content: '',
        entry_type: 'experiment',
        status: 'planning',
        priority: 'medium',
        objectives: '',
        methodology: '',
          results: '',
          conclusions: '',
        next_steps: '',
        lab_id: 'lab1',
        lab_name: 'Main Lab',
        creator_name: user?.username || 'Unknown',
        tags: [],
        privacy_level: 'lab',
        estimated_duration: 0,
        actual_duration: 0,
        cost: 0,
        equipment_used: [],
        materials_used: [],
        safety_notes: '',
        references: [],
        collaborators: []
      });
      setShowNewEntryModal(false);
    }
  };

  const handleCreateQuickNote = async () => {
    if (quickNoteForm.content.trim()) {
      try {
        const token = localStorage.getItem('authToken');
        console.log('📝 Creating quick note, token:', token ? 'exists' : 'missing');
        if (!token) {
          console.error('No auth token found');
          return;
        }

        // #region agent log
        const apiUrlQuickNote = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5002/api';
        fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:1009',message:'createQuickNote API call',data:{apiUrl:apiUrlQuickNote},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const response = await fetch(`${apiUrlQuickNote}/quick-notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            content: quickNoteForm.content.trim(),
            color: quickNoteForm.color
          })
        });

        console.log('📝 Create quick note response status:', response.status);
        if (response.ok) {
          const newNote = await response.json();
          console.log('📝 Quick note created successfully:', newNote);
          setQuickNotes(prev => [newNote, ...prev]);
          setQuickNoteForm({ content: '', color: 'yellow' });
          setShowQuickNoteModal(false);
          notifyDashboardSync('lab-notebook-note');
        } else {
          console.error('Failed to create quick note');
          // Fallback to local state if API fails
      const newNote: QuickNote = {
        id: Date.now().toString(),
        content: quickNoteForm.content,
        color: quickNoteForm.color,
        created_at: new Date().toISOString()
      };
      setQuickNotes(prev => [newNote, ...prev]);
      setQuickNoteForm({ content: '', color: 'yellow' });
      setShowQuickNoteModal(false);
        }
      } catch (error) {
        console.error('Error creating quick note:', error);
        // Fallback to local state if API fails
        const newNote: QuickNote = {
          id: Date.now().toString(),
          content: quickNoteForm.content,
          color: quickNoteForm.color,
          created_at: new Date().toISOString()
        };
        setQuickNotes(prev => [newNote, ...prev]);
        setQuickNoteForm({ content: '', color: 'yellow' });
        setShowQuickNoteModal(false);
      }
    }
  };

    return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Personal notebook"
        accent="sky"
        icon={<BookOpenIcon />}
        subtitle={
          <>
            Document experiments, ideas, results, and problems. For inventory, equipment, and tasks,
            use{' '}
            <Link
              to="/lab-workspace"
              className="font-medium text-sky-900 hover:text-sky-950 underline-offset-2 hover:underline"
            >
              Lab workspace
            </Link>
            .
          </>
        }
        actions={
          <>
            <Link
              to="/writing-studio/tools/generate"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-teal-900 bg-white/90 border border-teal-200 rounded-md hover:bg-teal-50 transition-colors"
            >
              <SparklesIcon className="w-4 h-4" />
              Start journey
            </Link>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-sky-900 bg-white/90 border border-sky-200 rounded-md hover:bg-sky-50 transition-colors"
            >
              <DocumentArrowUpIcon className="w-4 h-4" />
              Import Word / paste
            </button>
          </>
        }
      />

        {/* New entry types */}
        <PagePanel accent="sky" className="!p-0 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-sky-100/80 bg-gradient-to-r from-sky-50/60 to-transparent">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-sky-700" />
              <h2 className="text-[15px] font-semibold text-slate-900">New notebook entry</h2>
            </div>
            <p className="text-[13px] text-slate-500 mt-1">
              Pick a type to start writing — or import a Word note and we’ll draft the form.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {entryTypes.map((type) => {
                const IconComponent = type.icon;
                return (
                  <div
                    key={type.id}
                    onClick={() => handleEntryTypeSelect(type.id)}
                    className={`p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:shadow-sm transition-all duration-200 ${type.bgColor} group`}
                  >
                    <div className="flex items-center mb-2">
                      <IconComponent className={`w-5 h-5 ${type.color} mr-2`} />
                      <h3 className="text-sm font-semibold text-slate-900">{type.name}</h3>
                    </div>
                    <p className="text-xs text-slate-600">{type.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </PagePanel>

        {/* Personal notebook entries */}
          <div className="space-y-6">
          {/* Header with Summary Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50/70 via-white to-white px-4 py-3 shadow-sm">
            <h2 className="text-[16px] font-semibold text-slate-900 tracking-tight" data-testid="lab-notebook-heading">
              Notebook entries
            </h2>
            
            {/* Summary Generation Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => generateSummary('daily')}
                disabled={generatingSummary}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Generate daily summary"
              >
                {generatingSummary && summaryType === 'daily' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <DocumentTextIcon className="w-5 h-5 mr-2" />
                    Daily Summary
                  </>
                )}
              </Button>
              <Button
                onClick={() => generateSummary('weekly')}
                disabled={generatingSummary}
                className="bg-sky-700 hover:bg-sky-800 text-white"
                title="Generate weekly summary"
              >
                {generatingSummary && summaryType === 'weekly' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <DocumentTextIcon className="w-5 h-5 mr-2" />
                    Weekly Summary
                  </>
                )}
              </Button>
            </div>
          </div>

            {/* Search and Filters */}
            <PagePanel accent="sky">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <Input
                      placeholder="Search entries..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full"
                  />
                </div>
                  <Select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full"
                  >
                    <option value="all">All Types</option>
                    <option value="experiment">Experiment note</option>
                    <option value="idea">Idea</option>
                    <option value="results">Results note</option>
                    <option value="problem">Problem</option>
                    <option value="observation">Observation</option>
                    <option value="meeting">Meeting</option>
                  </Select>
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full"
                  >
                    <option value="all">All Status</option>
                    <option value="planning">Planning</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="failed">Failed</option>
                  </Select>
                </div>
            </PagePanel>

            {/* Entries List */}
            <div className="space-y-4">
              {filteredEntries.map((entry) => (
                <Card
                  key={entry.id}
                  data-entity-id={entry.id}
                  className={`hover:shadow-md transition-shadow ${
                    focusedId === entry.id ? 'ring-2 ring-sky-300 border-sky-400' : ''
                  }`}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                            {entry.status.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(entry.priority)}`}>
                            {entry.priority}
                          </span>
                        </div>
                        <p className="text-gray-600 mb-3">{entry.content}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <TagIcon className="h-4 w-4" />
                            {entry.entry_type}
                          </span>
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-4 w-4" />
                            {entry.creator_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {new Date(entry.created_at).toLocaleDateString()}
                          </span>
              </div>

                        {/* Workflow Integration Actions */}
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500 font-medium">Workflow Actions:</span>
                            <Link to="/protocols" className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                              <BeakerIcon className="h-4 w-4" />
                              Protocols
                            </Link>
                            <Link to="/lab-workspace" className="flex items-center gap-1 text-green-600 hover:text-green-800">
                              <ClipboardListIcon className="h-4 w-4" />
                              Inventory
                            </Link>
                            <Link to="/lab-workspace" className="flex items-center gap-1 text-purple-600 hover:text-purple-800">
                              <CalendarDaysIcon className="h-4 w-4" />
                              Book Equipment
                            </Link>
                            <Link to="/data-results" className="flex items-center gap-1 text-orange-600 hover:text-orange-800">
                              <ChartBarIcon className="h-4 w-4" />
                              Add Results
                            </Link>
                </div>
                </div>
              </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewEntry(entry)}
                          title="View Entry"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditEntry(entry)}
                          title="Edit Entry"
                        >
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteEntry(entry.id)}
                          title="Delete Entry"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

        {/* Entry Type Selection Modal */}
        {showEntryTypeModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                    New notebook entry
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-600">
                    Choose the documentation type that fits this note
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEntryTypeModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {entryTypes.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleEntryTypeSelect(type.id)}
                      className="text-left p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                          <IconComponent className="w-5 h-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold text-slate-900">
                            {type.name}
                          </span>
                          <span className="mt-1 block text-[12px] text-slate-600 leading-relaxed">
                            {type.description}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <DocumentImportModal
            title="Import notebook entry"
            subtitle="Upload a lab note or paste text — we’ll detect experiment, idea, results, or problem and draft the form."
            parseText={smartParseNotebookText}
            onCancel={() => setShowImportModal(false)}
            onParsed={(result) => {
              setShowImportModal(false);
              openImportedEntry(notebookPayloadToFormInitial(result.payload));
            }}
          />
        )}

        {/* Form Modals */}
        {showExperimentForm && (
          <ExperimentForm
            key={formInitialData ? `imp-exp-${String(formInitialData.title || '')}` : 'exp-blank'}
            mode="notebook"
            initialData={formInitialData as any}
            onSubmit={(data) => {
              clearFormInitial();
              handleFormSubmit(data, 'experiment');
            }}
            onCancel={() => {
              clearFormInitial();
              setShowExperimentForm(false);
            }}
          />
        )}

        {showIdeaForm && (
          <IdeaForm
            key={formInitialData ? `imp-idea-${String(formInitialData.title || '')}` : 'idea-blank'}
            initialData={formInitialData as any}
            onSubmit={(data) => {
              clearFormInitial();
              handleFormSubmit(data, 'idea');
            }}
            onCancel={() => {
              clearFormInitial();
              setShowIdeaForm(false);
            }}
          />
        )}

        {showResultsForm && (
          <ResultsForm
            key={formInitialData ? `imp-res-${String(formInitialData.title || '')}` : 'res-blank'}
            initialData={formInitialData as any}
            onSubmit={(data) => {
              clearFormInitial();
              handleFormSubmit(data, 'results');
            }}
            onCancel={() => {
              clearFormInitial();
              setShowResultsForm(false);
            }}
          />
        )}

        {showMeetingForm && (
          <MeetingForm
            onSubmit={(data) => handleFormSubmit(data, 'meeting')}
            onCancel={() => setShowMeetingForm(false)}
          />
        )}

        {showProblemForm && (
          <ProblemForm
            key={formInitialData ? `imp-prob-${String(formInitialData.title || '')}` : 'prob-blank'}
            initialData={formInitialData as any}
            onSubmit={(data) => {
              clearFormInitial();
              handleFormSubmit(data, 'problem');
            }}
            onCancel={() => {
              clearFormInitial();
              setShowProblemForm(false);
            }}
          />
      )}

        {/* New Entry Modal */}
        {showNewEntryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Create New Entry</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewEntryModal(false)}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <Input
                    value={entryForm.title}
                      onChange={(e) => setEntryForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter entry title..."
                      className="w-full"
                    />
              </div>

              <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                <textarea
                  value={entryForm.content}
                      onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Enter entry content..."
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

                  <div className="grid grid-cols-2 gap-4">
                <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                      <Select
                    value={entryForm.entry_type}
                        onChange={(e) => setEntryForm(prev => ({ ...prev, entry_type: e.target.value as any }))}
                        className="w-full"
                      >
                        <option value="experiment">Experiment note</option>
                        <option value="idea">Idea</option>
                        <option value="results">Results note</option>
                        <option value="problem">Problem</option>
                        <option value="observation">Observation</option>
                        <option value="meeting">Meeting</option>
                      </Select>
              </div>

              <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <Select
                        value={entryForm.status}
                        onChange={(e) => setEntryForm(prev => ({ ...prev, status: e.target.value as any }))}
                        className="w-full"
                      >
                        <option value="planning">Planning</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="failed">Failed</option>
                      </Select>
                  </div>
              </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowNewEntryModal(false)}
                >
                  Cancel
                    </Button>
                    <Button
                      onClick={handleCreateEntry}
                      className="bg-slate-800 hover:bg-slate-700 text-white"
                    >
                      <SaveIcon className="h-4 w-4 mr-2" />
                      Create Entry
                    </Button>
              </div>
                </div>
              </div>
          </div>
        </div>
      )}

        {/* Quick Note Modal */}
        {showQuickNoteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Quick Note</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQuickNoteModal(false)}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </Button>
            </div>

                <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
                    <textarea
                      value={quickNoteForm.content}
                      onChange={(e) => setQuickNoteForm(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Enter your quick note..."
                      className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                    <div className="flex gap-2">
                      {['yellow', 'blue', 'green', 'pink'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setQuickNoteForm(prev => ({ ...prev, color: color as any }))}
                          className={`w-8 h-8 rounded-full border-2 ${
                            quickNoteForm.color === color ? 'border-gray-400' : 'border-gray-200'
                          } ${
                            color === 'yellow' ? 'bg-yellow-400' :
                            color === 'blue' ? 'bg-blue-400' :
                            color === 'green' ? 'bg-green-400' :
                            'bg-pink-400'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowQuickNoteModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateQuickNote}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white"
                    >
                      <SaveIcon className="h-4 w-4 mr-2" />
                      Save Note
                    </Button>
                        </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Entry Modal */}
      {showViewModal && selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">{selectedEntry.title}</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowViewModal(false)}
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-6">
                <LinkedEntityChips
                  links={buildWorkflowLinks({
                    protocolId: selectedEntry.protocolId || selectedEntry.protocol_id,
                    experimentId: selectedEntry.experimentId || selectedEntry.experiment_id,
                  })}
                />
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={evidenceFromRecordUrl({
                      notebookEntryId: selectedEntry.id,
                      experimentId:
                        selectedEntry.experimentId || selectedEntry.experiment_id || null,
                      protocolId: selectedEntry.protocolId || selectedEntry.protocol_id || null,
                      title: selectedEntry.title,
                      summary: selectedEntry.results || selectedEntry.content?.slice(0, 240) || '',
                    })}
                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-100"
                  >
                    Create evidence pack →
                  </Link>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Entry Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Type</label>
                      <p className="text-sm text-gray-900">{selectedEntry.entry_type}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="text-sm text-gray-900">{selectedEntry.status}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Priority</label>
                      <p className="text-sm text-gray-900">{selectedEntry.priority}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Created</label>
                      <p className="text-sm text-gray-900">{new Date(selectedEntry.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {selectedEntry.content && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Content</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEntry.content}</p>
                  </div>
                )}

                {selectedEntry.objectives && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Objectives</h3>
                    <p className="text-sm text-gray-700">{selectedEntry.objectives}</p>
                  </div>
                )}

                {selectedEntry.results && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Results</h3>
                    <p className="text-sm text-gray-700">{selectedEntry.results}</p>
                  </div>
                )}

                {selectedEntry.conclusions && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Conclusions</h3>
                    <p className="text-sm text-gray-700">{selectedEntry.conclusions}</p>
                  </div>
                )}

                {selectedEntry.tags && selectedEntry.tags.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedEntry.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowViewModal(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setShowViewModal(false);
                    handleEditEntry(selectedEntry);
                  }}
                >
                  Edit Entry
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {showEditModal && selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Edit Entry</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditModal(false)}
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <Input
                    value={selectedEntry.title}
                    onChange={(e) => setSelectedEntry(prev => prev ? { ...prev, title: e.target.value } : null)}
                    placeholder="Entry title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                  <textarea
                    value={selectedEntry.content || ''}
                    onChange={(e) => setSelectedEntry(prev => prev ? { ...prev, content: e.target.value } : null)}
                    placeholder="Entry content"
                    className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <Select
                      value={selectedEntry.status}
                      onChange={(e) => {
                        // #region agent log
                        const newStatus = e.target.value;
                        fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:1693',message:'Status update attempt',data:{newStatus,currentStatus:selectedEntry?.status,isValidStatus:['planning','in_progress','completed','on_hold','failed'].includes(newStatus)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
                        // #endregion
                        setSelectedEntry(prev => prev ? { ...prev, status: newStatus as 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'failed' } : null);
                      }}
                    >
                      <option value="planning">Planning</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                      <option value="failed">Failed</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                    <Select
                      value={selectedEntry.priority}
                      onChange={(e) => {
                        // #region agent log
                        const newPriority = e.target.value;
                        fetch('http://127.0.0.1:7243/ingest/d8d74533-e1f5-4bba-aa87-ed01b5b636d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LabNotebookPage.tsx:1710',message:'Priority update attempt',data:{newPriority,currentPriority:selectedEntry?.priority,isValidPriority:['low','medium','high','critical'].includes(newPriority)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
                        // #endregion
                        setSelectedEntry(prev => prev ? { ...prev, priority: newPriority as 'low' | 'medium' | 'high' | 'critical' } : null);
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Objectives</label>
                  <textarea
                    value={selectedEntry.objectives || ''}
                    onChange={(e) => setSelectedEntry(prev => prev ? { ...prev, objectives: e.target.value } : null)}
                    placeholder="Entry objectives"
                    className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Results</label>
                  <textarea
                    value={selectedEntry.results || ''}
                    onChange={(e) => setSelectedEntry(prev => prev ? { ...prev, results: e.target.value } : null)}
                    placeholder="Entry results"
                    className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Conclusions</label>
                  <textarea
                    value={selectedEntry.conclusions || ''}
                    onChange={(e) => setSelectedEntry(prev => prev ? { ...prev, conclusions: e.target.value } : null)}
                    placeholder="Entry conclusions"
                    className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedEntry) {
                      handleUpdateEntry(selectedEntry.id, {
                            title: selectedEntry.title,
                            content: selectedEntry.content,
                            status: selectedEntry.status,
                            priority: selectedEntry.priority,
                            objectives: selectedEntry.objectives,
                            results: selectedEntry.results,
                        conclusions: selectedEntry.conclusions,
                        next_steps: selectedEntry.next_steps,
                        tags: selectedEntry.tags,
                        privacy_level: selectedEntry.privacy_level
                      });
                    }
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NotebookSummaryModal
        open={showSummaryModal}
        summaryType={summaryType}
        summary={generatedSummary}
        generatedAt={summaryGeneratedAt}
        onClose={() => {
          setShowSummaryModal(false);
          setGeneratedSummary(null);
          setSummaryGeneratedAt(null);
        }}
      />
    </div>
  );
};

export default LabNotebookPage;