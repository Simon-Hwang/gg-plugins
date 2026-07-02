# Static observation checkpoints

| Phase | Required artifact | Hard failure |
|---|---|---|
| P0 preflight | run manifest, profile result, pinned commits | invalid profile or unreadable required root |
| P1 inventory | document inventory and risk classification | none; record gaps |
| P2 scope | `repository-scope.json` with reasons and discovery evidence | boundary is fundamentally ambiguous |
| P3 facts | verified static subject index | unresolved candidates become Findings |
| P4 claims | atomic Claims with scope and quality gates | critical Claim lacks decidability |
| P5 evidence | source records with commit/path | supported/contradicted lacks reproducible source |
| P6 verdict | scoped Verdict history | online assertion without runtime evidence |
| P7 drift | deduplicated Findings, optional domain/slot/Knowledge Coordinates | none; continue batch |
| P8 patch | deterministic fixes or approval bundle | semantic auto-apply |
| P9 finalize | rebuilt index, coverage report | integrity failure |

Batch runs continue through ordinary evidence gaps. Stop only for broad overwrite risk, schema corruption, or a fundamentally undefined domain boundary.

Observe writes only `evidence/**` and `audits/**` plus approval-gated Wiki
candidate patches. It never updates `knowledge/**`; Knowledge Coordinates on
Findings and Observation Requests are routing metadata for peer workflows.
