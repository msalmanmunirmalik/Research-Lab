/**
 * AI Provider Abstraction Interface
 * Task 1: Create standardized interface for all AI providers
 * 
 * This interface allows the system to work with any AI provider
 * through a unified API, making it easy to add new providers
 * and switch between them dynamically.
 */

export interface AIProviderConfig {
  /** Optional when the provider already holds a key from construction. */
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any; // Allow provider-specific config
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: any;
}

export interface EmbeddingResponse {
  embedding: number[];
  model?: string;
  usage?: {
    tokens?: number;
  };
}

/**
 * Base AI Provider Interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
  /**
   * Provider identifier (e.g., 'openai', 'google_gemini', 'anthropic_claude')
   */
  readonly provider: string;
  
  /**
   * Human-readable provider name
   */
  readonly providerName: string;
  
  /**
   * Check if provider supports chat completions
   */
  supportsChat(): boolean;
  
  /**
   * Check if provider supports embeddings
   */
  supportsEmbeddings(): boolean;
  
  /**
   * Check if provider supports image generation
   */
  supportsImageGeneration(): boolean;
  
  /**
   * Get default model for chat
   */
  getDefaultChatModel(): string;
  
  /**
   * Get default model for embeddings
   */
  getDefaultEmbeddingModel(): string;
  
  /**
   * Chat completion
   * @param messages Array of chat messages
   * @param config Provider-specific configuration
   * @returns Chat response
   */
  chat(
    messages: ChatMessage[],
    config?: AIProviderConfig
  ): Promise<ChatResponse>;
  
  /**
   * Generate embeddings
   * @param text Text to embed
   * @param config Provider-specific configuration
   * @returns Embedding response
   */
  embed(
    text: string,
    config?: AIProviderConfig
  ): Promise<EmbeddingResponse>;
  
  /**
   * Generate image (if supported)
   * @param prompt Image generation prompt
   * @param config Provider-specific configuration
   * @returns Image URL or data
   */
  generateImage?(
    prompt: string,
    config?: AIProviderConfig
  ): Promise<string>;
  
  /**
   * Validate API key
   * @param apiKey API key to validate
   * @returns True if valid
   */
  validateApiKey(apiKey: string): Promise<boolean>;
}

/**
 * Provider Capabilities
 * Defines what each provider is best at
 */
export interface ProviderCapabilities {
  provider: string;
  strengths: string[]; // e.g., ['writing', 'analysis', 'reasoning']
  bestFor: string[]; // e.g., ['paper_finding', 'abstract_writing']
  contextLength: number; // Maximum context window
  speed: 'fast' | 'medium' | 'slow';
  cost: 'low' | 'medium' | 'high';
  quality: 'high' | 'medium' | 'low';
}

/**
 * Provider Registry
 * Stores capabilities of all providers
 */
export class ProviderCapabilityRegistry {
  private static capabilities: Map<string, ProviderCapabilities> = new Map([
    ['openai', {
      provider: 'openai',
      strengths: ['writing', 'code', 'analysis'],
      bestFor: ['content_writing', 'abstract_writing', 'code_generation'],
      contextLength: 128000,
      speed: 'medium',
      cost: 'high',
      quality: 'high'
    }],
    ['google_gemini', {
      provider: 'google_gemini',
      strengths: ['reasoning', 'multimodal', 'research'],
      bestFor: ['paper_finding', 'data_analysis', 'idea_generation'],
      contextLength: 1000000,
      speed: 'fast',
      cost: 'medium',
      quality: 'high'
    }],
    ['anthropic_claude', {
      provider: 'anthropic_claude',
      strengths: ['reasoning', 'analysis', 'long_context'],
      bestFor: ['proposal_writing', 'data_analysis', 'paper_generation'],
      contextLength: 200000,
      speed: 'medium',
      cost: 'high',
      quality: 'high'
    }],
    ['perplexity', {
      provider: 'perplexity',
      strengths: ['search', 'real_time', 'research'],
      bestFor: ['paper_finding', 'research', 'summarization'],
      contextLength: 100000,
      speed: 'fast',
      cost: 'medium',
      quality: 'high'
    }]
  ]);
  
  /**
   * Get capabilities for a provider
   */
  static getCapabilities(provider: string): ProviderCapabilities | null {
    return this.capabilities.get(provider) || null;
  }
  
  /**
   * Get best provider for a task
   */
  static getBestProviderForTask(taskType: string): string | null {
    for (const [provider, capabilities] of this.capabilities.entries()) {
      if (capabilities.bestFor.includes(taskType)) {
        return provider;
      }
    }
    return 'openai'; // Default fallback
  }
  
  /**
   * Register new provider capabilities
   */
  static register(capabilities: ProviderCapabilities): void {
    this.capabilities.set(capabilities.provider, capabilities);
  }
  
  /**
   * Get all registered providers
   */
  static getAllProviders(): string[] {
    return Array.from(this.capabilities.keys());
  }
}

