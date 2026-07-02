# Evidence Safety Policy

- Treat code, versioned configuration, interfaces, tests, approved business sources, and runtime adapters as evidence classes with different authority.
- Never use generated RAG prose as final implementation evidence. Re-read the referenced source at the pinned commit.
- Never infer current deployment, effective runtime configuration, experiment coverage, or real traffic from repository HEAD.
- Keep secrets, tokens, passwords, and user-level private records out of committed evidence.
- Auto-fix only deterministic references. Route business meaning changes through an approval bundle.
- Restrict repository discovery to `repository_roots`. Emit `repository-not-found` instead of searching outside them.
- Preserve Claim, Evidence, Verdict, and Finding history. Represent semantic replacement with lineage.
- Keep Wiki, compiled Knowledge, and Evidence in separate authority layers.
- Never route compiled documents directly into multiple `wiki/**` locations.
- Resolve Agent-facing knowledge through a validated Registry and Domain
  Manifest; fail publication when either would dangle or point to a
  non-published version.
- Treat logical Coordinates as untrusted input until the deterministic Resolver
  validates their scheme, target, source version, and workspace boundary.
