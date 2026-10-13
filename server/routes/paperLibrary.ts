/**
 * Paper Library API Routes
 * Exposes DOI Integration and paper fetching services
 * Implements Salman's vision: Auto-fetch papers, save full paper or AI summary
 */

import { Router } from 'express';
import pool from "../../database/config.js";
import { paperFetchingService } from '../services/doiIntegration.js';
import autoIndexing from '../utils/autoIndexing.js';

const router: Router = Router();

// ==============================================
// PAPER FETCHING & DOI INTEGRATION
// ==============================================

// Fetch paper by identifier (DOI, PMID, or arXiv ID)
router.post('/fetch', async (req: any, res) => {
  try {
    const { identifier } = req.body;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    console.log(`📚 Fetching paper: ${identifier}`);
    const paper = await paperFetchingService.fetchPaper(identifier);
    
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found or could not be fetched' });
    }

    res.json(paper);
  } catch (error: any) {
    console.error('Error fetching paper:', error);
    res.status(500).json({ error: 'Failed to fetch paper', details: error.message });
  }
});

// Fetch all papers by ORCID
router.post('/fetch-by-orcid', async (req: any, res) => {
  try {
    const { orcid } = req.body;
    
    if (!orcid) {
      return res.status(400).json({ error: 'ORCID is required' });
    }

    console.log(`📚 Fetching papers for ORCID: ${orcid}`);
    const papers = await paperFetchingService.fetchPapersByORCID(orcid);
    
    res.json({ count: papers.length, papers });
  } catch (error: any) {
    console.error('Error fetching papers by ORCID:', error);
    res.status(500).json({ error: 'Failed to fetch papers', details: error.message });
  }
});

// Search papers across all databases
router.post('/search', async (req: any, res) => {
  try {
    const { query, limit = 20 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`📚 Searching papers: ${query}`);
    const papers = await paperFetchingService.searchAcrossAll(query, limit);
    
    res.json({ count: papers.length, papers });
  } catch (error: any) {
    console.error('Error searching papers:', error);
    res.status(500).json({ error: 'Failed to search papers', details: error.message });
  }
});

// Generate AI summary for a paper
router.post('/generate-summary', async (req: any, res) => {
  try {
    const { paper } = req.body;
    
    if (!paper) {
      return res.status(400).json({ error: 'Paper data is required' });
    }

    console.log(`🤖 Generating AI summary for: ${paper.title}`);
    const summary = await (paperFetchingService as any).generateAISummary(paper);
    
    res.json({ summary });
  } catch (error: any) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary', details: error.message });
  }
});

// Extract key findings from paper
router.post('/extract-findings', async (req: any, res) => {
  try {
    const { paper } = req.body;
    
    if (!paper) {
      return res.status(400).json({ error: 'Paper data is required' });
    }

    console.log(`🔬 Extracting key findings from: ${paper.title}`);
    const findings = await (paperFetchingService as any).extractKeyFindings(paper);
    
    res.json({ findings });
  } catch (error: any) {
    console.error('Error extracting findings:', error);
    res.status(500).json({ error: 'Failed to extract findings', details: error.message });
  }
});

// ==============================================
// USER'S PAPER LIBRARY (SAVED PAPERS)
// ==============================================

// Create user_papers table if it doesn't exist
const ensurePapersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_papers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        doi TEXT,
        pmid TEXT,
        arxiv_id TEXT,
        title TEXT NOT NULL,
        authors JSONB,
        abstract TEXT,
        journal TEXT,
        year INTEGER,
        publication_date TEXT,
        url TEXT,
        pdf_url TEXT,
        citation_count INTEGER DEFAULT 0,
        keywords TEXT[],
        
        -- Salman's suggestion: Save full paper OR AI summary
        save_type VARCHAR(20) DEFAULT 'full', -- 'full', 'summary_only', 'both'
        ai_summary TEXT,
        ai_key_findings TEXT[],
        ai_methodology TEXT,
        relevance_to_my_work TEXT,
        relevance_score DECIMAL(5,2),
        
        -- User notes
        my_notes TEXT,
        tags TEXT[],
        is_favorite BOOLEAN DEFAULT FALSE,
        
        -- Organization
        folder VARCHAR(255),
        read_status VARCHAR(20) DEFAULT 'to_read', -- 'to_read', 'reading', 'read'
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(user_id, doi)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_papers_user ON user_papers(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_papers_doi ON user_papers(doi);
      CREATE INDEX IF NOT EXISTS idx_user_papers_year ON user_papers(year);
      CREATE INDEX IF NOT EXISTS idx_user_papers_favorite ON user_papers(is_favorite);
    `);
  } catch (error) {
    console.log('Paper table might already exist');
  }
};

// Initialize table on server start
ensurePapersTable();

// Get user's saved papers
router.get('/my-papers', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { folder, read_status, is_favorite, search } = req.query;
    
    let query = `SELECT * FROM user_papers WHERE user_id = $1`;
    const params: any[] = [userId];
    let paramCount = 2;
    
    if (folder) {
      query += ` AND folder = $${paramCount}`;
      params.push(folder);
      paramCount++;
    }
    
    if (read_status) {
      query += ` AND read_status = $${paramCount}`;
      params.push(read_status);
      paramCount++;
    }
    
    if (is_favorite === 'true') {
      query += ` AND is_favorite = true`;
    }
    
    if (search) {
      query += ` AND (title ILIKE $${paramCount} OR abstract ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching papers:', error);
    res.status(500).json({ error: 'Failed to fetch papers' });
  }
});

// Save a paper to library
router.post('/save-paper', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const {
      paper,
      save_type = 'full', // 'full', 'summary_only', 'both'
      ai_summary,
      ai_key_findings,
      my_notes,
      tags,
      folder
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO user_papers (
        user_id, doi, pmid, arxiv_id, title, authors, abstract,
        journal, year, publication_date, url, pdf_url, citation_count,
        keywords, save_type, ai_summary, ai_key_findings, my_notes,
        tags, folder
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (user_id, doi) DO UPDATE SET
        ai_summary = COALESCE($16, user_papers.ai_summary),
        ai_key_findings = COALESCE($17, user_papers.ai_key_findings),
        my_notes = COALESCE($18, user_papers.my_notes),
        tags = COALESCE($19, user_papers.tags),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      userId, paper.doi, paper.pmid, paper.arxivId, paper.title,
      JSON.stringify(paper.authors), paper.abstract, paper.journal,
      paper.year, paper.publicationDate, paper.url, paper.pdfUrl,
      paper.citationCount, paper.keywords, save_type, ai_summary,
      ai_key_findings, my_notes, tags, folder
    ]);
    
    const savedPaper = result.rows[0];
    
    // Auto-index for AI learning (non-blocking)
    autoIndexing.autoIndexContent(
      userId,
      'paper',
      savedPaper.id,
      savedPaper
    ).catch(err => console.error('Error auto-indexing paper:', err));
    
    res.json(savedPaper);
  } catch (error: any) {
    console.error('Error saving paper:', error);
    res.status(500).json({ error: 'Failed to save paper', details: error.message });
  }
});

// Delete a paper from library
router.delete('/my-papers/:paperId', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { paperId } = req.params;
    
    await pool.query(`
      DELETE FROM user_papers WHERE id = $1 AND user_id = $2
    `, [paperId, userId]);
    
    res.json({ message: 'Paper deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting paper:', error);
    res.status(500).json({ error: 'Failed to delete paper' });
  }
});

// Update paper notes/tags
router.put('/my-papers/:paperId', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { paperId } = req.params;
    const { my_notes, tags, is_favorite, read_status, folder } = req.body;
    
    const result = await pool.query(`
      UPDATE user_papers SET
        my_notes = COALESCE($1, my_notes),
        tags = COALESCE($2, tags),
        is_favorite = COALESCE($3, is_favorite),
        read_status = COALESCE($4, read_status),
        folder = COALESCE($5, folder),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [my_notes, tags, is_favorite, read_status, folder, paperId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating paper:', error);
    res.status(500).json({ error: 'Failed to update paper' });
  }
});

export default router;

