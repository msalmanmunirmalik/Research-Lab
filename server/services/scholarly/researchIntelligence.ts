/**
 * Research intelligence brief. OpenAlex is fetched here; DRM grants are matched
 * on each request and are not written into the shared scholarly cache.
 */

import { cacheKey, getCached, setCached } from './cache.js';
import {
  assembleBrief,
  looksClinical,
  searchTerm,
  type GrantHit,
  type IntelligenceBrief,
} from './intelligenceBrief.js';
import { openAlexProvider } from './openalex.js';

type OpenAlexSlice = Omit<IntelligenceBrief, 'grants' | 'notice' | 'available'>;

function monthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

async function matchingGrants(term: string): Promise<GrantHit[]> {
  const cleaned = searchTerm(term);
  if (cleaned.length < 3) return [];
  try {
    const { default: pool } = await import('../../../database/config.js');
    const result = await pool.query(
      `SELECT id, title, sponsor, deadline_date
       FROM grants
       WHERE (status = 'open' OR status IS NULL OR status = '')
         AND (title LIKE $1 OR summary LIKE $1 OR programme LIKE $1 OR topic_identifier LIKE $1)
       ORDER BY deadline_date IS NULL, deadline_date ASC
       LIMIT 5`,
      [`%${cleaned}%`]
    );
    return (result.rows || []).map((row: any) => ({
      id: String(row.id),
      title: String(row.title || ''),
      sponsor: row.sponsor ? String(row.sponsor) : null,
      deadline: row.deadline_date ? String(row.deadline_date).slice(0, 10) : null,
    }));
  } catch {
    return [];
  }
}

async function openAlexSlice(query: string): Promise<OpenAlexSlice> {
  const retrievedAt = new Date().toISOString();
  const topicsResult = await openAlexProvider.searchTopics(query, 5);
  const topic = topicsResult.topics[0] || null;
  const clinicalWanted = looksClinical(query, topic?.domain);
  const fromDate = monthsAgo(24);

  const [years, people, institutions, funders, recent, datasets, clinical] = topic
    ? await Promise.all([
        openAlexProvider.topicYears(topic.id),
        openAlexProvider.topicResearchers(topic.id),
        openAlexProvider.topicInstitutionCounts(topic.id),
        openAlexProvider.topicFunders(topic.id),
        openAlexProvider.topicWorks({ topicId: topic.id, query, sort: 'publication_date:desc', fromDate, limit: 5 }),
        openAlexProvider.topicWorks({ topicId: topic.id, query, extraFilter: 'type:dataset', limit: 5 }),
        clinicalWanted
          ? openAlexProvider.topicWorks({
              topicId: topic.id,
              query,
              search: 'clinical trial',
              sort: 'cited_by_count:desc',
              limit: 5,
            })
          : Promise.resolve({ ok: true, works: [] as never[] }),
      ])
    : await Promise.all([
        Promise.resolve({ ok: topicsResult.ok, years: [] }),
        Promise.resolve({ ok: topicsResult.ok, people: [] }),
        Promise.resolve({ ok: topicsResult.ok, institutions: [] }),
        Promise.resolve({ ok: topicsResult.ok, funders: [] }),
        openAlexProvider.topicWorks({ query, sort: 'publication_date:desc', fromDate, limit: 5 }),
        openAlexProvider.topicWorks({ query, extraFilter: 'type:dataset', limit: 5 }),
        clinicalWanted
          ? openAlexProvider.topicWorks({ query: `${query} clinical trial`, sort: 'cited_by_count:desc', limit: 5 })
          : Promise.resolve({ ok: true, works: [] as never[] }),
      ]);

  const yearCeiling = new Date().getFullYear() + 1;
  const recentWorks = recent.works.filter((work) => work.year == null || work.year <= yearCeiling);
  const openAlexReached = [topicsResult, years, people, institutions, funders, recent, datasets].some((part) => part.ok);
  const brief = assembleBrief({
    query,
    retrievedAt,
    openAlexReached,
    topics: topicsResult.topics,
    trend: years.years,
    researchers: people.people,
    institutions: institutions.institutions,
    funders: funders.funders,
    grants: [],
    datasets: datasets.works,
    clinical: clinicalWanted ? clinical.works : null,
    recent: recentWorks,
  });
  const { grants: _grants, notice: _notice, available: _available, ...slice } = brief;
  return slice;
}

export class ResearchIntelligenceService {
  static async brief(query: string): Promise<IntelligenceBrief> {
    const trimmed = query.trim();
    const key = cacheKey(['intelligence', 'v3', trimmed.toLowerCase()]);
    let slice = await getCached<OpenAlexSlice>(key);
    if (!slice) {
      slice = await openAlexSlice(trimmed);
      if (slice.provenance.topicId || slice.recent.length || slice.datasets.length) {
        await setCached(key, slice);
      }
    }
    const grants = await matchingGrants(slice.topic?.name || trimmed);
    const available = Boolean(
      slice.topic || slice.recent.length || slice.datasets.length || slice.researchers.length
    );
    return {
      ...slice,
      available,
      notice: available
        ? null
        : 'OpenAlex did not return a brief for this topic. Literature search and the rest of DRM still work.',
      grants,
    };
  }
}
