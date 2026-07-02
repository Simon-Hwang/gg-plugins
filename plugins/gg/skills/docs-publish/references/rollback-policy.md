# Rollback Policy

Before Apply, capture target existence and hashes. Store before/after snapshots and a Rollback Manifest.

Rollback only when each current target hash equals the recorded after hash. If a target changed after publication, stop before modifying any target and report a rollback conflict.

Restore previous content for replaced targets and remove targets created by the publication. Keep the Publication Record and mark it `rolled-back`.

Rollback covers Knowledge Publication files, Context Pack, Domain Manifest,
Global Registry, and optional Gateway as one unit. Restore the prior Manifest
pointer and Registry entry only when their current hashes equal the recorded
after hashes. Immutable Publication history and the failed/rolled-back
Publication Record remain available for audit but must not be current.
