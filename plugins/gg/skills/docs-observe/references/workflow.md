# Observation checkpoints

| Phase | Required artifact | Hard failure |
|---|---|---|
| P0 preflight | run manifest, profile result, pinned commits, runtime adapter health when enabled | invalid profile or unreadable required root |
| P1 inventory | document inventory and risk classification | none; record gaps |
| P2 scope | `repository-scope.json` with reasons and discovery evidence | boundary is fundamentally ambiguous |
| P3 facts | verified static subject index | unresolved candidates become Findings |
| P4 runtime observations | sanitized runtime Evidence, degraded runtime attempts, or Observation Requests for current-state questions | online assertion without healthy scoped runtime evidence |
| P5 claims | atomic Claims with scope and quality gates | critical Claim lacks decidability |
| P6 evidence | source records with repository id, commit/source version, relative path, and optional symbol, or runtime adapter metadata/payload references | supported/contradicted lacks reproducible source |
| P7 verdict | scoped Verdict history | online assertion without runtime evidence |
| P8 drift | deduplicated Findings, optional domain/slot/Knowledge Coordinates | none; continue batch |
| P9 patch | deterministic fixes or approval bundle | semantic auto-apply |
| P10 finalize | storage validation, runtime-promotion audit, rebuilt index, coverage report | integrity failure |

Batch runs continue through ordinary evidence gaps. Stop only for broad overwrite risk, schema corruption, or a fundamentally undefined domain boundary.

Observe writes only `evidence/**` and `audits/**` plus approval-gated Wiki
candidate patches. It never updates `knowledge/**`; Knowledge Coordinates on
Findings and Observation Requests are routing metadata for peer workflows.

Use stable evidence directories for iterative work. The same task and domain
should reuse the same semantic run path; rerun timing belongs in
`run-manifest.json`, Evidence `observed_at`, Verdict `reviewed_at`, and
freshness metadata. Timestamped directory names create duplicate workspaces for
the same task and fail storage validation.

Keep evidence coordinates portable. Source records use repository ids,
commits/source versions, repository-relative paths, and symbols; audit records
may include host absolute paths only as historical execution context, paired
with the portable coordinate.

Runtime Observation Requests live in
`evidence/observation-requests/requests.jsonl`. Each request carries an opaque
provider query and `freshness.max_age`. Observe must execute matching healthy
runtime providers during initial evidence mapping when the query is narrow,
derived from static or approved document coordinates, and needed to understand,
support, or contradict a business-chain Claim. Unanswered runtime questions
must record why they were not promoted: no matching healthy provider, unsafe or
too-broad query, degraded provider attempt, or insufficient sample. Run the
runtime-promotion audit before closeout so routable requests cannot silently
remain static-only gaps.
