/**
 * RILOS evidence-chain deep links.
 * Idea → Protocol → Experiment → Notebook → Evidence → Analysis → Publication
 */

export type ChainIds = {
  protocolId?: string | null;
  experimentId?: string | null;
  notebookEntryId?: string | null;
  evidenceId?: string | null;
  title?: string | null;
  summary?: string | null;
};

function setIf(params: URLSearchParams, key: string, value?: string | null) {
  if (value) params.set(key, value);
}

/** Open experiment tracker prefilled from a protocol (or title/DOI). */
export function experimentFromProtocolUrl(ids: ChainIds & { methodDoi?: string; methodUrl?: string }): string {
  const params = new URLSearchParams({ startRun: '1' });
  setIf(params, 'protocolId', ids.protocolId);
  setIf(params, 'title', ids.title);
  setIf(params, 'methodDoi', ids.methodDoi);
  setIf(params, 'methodUrl', ids.methodUrl);
  const q = params.toString();
  return q ? `/experiment-tracker?${q}` : '/experiment-tracker';
}

/** Open notebook create flow linked to experiment/protocol. */
export function notebookFromExperimentUrl(ids: ChainIds): string {
  const params = new URLSearchParams({ create: 'experiment' });
  setIf(params, 'experimentId', ids.experimentId);
  setIf(params, 'protocolId', ids.protocolId);
  setIf(params, 'title', ids.title ? `Notebook: ${ids.title}` : null);
  return `/lab-notebook?${params.toString()}`;
}

/** Open evidence pack create linked to upstream records. */
export function evidenceFromRecordUrl(ids: ChainIds): string {
  const params = new URLSearchParams({ create: '1' });
  setIf(params, 'experimentId', ids.experimentId);
  setIf(params, 'protocolId', ids.protocolId);
  setIf(params, 'notebookEntryId', ids.notebookEntryId);
  setIf(params, 'title', ids.title);
  setIf(params, 'summary', ids.summary);
  return `/data-results?${params.toString()}`;
}

/**
 * Full-page result workspace.
 * Prefer experiment-scoped route when experimentId is known.
 */
export function resultWorkspaceUrl(ids: {
  resultId: string;
  experimentId?: string | null;
}): string {
  const resultId = encodeURIComponent(ids.resultId);
  if (ids.experimentId) {
    return `/experiments/${encodeURIComponent(ids.experimentId)}/results/${resultId}`;
  }
  return `/data-results/${resultId}`;
}

/** Open Writing Studio desk with a notice that evidence can be cited. */
export function writingFromEvidenceUrl(ids: ChainIds): string {
  const params = new URLSearchParams({ notice: 'evidence' });
  setIf(params, 'evidenceId', ids.evidenceId);
  setIf(params, 'title', ids.title);
  return `/writing-studio?${params.toString()}`;
}
