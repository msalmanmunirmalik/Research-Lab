/**
 * Paper Finding Agent
 * Task 59: Autonomous paper search, filtering, and relevance ranking
 * 
 * Searches for academic papers based on user queries, filters results,
 * and ranks them by relevance to the user's research context.
 */

import { BaseAgent, Agent, AgentConfig, AgentResult, AgentContext } from '../Agent.js';
import { TaskAnalysis } from '../TaskAnalysisEngine.js';
import { UserContext } from '../UserContextRetriever.js';
import { getApiForTask } from '../../routes/apiTaskAssignments.js';
import { getUserApiKey } from '../../routes/aiProviderKeys.js';
import { openAlexProvider } from '../scholarly/openalex.js';

export interface PaperFindingInput {
  query: string;
  topic?: string;
  field?: string;
  yearRange?: { start?: number; end?: number };
  maxResults?: number;
  filters?: {
    journals?: string[];
    authors?: string[];
    keywords?: string[];
  };
}

export interface PaperResult {
  title: string;
  authors: string[];
  abstract: string;
  journal?: string;
  year?: number;
  doi?: string;
  url?: string;
  relevanceScore: number;
  keyFindings: string[];
  citations?: number;
}

export class PaperFindingAgent extends BaseAgent implements Agent {
  readonly agentType = 'paper_finding';
  readonly agentName = 'Paper Finding Agent';
  readonly description = 'Searches for and ranks academic papers based on relevance to research queries';
  
  getRequiredContext(): string[] {
    return ['papers']; // Can use user's existing papers for context
  }
  
  validateInput(input: any): boolean {
    if (!input || typeof input !== 'object') return false;
    const query = String(input.query || input.topic || '').trim();
    return query.length > 0;
  }
  
  async execute(
    input: PaperFindingInput,
    context?: AgentContext,
    config?: AgentConfig
  ): Promise<AgentResult> {
    try {
      if (!this.validateInput(input)) {
        return {
          success: false,
          content: null,
          error: 'Invalid input: query is required and must be a non-empty string'
        };
      }

      const openAlexQuery = String(input.query || input.topic || '').trim();
      const yearRange = input.yearRange || (input as { filters?: { yearRange?: { start?: number; end?: number } } }).filters?.yearRange;
      const openAlexPapers = await openAlexProvider
        .search({
          query: openAlexQuery,
          limit: input.maxResults || 10,
          yearFrom: yearRange?.start,
          yearTo: yearRange?.end,
          sort: 'relevance',
        })
        .catch(() => []);
      if (openAlexPapers.length) {
        return {
          success: true,
          content: {
            query: openAlexQuery,
            source: 'openalex',
            papers: openAlexPapers.map((paper) => ({
              id: paper.openalexId || paper.doi || paper.title,
              title: paper.title,
              authors: paper.authors.map((author) => author.name),
              abstract: paper.abstract || '',
              journal: paper.journalName || undefined,
              year: paper.publicationYear || undefined,
              doi: paper.doi || undefined,
              url: paper.doi ? `https://doi.org/${paper.doi}` : paper.sourceUrl || undefined,
              relevanceScore: 1,
              keyFindings: [],
              citations: paper.citationCount || 0,
            })),
            totalFound: openAlexPapers.length,
          },
          metadata: { provider: 'openalex', query: openAlexQuery },
        };
      }
      
      // Get user ID from context
      const userId = context?.additionalData?.userId;
      if (!userId) {
        return {
          success: false,
          content: null,
          error: 'User ID is required in context'
        };
      }
      
      // Initialize provider
      const provider = config?.provider || await this.getProviderForTask(userId);
      const apiKey = await getUserApiKey(userId, provider);
      
      if (!apiKey) {
        return {
          success: false,
          content: null,
          error: `No API key found for provider: ${provider}`
        };
      }
      
      await this.initializeProvider(provider, apiKey);
      
      // Build search query
      const searchQuery = this.buildSearchQuery(input);
      
      // Build prompt for paper finding
      const systemPrompt = this.buildSystemPrompt(
        { taskType: this.agentType } as TaskAnalysis,
        context?.userContext
      );
      
      const userPrompt = this.buildPaperFindingPrompt(searchQuery, input, context?.userContext);
      
      // Call AI provider
      const startTime = Date.now();
      const response = await this.getProvider().chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        apiKey: apiKey,
        temperature: 0.3, // Lower temperature for more factual results
        maxTokens: config?.maxTokens || 3000
      });
      
      const duration = Date.now() - startTime;
      
      // Parse response into structured paper results
      const papers = this.parsePaperResults(response.content, input.maxResults || 10);
      
      return {
        success: true,
        content: {
          query: input.query,
          papers,
          totalFound: papers.length
        },
        metadata: {
          provider,
          tokensUsed: response.usage?.totalTokens,
          duration,
          query: input.query
        }
      };
    } catch (error: any) {
      return this.handleError(error, 'paper finding');
    }
  }
  
  /**
   * Build optimized search query
   */
  private buildSearchQuery(input: PaperFindingInput): string {
    let query = input.query;
    
    if (input.topic) {
      query = `${query} ${input.topic}`;
    }
    
    if (input.field) {
      query = `${query} field:${input.field}`;
    }
    
    if (input.yearRange) {
      if (input.yearRange.start) {
        query = `${query} after:${input.yearRange.start}`;
      }
      if (input.yearRange.end) {
        query = `${query} before:${input.yearRange.end}`;
      }
    }
    
    return query.trim();
  }
  
  /**
   * Build prompt for paper finding
   */
  private buildPaperFindingPrompt(
    query: string,
    input: PaperFindingInput,
    userContext?: UserContext
  ): string {
    let prompt = `Find and analyze academic papers related to: "${query}"\n\n`;
    
    if (input.filters) {
      prompt += 'Filters:\n';
      if (input.filters.journals) {
        prompt += `- Journals: ${input.filters.journals.join(', ')}\n`;
      }
      if (input.filters.authors) {
        prompt += `- Authors: ${input.filters.authors.join(', ')}\n`;
      }
      if (input.filters.keywords) {
        prompt += `- Keywords: ${input.filters.keywords.join(', ')}\n`;
      }
      prompt += '\n';
    }
    
    prompt += `Please provide ${input.maxResults || 10} relevant papers with:\n`;
    prompt += `1. Title\n`;
    prompt += `2. Authors\n`;
    prompt += `3. Abstract (brief summary)\n`;
    prompt += `4. Journal/Conference\n`;
    prompt += `5. Year\n`;
    prompt += `6. Relevance score (0-1) and why it's relevant\n`;
    prompt += `7. Key findings\n`;
    prompt += `8. DOI or URL if available\n\n`;
    
    if (userContext?.user?.research_interests) {
      prompt += `User's research interests: ${userContext.user.research_interests.join(', ')}\n`;
      prompt += `Prioritize papers that align with these interests.\n`;
    }
    
    prompt += `Format the response as a structured list, one paper per entry.`;
    
    return prompt;
  }
  
  /**
   * Parse AI response into structured paper results
   */
  private parsePaperResults(response: string, maxResults: number): PaperResult[] {
    const papers: PaperResult[] = [];
    
    // Try to parse structured response
    // Look for numbered lists or structured format
    const paperMatches = response.match(/(?:^|\n)(?:\d+\.|[-*])\s*(.+?)(?=\n(?:\d+\.|[-*])|$)/gs);
    
    if (paperMatches) {
      for (let i = 0; i < Math.min(paperMatches.length, maxResults); i++) {
        const match = paperMatches[i];
        const paper = this.parsePaperEntry(match);
        if (paper) {
          papers.push(paper);
        }
      }
    } else {
      // Fallback: try to extract papers from unstructured text
      const lines = response.split('\n').filter(line => line.trim().length > 0);
      let currentPaper: Partial<PaperResult> | null = null;
      
      for (const line of lines) {
        if (line.match(/^(title|paper|publication):/i)) {
          if (currentPaper) papers.push(currentPaper as PaperResult);
          currentPaper = { title: line.replace(/^[^:]+:\s*/i, '').trim() };
        } else if (line.match(/^(authors?|author list):/i) && currentPaper) {
          currentPaper.authors = line.replace(/^[^:]+:\s*/i, '').split(',').map(a => a.trim());
        } else if (line.match(/^(abstract|summary):/i) && currentPaper) {
          currentPaper.abstract = line.replace(/^[^:]+:\s*/i, '').trim();
        } else if (line.match(/^(journal|conference|venue):/i) && currentPaper) {
          currentPaper.journal = line.replace(/^[^:]+:\s*/i, '').trim();
        } else if (line.match(/^(year|publication year):/i) && currentPaper) {
          const yearMatch = line.match(/\d{4}/);
          if (yearMatch) currentPaper.year = parseInt(yearMatch[0]);
        } else if (line.match(/^(doi|url|link):/i) && currentPaper) {
          currentPaper.url = line.replace(/^[^:]+:\s*/i, '').trim();
        } else if (line.match(/^(relevance|score):/i) && currentPaper) {
          const scoreMatch = line.match(/(\d+\.?\d*)/);
          if (scoreMatch) currentPaper.relevanceScore = parseFloat(scoreMatch[1]);
        }
      }
      
      if (currentPaper) {
        papers.push(currentPaper as PaperResult);
      }
    }
    
    // Ensure all papers have required fields
    return papers
      .map(paper => ({
        title: paper.title || 'Untitled',
        authors: paper.authors || [],
        abstract: paper.abstract || '',
        journal: paper.journal,
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        relevanceScore: paper.relevanceScore || 0.5,
        keyFindings: paper.keyFindings || [],
        citations: paper.citations
      }))
      .slice(0, maxResults);
  }
  
  /**
   * Parse individual paper entry
   */
  private parsePaperEntry(entry: string): PaperResult | null {
    const titleMatch = entry.match(/title[:\s]+(.+?)(?:\n|$)/i);
    const authorsMatch = entry.match(/authors?[:\s]+(.+?)(?:\n|$)/i);
    const abstractMatch = entry.match(/abstract[:\s]+(.+?)(?:\n|$)/i);
    const journalMatch = entry.match(/(?:journal|conference|venue)[:\s]+(.+?)(?:\n|$)/i);
    const yearMatch = entry.match(/year[:\s]+(\d{4})/i);
    const relevanceMatch = entry.match(/relevance[:\s]+(\d+\.?\d*)/i);
    
    if (!titleMatch) return null;
    
    return {
      title: titleMatch[1].trim(),
      authors: authorsMatch ? authorsMatch[1].split(',').map(a => a.trim()) : [],
      abstract: abstractMatch ? abstractMatch[1].trim() : '',
      journal: journalMatch ? journalMatch[1].trim() : undefined,
      year: yearMatch ? parseInt(yearMatch[1]) : undefined,
      relevanceScore: relevanceMatch ? parseFloat(relevanceMatch[1]) : 0.5,
      keyFindings: []
    };
  }
  
  /**
   * Get provider for paper finding task
   */
  private async getProviderForTask(userId: string): Promise<string> {
    const assignment = await getApiForTask(userId, 'paper_finding');
    return assignment?.provider || 'perplexity'; // Perplexity is best for research/search
  }
}

