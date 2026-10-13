# protocols.io integration plan

Date: 4 October 2026.

Public protocols.io protocols join the existing Protocol Library search. There is no second protocols page and no bulk import of the protocols.io catalog.

## What already exists

The live library is `pages/ProtocolsPageRefactored.tsx` at `/protocols` and `/protocols/:protocolId`. Cards open `components/ProtocolDetailView.tsx`. Create and edit use `POST` and `PUT /api/protocols` in `server/index.ts`.

The protocol row is `protocols` (`mysql_migration.sql`): `id`, `title`, `description`, `category`, `materials`, `content`, `safety_notes`, `tags`, `lab_id`, `privacy_level`, `author_id`, `version`, `forked_from`. Steps are usually stored in `content`. `protocol_steps` exists and is not what the library form writes.

List and read already enforce lab membership. An account admin is not a bypass. Search today calls `/api/protocol-search/semantic`, then filters the DRM list in the browser.

Experiments already accept `protocolId` and store `experiments.protocol_id`. `/experiment-tracker?protocolId=&title=` opens the create form with that link. Ask AI for a protocol is `components/ProtocolAIAssistant.tsx`, opened from the detail view.

## protocols.io endpoints

Official REST only. Origin `https://www.protocols.io`. Bearer client token. No website scraping. Redirects are not followed.

| Need | Method |
|---|---|
| Search public protocols | `GET /api/v3/protocols?filter=public&key=&order_field=relevance&page_size=&page_id=` |
| Detail, including steps and materials | `GET /api/v4/protocols/{id}?content_format=markdown` |

`{id}` is the numeric id or the public URI from search. Private, workspace, PDF, and write endpoints are not used.

## Token

`PROTOCOLS_IO_ACCESS_TOKEN` is read only in `server/services/protocols/protocolsIo.ts`. It is not sent to React, committed, or logged. `env.example` keeps an empty line. If the variable is missing, search still returns DRM protocols and a short notice. Login and the rest of DRM keep working.

## Schema

New table `external_protocols`: one saved public protocol per user and external id. It stores the normalized fields, `source = protocols.io`, original URL, DOI, license `CC-BY`, version, and `retrieved_at`. Saving does not insert a DRM-authored `protocols` row.

New nullable columns on `protocols`, used only by Adapt for My Lab: `source_name`, `source_url`, `source_doi`, `source_license`, `source_attribution`, `adapted_from_external_id`. The adaptation is a new row owned by the signed-in user. It does not update `external_protocols` or the protocols.io record.

Search and detail responses are cached in the existing `scholarly_cache` (key hash, payload, expiry). The payload includes `retrievedAt` and `source`. Grant-style user rows are not placed in that cache. Saved external rows are read per user.

## Files

- `server/services/protocols/protocolsIoNormalize.ts` — mapping only. Tests import this file.
- `server/services/protocols/protocolsIo.ts` — auth header, search, detail, pagination, timeout, one retry on 429, in-process rate limit, cache.
- `server/routes/protocolsExternal.ts` — mounted at `/api/protocols/external` before `/api/protocols/:id`.
- `database/migrations/mysql_protocols_io.sql` and the same file under `directadmin-package/database/migrations/`.
- `pages/ProtocolsPageRefactored.tsx` and `components/ProtocolDetailView.tsx` — one result list, source label, save, adapt, use in experiment.
- `components/ExperimentDetailView.tsx` — a short public-protocol suggestion from the experiment title.
- `components/ProtocolAIAssistant.tsx` — suggestions labeled as AI, separate from original protocols.io text and from a DRM adaptation.

## Attribution

Public protocols.io content is stored and shown as CC-BY. Every external card and every adaptation keeps authors, DOI, original URL, version, license, and retrieval time. The adaptation text says it may differ from the original. DRM does not copy the protocols.io database; a row is stored only when that user saves or adapts it.

## Experiment link

Use in Experiment adapts first when the open record is still external, then opens the existing experiment form with `protocolId` set to the new DRM protocol. The chain is external record, DRM adaptation, experiment. Notebook and evidence stay on the experiment the user already runs.

## Tests

Unit tests normalize a fixture payload, keep CC-BY and the original URL, and treat a missing token as an empty external result. They do not call protocols.io.

## Status

Implemented in the existing library. `mysql_protocols_io.sql` is applied on the local database. Search at `/protocols` asks DRM and `/api/protocols/external/search` together and labels each card. Save, adapt, and use-in-experiment are on the protocol detail. A missing `PROTOCOLS_IO_ACCESS_TOKEN` leaves DRM search working and shows “protocols.io is not configured.” The token was not present during the browser check, so live protocols.io results were not loaded.
