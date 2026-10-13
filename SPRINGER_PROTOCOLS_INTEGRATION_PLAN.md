# SpringerProtocols metadata integration

Date: 4 October 2026.

SpringerProtocols metadata joins the existing Protocol Library search beside DRM protocols and protocols.io. There is no second search page and no import of paywalled protocol text.

SpringerProtocols.com closed in 2018. The chapters remain on Springer Nature Link, mostly in the Methods in Molecular Biology series. DRM uses the Springer Nature Meta API for citation metadata and opens the publisher page for the full protocol.

## API

Official client: `springernature/springernature_api_client` Meta API.

| Need | Call |
|---|---|
| Search | `GET https://api.springernature.com/meta/v2/json` |
| One record | same endpoint with `q=doi:<doi>` |

Query parameters: `q`, `p` (page size, DRM uses 5), `s` (1-based start), `api_key`.

Authentication is the free-tier key from the Springer Nature developer portal. The official client sends it as the `api_key` query parameter. DRM reads `SPRINGER_NATURE_API_KEY` on the server only. The request URL and the axios error are never logged, because the key is in the query string. Redirects are not followed.

DRM does not call the Open Access full-text API or the TDM API.

The public docs do not publish a fixed daily number. The basic key has a portal quota, and HTTP 429 means the quota was hit. The official client treats a non-premium key as exhausted for paging once `s` passes 100. DRM stays under that:

- 5 records per search
- at most 4 pages (`s` stays at or below 16)
- 8 calls per minute in this process
- 120 calls per UTC day in this process
- one retry on 429 or 503
- after 429, this process stops calling Springer for one hour and serves cache only

## Allowed metadata

Stored and shown: title, authors, abstract when the Meta API provides one, publication date, DOI, series or journal name, publisher, subjects, publisher URL, Springer identifier, `source = springer_protocols`, `retrieved_at`.

Not requested or stored: protocol steps, figures, tables, body HTML, or any TDM payload. An abstract that already contains several numbered steps is dropped so a procedure is not saved under the abstract field.

License follows the Springer Nature API terms. Metadata may be cached and saved as a citation. The full protocol stays on the publisher site. DRM never offers Import Full Protocol for these records.

## Query and deduplication

A basic key cannot use fielded boolean queries such as `journal:`; those return 403. The search sent to Meta v2 is `"<terms>" protocol`. DRM then keeps records whose content type or title marks them as a protocol.

Records are deduplicated in this order: DOI, then Springer identifier, then normalized title + authors + year. Two records with different DOIs are both kept. A title match without authors and year is not merged.

## DRM files

- `server/services/protocols/springerNormalize.ts` — pure mapping, query, and dedupe. Tests import this file.
- `server/services/protocols/springerProtocols.ts` — key, timeout, retry, rate limit, cache, logging.
- `server/routes/springerProtocols.ts` — mounted at `/api/protocols/external/springer` before `/api/protocols/:id`.
- `pages/ProtocolsPageRefactored.tsx` and `components/ProtocolDetailView.tsx` — same search list, source label SpringerProtocols.
- `pages/ExperimentTrackerPage.tsx` — a method DOI can start an experiment as a citation, not as a local protocol.
- `components/ProtocolAIAssistant.tsx` — Springer metadata is labeled separately from open protocol text and from AI suggestions.
- Cache uses the existing `scholarly_cache` table. Search is kept 7 days. A single DOI record is kept 30 days. A user library save is not the cache.

Save Metadata writes a canonical `papers` row with `metadata_source = springer_protocols` and `full_text_available = false`, then adds it to the user's research library. No new table.

## Actions

Open Source opens the Springer Nature URL. Save Metadata stores the citation. Find Open Alternative searches DRM protocols and protocols.io only. Find Related Literature calls the existing Research Intelligence brief. Link to Experiment opens the current experiment form with the DOI in the notes.

## Tests

Unit tests map a fixture, drop procedure-like abstracts and full-text fields, keep two different DOIs, collapse a DOI duplicate, and return an empty result without calling Springer when the key is missing.
