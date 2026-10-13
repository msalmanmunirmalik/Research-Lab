/**
 * Protocol AI Assistant Component
 * Provides AI-powered features: optimization, generation, troubleshooting, material substitution
 */

import React, { useState } from 'react';
import { 
  SparklesIcon, 
  LightBulbIcon, 
  ArrowPathIcon,
  ExclamationTriangleIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Button from './ui/Button';
import Card, { CardContent, CardHeader, CardTitle } from './ui/Card';
import axios from 'axios';
import { getAuthHeaders } from '../utils/apiBase';

interface ProtocolAIAssistantProps {
  contentOrigin?: 'original' | 'adaptation' | 'drm' | 'springer';
  protocol?: {
    id?: string;
    title?: string;
    description: string;
    steps: Array<{
      id: number;
      title: string;
      description: string;
      duration: number;
      materials_needed?: Array<{ name: string; quantity?: string; unit?: string }>;
    }>;
    materials?: any[];
    equipment?: any[];
  };
  onOptimized?: (optimizedProtocol: any) => void;
  onClose?: () => void;
}

type AssistantMode = 'optimize' | 'generate' | 'troubleshoot' | 'substitute' | null;

const ProtocolAIAssistant: React.FC<ProtocolAIAssistantProps> = ({
  protocol,
  contentOrigin = 'drm',
  onOptimized,
  onClose
}) => {
  const originNote =
    contentOrigin === 'original'
      ? 'The steps below are the original protocols.io protocol. Anything this assistant writes is a suggestion, not part of that original.'
      : contentOrigin === 'springer'
        ? 'Only SpringerProtocols metadata is available. Do not treat AI text as the publisher protocol. AI suggestions are separate from that metadata.'
        : contentOrigin === 'adaptation'
          ? 'This is a DRM adaptation. Original protocols.io text and your lab changes stay separate from AI suggestions.'
          : 'AI suggestions are not written into the protocol until you save them yourself.';

  const [activeMode, setActiveMode] = useState<AssistantMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');

  const handleOptimize = async () => {
    if (!protocol) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const steps = (protocol.steps || []).map((step, index) => ({
        step: Number(step.id) || index + 1,
        description: [step.title, step.description].filter(Boolean).join(': '),
        duration: `${step.duration || 0}m`,
        resources: step.materials_needed?.map((m) => m.name) || [],
        equipment: [] as string[],
      }));

      const materials = (protocol.materials || []).map((m: any) =>
        typeof m === 'string' ? m : m?.name || String(m)
      );
      const equipment = (protocol.equipment || []).map((e: any) =>
        typeof e === 'string' ? e : e?.name || String(e)
      );

      const response = await axios.post(
        '/api/agents/protocol_optimization/execute',
        {
          input: {
            protocol: {
              title: protocol.title,
              description: protocol.description,
              steps,
              materials,
              equipment,
            },
            optimizationGoals: ['efficiency', 'accuracy', 'cost', 'safety'],
          },
          config: {},
        },
        { headers: getAuthHeaders() }
      );

      const payload = response.data.result?.content || response.data.result;
      if (response.data.success && payload) {
        setResult(payload);
        if (onOptimized) {
          onOptimized(payload);
        }
      } else {
        throw new Error(response.data.error || 'Optimization failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to optimize protocol');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setError('Please describe the protocol you want to generate');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      // Use AI to generate protocol from description
      const response = await axios.post(
        '/api/ai-training/chat',
        {
          question: `Generate a detailed experimental protocol for: ${userInput}. Include objective, background, materials, equipment, step-by-step procedure, safety notes, expected results, and troubleshooting. Format as structured JSON.`
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.answer) {
        setResult({ generated: response.data.answer });
      } else {
        throw new Error('Failed to generate protocol');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to generate protocol');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTroubleshoot = async () => {
    if (!userInput.trim()) {
      setError('Please describe the issue you encountered');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/ai-training/chat',
        {
          question: `I'm having an issue with this protocol: "${protocol?.title || 'protocol'}". Problem: ${userInput}. Provide troubleshooting steps and solutions.`
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.answer) {
        setResult({ troubleshooting: response.data.answer });
      } else {
        throw new Error('Failed to get troubleshooting help');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to troubleshoot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMaterialSubstitute = async () => {
    if (!userInput.trim()) {
      setError('Please specify which material you need to substitute');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/ai-training/chat',
        {
          question: `For the protocol "${protocol?.title || 'protocol'}", I need to substitute: ${userInput}. Suggest alternative materials with suppliers, catalog numbers, and any protocol modifications needed.`
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.answer) {
        setResult({ substitution: response.data.answer });
      } else {
        throw new Error('Failed to find substitutes');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to find material substitutes');
    } finally {
      setIsLoading(false);
    }
  };

  const modes = [
    {
      id: 'optimize' as AssistantMode,
      title: 'Optimize Protocol',
      description: 'AI analyzes and optimizes for efficiency, accuracy, cost, and safety',
      icon: ArrowPathIcon,
      available: !!protocol,
      action: handleOptimize
    },
    {
      id: 'generate' as AssistantMode,
      title: 'Generate Protocol',
      description: 'Create a new protocol from a natural language description',
      icon: SparklesIcon,
      available: true,
      action: handleGenerate
    },
    {
      id: 'troubleshoot' as AssistantMode,
      title: 'Troubleshoot Issue',
      description: 'Get AI-powered solutions for protocol problems',
      icon: ExclamationTriangleIcon,
      available: !!protocol,
      action: handleTroubleshoot
    },
    {
      id: 'substitute' as AssistantMode,
      title: 'Material Substitution',
      description: 'Find alternative materials when something is unavailable',
      icon: BeakerIcon,
      available: !!protocol,
      action: handleMaterialSubstitute
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <SparklesIcon className="w-6 h-6" />
              <CardTitle className="text-white">AI Protocol Assistant</CardTitle>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {originNote}
          </p>
          {!activeMode ? (
            <div className="space-y-4">
              <p className="text-gray-600 mb-6">
                Choose an AI-powered feature to enhance your protocol workflow:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        if (mode.id === 'optimize') {
                          setActiveMode(mode.id);
                          mode.action();
                        } else {
                          setActiveMode(mode.id);
                        }
                      }}
                      disabled={!mode.available}
                      className={`p-6 rounded-xl border-2 transition-all text-left ${
                        mode.available
                          ? 'border-blue-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                          : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Icon className={`w-8 h-8 mb-3 ${mode.available ? 'text-blue-600' : 'text-gray-400'}`} />
                      <h3 className="font-bold text-gray-900 mb-2">{mode.title}</h3>
                      <p className="text-sm text-gray-600">{mode.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">
                  {modes.find(m => m.id === activeMode)?.title}
                </h3>
                <button
                  onClick={() => {
                    setActiveMode(null);
                    setResult(null);
                    setError(null);
                    setUserInput('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {activeMode !== 'optimize' && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {activeMode === 'generate' && 'Describe the protocol you want to create'}
                    {activeMode === 'troubleshoot' && 'Describe the issue you encountered'}
                    {activeMode === 'substitute' && 'Specify the material to substitute'}
                  </label>
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                    placeholder={
                      activeMode === 'generate'
                        ? 'e.g., "PCR amplification of DNA fragments with specific primers"'
                        : activeMode === 'troubleshoot'
                        ? 'e.g., "No bands detected after Western blot transfer"'
                        : 'e.g., "PVDF membrane - need alternative"'
                    }
                  />
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <span className="ml-4 text-gray-600">AI is working...</span>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-bold text-green-900 mb-2">AI suggestion — not part of the original protocol</h4>
                    <div className="text-gray-800 whitespace-pre-wrap text-sm">
                      {result.optimizedProtocol ? (
                        <div>
                          <h5 className="font-bold mb-2">Optimized Protocol:</h5>
                          <pre className="bg-white p-4 rounded overflow-auto">
                            {JSON.stringify(result, null, 2)}
                          </pre>
                        </div>
                      ) : result.generated ? (
                        <div>{result.generated}</div>
                      ) : result.troubleshooting ? (
                        <div>{result.troubleshooting}</div>
                      ) : result.substitution ? (
                        <div>{result.substitution}</div>
                      ) : (
                        <pre className="bg-white p-4 rounded overflow-auto">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                  {activeMode === 'optimize' && result.optimizedProtocol && (
                    <Button
                      onClick={() => {
                        if (onOptimized) {
                          onOptimized(result);
                        }
                      }}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
                    >
                      Apply Optimizations
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => {
                    const mode = modes.find(m => m.id === activeMode);
                    if (mode) mode.action();
                  }}
                  disabled={isLoading || (activeMode !== 'optimize' && !userInput.trim())}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
                >
                  {activeMode === 'optimize' ? 'Optimize Protocol' : 'Get AI Assistance'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProtocolAIAssistant;

