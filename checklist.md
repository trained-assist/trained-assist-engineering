# Checklist — Repository indexer v1 + `engineering_repo_context` + QA logs library (issue #11)

## Goal

Make repository context fast and reusable (deterministic index + `prefer_index` fallback +
`engineering_repo_context`) and give models a place to declare/rediscover "where the logs are"
(`qa_log_*`), all additive so the raw-repo fallback never regresses.

## Definition of done

- [x] CI green on https://github.com/trained-assist/trained-assist-engineering/pull/13
- [ ] Merged to main
- [ ] Deployed to prod — verified live

## Slices

- [x] Slice 1 — deterministic indexer v1 (`.engineering/index/`, build/check entry, stale/schema/repo fallback in `prepare_task`)
- [x] Slice 2 — `engineering_repo_context(keywords)` (index-first, raw fallback, ranked `{path,line,snippet,why}`)
- [x] Slice 3 — QA logs library (`qa_log_register` / `qa_log_lookup` / `qa_log_list`, per-profile, no raw secrets)
- [x] Tests: deterministic build, `prefer_index` true/false + stale fallback, ranked repo context, qa-log round-trip/isolation/schema, contract guards
- [x] `npm run check`, `npm test`, `npm run manifest:check`

## Non-goals (unchanged)

Embedding/vector index, nightly scheduler infra, credential binding, workspace-lifecycle changes. Raw fallback remains forever.
