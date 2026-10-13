import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardHeader, CardTitle } from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import { experimentService, Experiment, Milestone, Risk } from '../services/experimentService';
import LinkedEntityChips, { buildWorkflowLinks } from './LinkedEntityChips';
import {
  evidenceFromRecordUrl,
  notebookFromExperimentUrl,
} from '../utils/evidenceChain';
import {
  BeakerIcon,
  CalendarIcon,
  ClockIcon,
  UserIcon,
  TagIcon,
  EyeIcon,
  EditIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  MinusIcon,
  ArrowRightIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CogIcon,
  BellIcon,
  ShareIcon,
  DownloadIcon,
  PrinterIcon,
  XMarkIcon,
  CheckIcon,
  InformationCircleIcon,
  ExclamationCircleIcon
} from '../components/icons';

interface ExperimentDetailViewProps {
  experiment: Experiment;
  onClose: () => void;
  onEdit: (experiment: Experiment) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const ExperimentDetailView: React.FC<ExperimentDetailViewProps> = ({
  experiment,
  onClose,
  onEdit,
  onDelete,
  onStatusChange
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'risks' | 'progress' | 'comments'>('overview');
  const [milestones, setMilestones] = useState<Milestone[]>(experiment.milestones);
  const [risks, setRisks] = useState<Risk[]>(experiment.risks);
  const [progressLog, setProgressLog] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', dueDate: '' });
  const [newRisk, setNewRisk] = useState({ title: '', description: '', probability: 'medium', impact: 'medium', mitigation: '' });
  const [newComment, setNewComment] = useState({ comment: '', isInternal: true });
  const [newProgressEntry, setNewProgressEntry] = useState({ status: '', notes: '', durationLogged: 0, costLogged: 0 });
  const [publicProtocols, setPublicProtocols] = useState<Array<{ externalId: string; title: string }>>([]);
  const [relatedPapers, setRelatedPapers] = useState<Array<{ id: string; title: string; doi?: string }>>([]);

  useEffect(() => {
    loadProgressLog();
    loadComments();
  }, [experiment.id]);

  useEffect(() => {
    const tags = Array.isArray(experiment.tags) ? experiment.tags : [];
    const query = [experiment.title, experiment.hypothesis, ...tags]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (query.length < 3) {
      setPublicProtocols([]);
      setRelatedPapers([]);
      return;
    }
    const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:5002/api').replace(/\/$/, '');
    fetch(`${base}/protocols/external/search?q=${encodeURIComponent(query.slice(0, 180))}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((response) => response.json())
      .then((data) => {
        const rows = Array.isArray(data?.protocols) ? data.protocols : [];
        setPublicProtocols(rows.slice(0, 6).map((item: any) => ({
          externalId: String(item.externalId),
          title: String(item.title),
        })));
      })
      .catch(() => setPublicProtocols([]));

    const paperQuery = String(experiment.title || '').trim();
    if (paperQuery.length < 3) {
      setRelatedPapers([]);
      return;
    }
    fetch(`${base}/research/search?q=${encodeURIComponent(paperQuery.slice(0, 180))}&limit=4`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((response) => response.json())
      .then((data) => {
        const rows = Array.isArray(data?.papers) ? data.papers : [];
        setRelatedPapers(rows.slice(0, 4).map((item: any) => ({
          id: String(item.openalexId || item.doi || item.title),
          title: String(item.title),
          doi: item.doi || undefined,
        })));
      })
      .catch(() => setRelatedPapers([]));
  }, [experiment.title, experiment.hypothesis, experiment.tags]);

  const loadProgressLog = async () => {
    try {
      const data = await experimentService.getProgressLog(experiment.id);
      setProgressLog(data);
    } catch (error) {
      console.error('Error loading progress log:', error);
    }
  };

  const loadComments = async () => {
    try {
      const data = await experimentService.getComments(experiment.id);
      setComments(data);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const handleAddMilestone = async () => {
    if (!newMilestone.title.trim()) return;
    
    try {
      const milestone = await experimentService.addMilestone(experiment.id, newMilestone);
      setMilestones(prev => [...prev, milestone]);
      setNewMilestone({ title: '', description: '', dueDate: '' });
    } catch (error) {
      console.error('Error adding milestone:', error);
    }
  };

  const handleUpdateMilestoneStatus = async (milestoneId: string, status: string, notes?: string) => {
    try {
      const updatedMilestone = await experimentService.updateMilestoneStatus(milestoneId, { status, notes });
      setMilestones(prev => prev.map(m => m.id === milestoneId ? updatedMilestone : m));
    } catch (error) {
      console.error('Error updating milestone:', error);
    }
  };

  const handleAddProgressEntry = async () => {
    if (!newProgressEntry.notes.trim()) return;
    
    try {
      await experimentService.addProgressLog(experiment.id, newProgressEntry);
      setNewProgressEntry({ status: '', notes: '', durationLogged: 0, costLogged: 0 });
      await loadProgressLog();
    } catch (error) {
      console.error('Error adding progress entry:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.comment.trim()) return;
    
    try {
      const comment = await experimentService.addComment(experiment.id, newComment);
      setComments(prev => [...prev, comment]);
      setNewComment({ comment: '', isInternal: true });
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-yellow-100 text-yellow-800';
      case 'paused': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
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

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskLevelColor = (probability: string, impact: string) => {
    const riskMatrix = {
      'low-low': 'bg-green-100 text-green-800',
      'low-medium': 'bg-yellow-100 text-yellow-800',
      'low-high': 'bg-orange-100 text-orange-800',
      'medium-low': 'bg-yellow-100 text-yellow-800',
      'medium-medium': 'bg-orange-100 text-orange-800',
      'medium-high': 'bg-red-100 text-red-800',
      'high-low': 'bg-orange-100 text-orange-800',
      'high-medium': 'bg-red-100 text-red-800',
      'high-high': 'bg-red-100 text-red-800'
    };
    return riskMatrix[`${probability}-${impact}`] || 'bg-gray-100 text-gray-800';
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: EyeIcon },
    { id: 'milestones', name: 'Milestones', icon: CheckCircleIcon },
    { id: 'risks', name: 'Risks', icon: ExclamationTriangleIcon },
    { id: 'progress', name: 'Progress', icon: ChartBarIcon },
    { id: 'comments', name: 'Comments', icon: DocumentTextIcon }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BeakerIcon className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{experiment.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}>
                  {experiment.status.replace('_', ' ')}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(experiment.priority)}`}>
                  {experiment.priority}
                </span>
                <span className="text-sm text-gray-500">
                  {experiment.progressPercentage}% complete
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LinkedEntityChips
              title=""
              links={buildWorkflowLinks({
                protocolId: experiment.protocolId,
                notebookEntryId: experiment.notebookEntryId,
              })}
            />
            <Link
              to={notebookFromExperimentUrl({
                experimentId: experiment.id,
                protocolId: experiment.protocolId,
                title: experiment.title,
              })}
              className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
            >
              <DocumentTextIcon className="h-4 w-4 mr-2" />
              Log in notebook
            </Link>
            <Link
              to={evidenceFromRecordUrl({
                experimentId: experiment.id,
                protocolId: experiment.protocolId,
                notebookEntryId: experiment.notebookEntryId,
                title: experiment.title,
                summary: experiment.description || experiment.hypothesis || '',
              })}
              className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-100"
            >
              <ChartBarIcon className="h-4 w-4 mr-2" />
              Create evidence
            </Link>
            <Button variant="outline" onClick={() => onEdit(experiment)}>
              <EditIcon className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => onDelete(experiment.id)} className="text-red-600 hover:text-red-700">
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={onClose}>
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {relatedPapers.length > 0 ? (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-sm text-slate-800">
            <p className="font-medium">Related literature from OpenAlex</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {relatedPapers.map((item) => (
                item.doi ? (
                  <a key={item.id} className="underline" href={`https://doi.org/${item.doi}`} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                ) : (
                  <span key={item.id}>{item.title}</span>
                )
              ))}
            </div>
          </div>
        ) : null}

        {publicProtocols.length > 0 ? (
          <div className="px-6 py-3 bg-teal-50 border-b border-teal-100 text-sm text-teal-950">
            <p className="font-medium">
              We found {publicProtocols.length} relevant public protocols for this experiment.
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {publicProtocols.map((item) => (
                <Link
                  key={item.externalId}
                  className="underline"
                  to={`/protocols?q=${encodeURIComponent(item.title)}`}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-5 h-5 mr-2" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Description</label>
                        <p className="text-gray-900">{experiment.description}</p>
                      </div>
                      {experiment.hypothesis && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Hypothesis</label>
                          <p className="text-gray-900">{experiment.hypothesis}</p>
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-medium text-gray-500">Category</label>
                        <p className="text-gray-900">{experiment.category.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Researcher</label>
                        <p className="text-gray-900">{experiment.researcherName}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Timeline & Resources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-500">Estimated Duration:</span>
                        <span className="text-gray-900">{experiment.estimatedDuration} hours</span>
                      </div>
                      {experiment.actualDuration > 0 && (
                        <div className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">Actual Duration:</span>
                          <span className="text-gray-900">{experiment.actualDuration} hours</span>
                        </div>
                      )}
                      {experiment.dueDate && (
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">Due Date:</span>
                          <span className="text-gray-900">{new Date(experiment.dueDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Budget:</span>
                        <span className="text-gray-900">${experiment.budget}</span>
                      </div>
                      {experiment.actualCost > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Actual Cost:</span>
                          <span className="text-gray-900">${experiment.actualCost}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Objectives</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1">
                      {experiment.objectives.map((objective, index) => (
                        <li key={index} className="text-gray-900">{objective}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Expected Outcomes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1">
                      {experiment.expectedOutcomes.map((outcome, index) => (
                        <li key={index} className="text-gray-900">{outcome}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Methodology</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-gray-900">{experiment.methodology}</div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Equipment & Materials</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Equipment</label>
                        <ul className="list-disc list-inside mt-1">
                          {experiment.equipment.map((item, index) => (
                            <li key={index} className="text-gray-900">{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Materials</label>
                        <ul className="list-disc list-inside mt-1">
                          {experiment.materials.map((item, index) => (
                            <li key={index} className="text-gray-900">{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Reagents</label>
                        <ul className="list-disc list-inside mt-1">
                          {experiment.reagents.map((item, index) => (
                            <li key={index} className="text-gray-900">{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Safety Requirements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1">
                      {experiment.safetyRequirements.map((requirement, index) => (
                        <li key={index} className="text-gray-900">{requirement}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {experiment.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tags</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {experiment.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {experiment.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-wrap text-gray-900">{experiment.notes}</div>
                  </CardContent>
                </Card>
              )}

              {experiment.results && (
                <Card>
                  <CardHeader>
                    <CardTitle>Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-wrap text-gray-900">{experiment.results}</div>
                  </CardContent>
                </Card>
              )}

              {experiment.conclusions && (
                <Card>
                  <CardHeader>
                    <CardTitle>Conclusions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-wrap text-gray-900">{experiment.conclusions}</div>
                  </CardContent>
                </Card>
              )}

              {experiment.nextSteps && (
                <Card>
                  <CardHeader>
                    <CardTitle>Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-wrap text-gray-900">{experiment.nextSteps}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Milestones Tab */}
          {activeTab === 'milestones' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Milestones</h3>
                <Button onClick={handleAddMilestone} disabled={!newMilestone.title.trim()}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </div>

              {/* Add Milestone Form */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                      placeholder="Milestone title"
                      value={newMilestone.title}
                      onChange={(e) => setNewMilestone(prev => ({ ...prev, title: e.target.value }))}
                    />
                    <Input
                      type="date"
                      value={newMilestone.dueDate}
                      onChange={(e) => setNewMilestone(prev => ({ ...prev, dueDate: e.target.value }))}
                    />
                    <Input
                      placeholder="Description"
                      value={newMilestone.description}
                      onChange={(e) => setNewMilestone(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Milestones List */}
              <div className="space-y-4">
                {milestones.map((milestone) => (
                  <Card key={milestone.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">{milestone.title}</h4>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMilestoneStatusColor(milestone.status)}`}>
                              {milestone.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-gray-600 mb-2">{milestone.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center">
                              <CalendarIcon className="w-4 h-4 mr-1" />
                              Due: {new Date(milestone.dueDate).toLocaleDateString()}
                            </span>
                            {milestone.completedAt && (
                              <span className="flex items-center">
                                <CheckCircleIcon className="w-4 h-4 mr-1" />
                                Completed: {new Date(milestone.completedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {milestone.notes && (
                            <div className="mt-2 p-2 bg-gray-50 rounded">
                              <p className="text-sm text-gray-700">{milestone.notes}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={milestone.status}
                            onChange={(e) => handleUpdateMilestoneStatus(milestone.id, e.target.value)}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="overdue">Overdue</option>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Risks Tab */}
          {activeTab === 'risks' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Risk Assessment</h3>
              
              <div className="space-y-4">
                {risks.map((risk) => (
                  <Card key={risk.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">{risk.title}</h4>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(risk.probability, risk.impact)}`}>
                              {risk.probability} probability, {risk.impact} impact
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              risk.status === 'active' ? 'bg-red-100 text-red-800' :
                              risk.status === 'mitigated' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {risk.status}
                            </span>
                          </div>
                          <p className="text-gray-600 mb-2">{risk.description}</p>
                          <div className="mt-2">
                            <label className="text-sm font-medium text-gray-500">Mitigation Strategy:</label>
                            <p className="text-gray-900">{risk.mitigation}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Progress Log</h3>
                <Button onClick={handleAddProgressEntry} disabled={!newProgressEntry.notes.trim()}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Progress Entry
                </Button>
              </div>

              {/* Add Progress Entry Form */}
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <Select
                        value={newProgressEntry.status}
                        onChange={(e) => setNewProgressEntry(prev => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="">Select status</option>
                        <option value="planning">Planning</option>
                        <option value="ready">Ready</option>
                        <option value="running">Running</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration Logged (minutes)</label>
                      <Input
                        type="number"
                        value={newProgressEntry.durationLogged}
                        onChange={(e) => setNewProgressEntry(prev => ({ ...prev, durationLogged: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cost Logged ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newProgressEntry.costLogged}
                        onChange={(e) => setNewProgressEntry(prev => ({ ...prev, costLogged: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={newProgressEntry.notes}
                        onChange={(e) => setNewProgressEntry(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Progress notes..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Log */}
              <div className="space-y-4">
                {progressLog.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                              {entry.status.replace('_', ' ')}
                            </span>
                            <span className="text-sm text-gray-500">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-gray-900">{entry.notes}</p>
                          {(entry.duration_logged > 0 || entry.cost_logged > 0) && (
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                              {entry.duration_logged > 0 && (
                                <span>Duration: {entry.duration_logged} minutes</span>
                              )}
                              {entry.cost_logged > 0 && (
                                <span>Cost: ${entry.cost_logged}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Comments</h3>
                <Button onClick={handleAddComment} disabled={!newComment.comment.trim()}>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Comment
                </Button>
              </div>

              {/* Add Comment Form */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newComment.isInternal}
                        onChange={(e) => setNewComment(prev => ({ ...prev, isInternal: e.target.checked }))}
                        className="rounded"
                      />
                      <label className="text-sm text-gray-700">Internal comment (visible only to team)</label>
                    </div>
                    <textarea
                      value={newComment.comment}
                      onChange={(e) => setNewComment(prev => ({ ...prev, comment: e.target.value }))}
                      placeholder="Add a comment..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Comments List */}
              <div className="space-y-4">
                {comments.map((comment) => (
                  <Card key={comment.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-900">{comment.user_name}</span>
                            <span className="text-sm text-gray-500">
                              {new Date(comment.created_at).toLocaleString()}
                            </span>
                            {comment.is_internal && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Internal
                              </span>
                            )}
                          </div>
                          <p className="text-gray-900">{comment.comment}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExperimentDetailView;
