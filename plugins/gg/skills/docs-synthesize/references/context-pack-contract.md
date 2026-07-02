# Agent Context Pack Contract

Require:

```text
context-pack/
├── context-manifest.json
├── retrieval-cards.jsonl
├── topology.jsonl
├── impact-index.jsonl
└── gaps.jsonl
```

Retrieval cards route Agent intent and terms to knowledge, Claims, subjects, repositories, symbols, verified source versions, and verification status.

Every Knowledge ID must be routed by at least one Retrieval Card. Cards must
cover relevant Chinese and English terminology plus concrete development task
types. A configured golden task set must achieve Domain Top-1 `100%` and
Knowledge Top-3 at least `95%`.

Topology uses typed nodes:

```text
repository | service | rpc | http | topic | storage | config |
experiment | external-interface | business-stage
```

Every edge must use legal node and relation types, cite Claim/Evidence and
source versions, and keep `repository_ids` limited to actual repositories.
Generated diagrams are views; typed JSONL is authoritative.

Impact entries must preserve:

```text
Knowledge Slot → Knowledge Document → Claim → Evidence → Repository → Path/Symbol/Contract
```

Gaps are first-class. Record missing Claims, repositories, edges, runtime evidence, and disputes so consumers do not interpret absence as non-existence.

Map each Gap to its real Blueprint slot. Do not collapse authority, runtime,
contract, ownership, or repository-resolution gaps into a topology slot.

Required JSONL files must not be empty. Validate all Knowledge, Claim, Subject,
Repository, Evidence, source-version, slot, Observation Request, and Finding
references against the Context Manifest and synthesis ledger.

Require:

- Retrieval Card coverage for every Knowledge ID;
- document or Gap coverage for every Blueprint slot;
- Impact Index coverage across Blueprint-declared target documents rather than
  concentration in one document;
- zero dangling logical Coordinates;
- cross-document verification and authority consistency.
