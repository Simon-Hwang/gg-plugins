# Knowledge Locator Contract

Use three distinct layers:

```text
wiki/       human-maintained knowledge and Observe input
knowledge/  Agent-facing compiled publications
evidence/   Claims, Evidence, Verdicts, Findings, and publication records
```

The deterministic Agent route is:

```text
knowledge/registry.json
→ knowledge/domains/<domain-id>/manifest.json
→ Retrieval Card
→ overview / flow / topology / impact
→ Impact Index or Typed Topology
→ Claim / Evidence / code coordinate
```

Registry entries identify one stable Domain Manifest. A Domain Manifest points
to one current immutable Publication and its Context Pack. It must never point
to an awaiting, failed, or rolled-back Publication.

Coordinates are logical identifiers, not guessed file paths:

```text
knowledge://<domain-id>/<knowledge-id>@<publication-id>
claim://<claim-id>@<revision>
evidence://<evidence-id>
finding://<finding-id>
code://<repository>@<commit>/<path>#<symbol>
```

Knowledge Publication, Context Pack, Domain Manifest, Registry, optional Wiki
Gateway, and rollback metadata form one transaction. Only the manifest pointer
and Registry entry are mutable. Publication directories are immutable.

When Registry is missing or invalid, report `knowledge-registry-unavailable`,
fall back explicitly to Wiki plus the Evidence index, and do not perform an
unbounded fuzzy search.
