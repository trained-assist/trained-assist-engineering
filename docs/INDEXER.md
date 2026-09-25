# Repository indexer — future design note

The indexer is intentionally **not** required by the first version of `prepare_task`.

## Goal

Precompute expensive/repetitive repository understanding so many coding sessions can reuse it.

## Expected outputs

```text
index/
  revision.json
  files.json
  modules.json
  symbols.json
  references.json
  dependencies.json
  tests.json
  architecture.json
  history-hotspots.json
```

## Build strategy

Start deterministic:
- git tree/file metadata;
- language parsers/LSP where available;
- imports/references;
- test naming/config relationships;
- git history.

Use a cheap model only for semantic annotations that deterministic tooling cannot provide reliably,
such as concise module responsibility summaries or ambiguity findings.

## Refresh

Nightly full consistency pass plus incremental update after merge is the likely steady state.

Every index must declare:
- repository identity;
- indexed revision;
- generated timestamp;
- schema version.

`prepare_task` must reject/fallback from an index that is incompatible or too stale for the requested
base revision.

## Contract

Indexing is an optimization, never a required correctness dependency.

Raw repository discovery remains the fallback forever.
