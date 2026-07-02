# Approval Policy

An Approval Decision must bind:

- `synthesis_id`;
- exact Bundle hash;
- approval identity and time;
- Policy-required approver roles;
- one decision for every semantic `change_id`.

Approval is invalid when the Bundle changes after review. Context Pack copies derived from the approved Bundle do not require separate semantic change IDs, but must match the same Bundle hash.

Never use a force flag to bypass approval, stale evidence, target routing, or base-hash gates.

Approval covers the semantic Knowledge artifacts. Deterministically derived
Context, Domain Manifest, Registry, and Gateway changes must match the approved
Bundle and Policy exactly and are reviewed in Stage; they cannot introduce new
business meaning.
