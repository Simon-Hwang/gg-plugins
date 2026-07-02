const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repo = path.resolve(__dirname, "..");
const cli = path.join(repo, "plugins/gg/scripts/evidence_docs/cli.py");

function run(args, options = {}) {
  return spawnSync("python3", [cli, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function bundleFingerprint(bundle) {
  const hash = crypto.createHash("sha256");
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const relative = path.relative(bundle, file).split(path.sep).join("/");
      const stat = fs.statSync(file);
      if (stat.isDirectory()) visit(file);
      else if (!/^approval-decision\.(json|ya?ml)$/.test(relative)) {
        hash.update(relative);
        hash.update("\0");
        hash.update(fs.readFileSync(file));
        hash.update("\0");
      }
    }
  };
  visit(bundle);
  return `sha256:${hash.digest("hex")}`;
}

function createSynthesisFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-synthesis-"));
  const blueprint = path.join(root, "blueprint.json");
  writeJson(blueprint, {
    schema_version: "1",
    blueprint_id: "example-knowledge",
    domain_profile: "example-domain",
    scope: { domain: "example" },
    knowledge_slots: [
      { id: "purpose", required: true, accepted_fact_types: ["business-intent"] },
      { id: "topology", required: true, accepted_fact_types: ["implementation"] },
    ],
    documents: [
      {
        knowledge_id: "example-overview",
        template: "templates/overview.md",
        target_hint: "overview.md",
        consumes_slots: ["purpose", "topology"],
      },
    ],
    context_pack: {
      topology: "required",
      impact_index: "required",
      retrieval_cards: "required",
      gaps: "required",
    },
    policies: { minimum_slot_coverage: 1, allow_partial_synthesis: true },
  });
  return { root, blueprint };
}

function createPublicationFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-publication-"));
  const bundle = path.join(root, "bundle");
  fs.mkdirSync(path.join(bundle, "drafts"), { recursive: true });
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), "# Evidence-backed overview\n");
  writeJson(path.join(bundle, "context-pack/context-manifest.json"), {
    schema_version: "1",
    synthesis_id: "synthesis-1",
    knowledge_ids: ["example-overview"],
    claim_refs: ["claim-a@1"],
    subject_ids: ["subject-a"],
    repository_ids: ["repository-a"],
    evidence_ids: ["evidence-a"],
    slot_ids: ["purpose"],
    observation_request_ids: ["observation-a"],
    finding_ids: [],
    source_versions: [{ source: "repository-a", version: "commit-a", current: true }],
  });
  fs.writeFileSync(path.join(bundle, "context-pack/retrieval-cards.jsonl"),
    `${JSON.stringify({ retrieval_id: "retrieval-a", knowledge_ids: ["example-overview"], claim_refs: ["claim-a@1"], subject_ids: ["subject-a"], intents: ["understand example"], terms: ["example"], task_types: ["development"] })}\n`);
  fs.writeFileSync(path.join(bundle, "context-pack/topology.jsonl"),
    `${JSON.stringify({ edge_id: "edge-a", from: { type: "repository", id: "repository-a" }, to: { type: "service", id: "service-a" }, relation: "calls", claim_refs: ["claim-a@1"], evidence_refs: ["evidence-a"], source_versions: ["commit-a"], verification_status: "static-supported" })}\n`);
  fs.writeFileSync(path.join(bundle, "context-pack/impact-index.jsonl"),
    `${JSON.stringify({ impact_id: "impact-a", knowledge_id: "example-overview", slot_ids: ["purpose"], claim_refs: ["claim-a@1"], evidence_refs: ["evidence-a"], repository_ids: ["repository-a"], symbols: ["Example"] })}\n`);
  fs.writeFileSync(path.join(bundle, "context-pack/gaps.jsonl"),
    `${JSON.stringify({ gap_id: "gap-a", slot_id: "purpose", observation_request_id: "observation-a" })}\n`);
  fs.mkdirSync(path.join(bundle, "statements"), { recursive: true });
  const statement = "Evidence-backed overview.";
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), `# Overview\n\n${statement}\n`);
  fs.writeFileSync(path.join(bundle, "statements/example-overview.jsonl"),
    `${JSON.stringify({ statement_id: "statement-a", type: "fact", text: statement, text_hash: `sha256:${crypto.createHash("sha256").update(statement).digest("hex")}`, claim_refs: ["claim-a@1"] })}\n`);
  writeJson(path.join(bundle, "synthesis-manifest.json"), {
    schema_version: "1",
    synthesis_id: "synthesis-1",
    status: "awaiting-approval",
    verification_status: "verified-static",
    findings: [],
    freshness: {
      claim_revisions_current: true,
      source_versions_current: true,
    },
    artifacts: [
      {
        change_id: "create-overview",
        knowledge_id: "example-overview",
        change_type: "create",
        source: "drafts/overview.md",
        statements: "statements/example-overview.jsonl",
        target: "wiki/overview.md",
        base_hash: null,
      },
    ],
  });
  const policy = path.join(root, "policy.json");
  writeJson(policy, {
    schema_version: "1",
    policy_id: "example-policy",
    allowed_roots: ["wiki", "evidence/context-packs"],
    routes: [],
    required_approvals: ["business-owner"],
    allowed_verification_statuses: ["partial", "verified-static"],
    finding_gates: [],
    freshness_policy: {},
    index_targets: ["evidence/context-packs"],
    context_pack_route: { target: "evidence/context-packs/{synthesis_id}", mode: "copy" },
    rollback_policy: { require_after_hash_match: true, preserve_publication_record: true },
  });
  const approval = path.join(root, "approval.json");
  writeJson(approval, {
    schema_version: "1",
    approval_id: "approval-1",
    synthesis_id: "synthesis-1",
    bundle_hash: bundleFingerprint(bundle),
    status: "approved",
    approved_at: "2026-06-30T18:00:00+08:00",
    approvers: [{ role: "business-owner", identity: "owner" }],
    decisions: [{ change_id: "create-overview", decision: "approve" }],
    notes: [],
  });
  return { root, bundle, policy, approval };
}

function createKnowledgeFixture() {
  const { root, bundle } = createPublicationFixture();
  const publicationId = "publication-1";
  const domain = "example-domain";
  const domainRoot = path.join(root, "knowledge/domains", domain);
  const publicationRoot = path.join(domainRoot, "publications", publicationId);
  fs.mkdirSync(path.join(publicationRoot, "docs"), { recursive: true });
  fs.cpSync(path.join(bundle, "context-pack"), path.join(publicationRoot, "context"), {
    recursive: true,
  });
  fs.copyFileSync(path.join(bundle, "drafts/overview.md"),
    path.join(publicationRoot, "docs/overview.md"));
  writeJson(path.join(root,
    "evidence/publications", publicationId, "publication-manifest.json"), {
    schema_version: "1",
    publication_id: publicationId,
    synthesis_id: "synthesis-1",
    policy_id: "policy-1",
    approval_id: "approval-1",
    bundle_hash: "sha256:bundle",
    status: "published",
    artifacts: [],
  });
  const manifestPath = path.join(domainRoot, "manifest.json");
  writeJson(manifestPath, {
    schema_version: "1",
    domain_id: domain,
    current_publication_id: publicationId,
    publication_manifest:
      `evidence/publications/${publicationId}/publication-manifest.json`,
    verification_status: "verified-static",
    scope: { domain: "example" },
    knowledge: {
      overview: `publications/${publicationId}/docs/overview.md`,
    },
    context: {
      manifest: `publications/${publicationId}/context/context-manifest.json`,
      retrieval_cards:
        `publications/${publicationId}/context/retrieval-cards.jsonl`,
      topology: `publications/${publicationId}/context/topology.jsonl`,
      impact_index: `publications/${publicationId}/context/impact-index.jsonl`,
      gaps: `publications/${publicationId}/context/gaps.jsonl`,
    },
    source_versions: [],
    freshness: {},
    supersedes: null,
  });
  const manifestHash = `sha256:${crypto.createHash("sha256")
    .update(fs.readFileSync(manifestPath)).digest("hex")}`;
  writeJson(path.join(root, "knowledge/registry.json"), {
    schema_version: "1",
    domains: [{
      domain_id: domain,
      scope: { domain: "example" },
      manifest: `knowledge/domains/${domain}/manifest.json`,
      manifest_hash: manifestHash,
      intents: ["understand example", "example impact"],
      terms: ["example", "overview"],
      verification_status: "verified-static",
      updated_at: "2026-07-01T00:00:00Z",
    }],
  });
  fs.mkdirSync(path.join(root, "evidence/claims"), { recursive: true });
  fs.writeFileSync(path.join(root, "evidence/claims/claim-a.yaml"), [
    'schema_version: "1"',
    "id: claim-a",
    "revision: 1",
    "statement: Example fact",
    "fact_type: static-implementation",
    "risk: medium",
    "scope: {}",
    "source: {document: wiki/example.md, section: overview}",
    "status: active",
    "",
  ].join("\n"));
  return { root, domain, publicationId, manifestPath };
}

function createKnowledgePublicationFixture() {
  const fixture = createPublicationFixture();
  fixture.blueprint = path.join(fixture.root, "knowledge-blueprint.json");
  writeJson(fixture.blueprint, {
    schema_version: "1",
    blueprint_id: "example-knowledge",
    domain_id: "example-domain",
    domain_profile: "example-domain",
    scope: { domain: "example" },
    knowledge_slots: [
      { id: "purpose", required: true, accepted_fact_types: ["static-implementation"] },
    ],
    documents: [{
      knowledge_id: "example-overview",
      template: "templates/overview.md",
      target_hint: "docs/overview.md",
      required_sections: ["Overview"],
      consumes_slots: ["purpose"],
    }],
    context_pack: {
      topology: "required", impact_index: "required",
      retrieval_cards: "required", gaps: "required",
    },
    policies: { minimum_slot_coverage: 1, allow_partial_synthesis: true },
  });
  const manifestPath = path.join(fixture.bundle, "synthesis-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.domain_id = "example-domain";
  manifest.blueprint_id = "example-knowledge";
  manifest.publication_id = "publication-knowledge";
  manifest.scope = { domain: "example" };
  manifest.artifacts[0].target =
    "knowledge/domains/{domain_id}/publications/{publication_id}/docs/overview.md";
  writeJson(manifestPath, manifest);
  fs.writeFileSync(path.join(fixture.bundle, "approval-bundle.md"), [
    "# Approval Bundle — synthesis-1",
    "",
    "- create-overview",
    "",
  ].join("\n"));
  const policy = {
    schema_version: "1",
    policy_id: "example-knowledge-policy",
    domain_id: "example-domain",
    allowed_roots: ["knowledge", "wiki", "evidence/publications", "evidence/stages"],
    routes: [],
    knowledge_route: {
      target: "knowledge/domains/{domain_id}/publications/{publication_id}",
      immutable: true,
    },
    domain_manifest_route: {
      target: "knowledge/domains/{domain_id}/manifest.json",
    },
    registry_route: { target: "knowledge/registry.json" },
    gateway_route: {
      enabled: true,
      target: "wiki/example-knowledge.md",
      mode: "thin-link",
    },
    required_approvals: ["business-owner"],
    allowed_verification_statuses: ["verified-static"],
    finding_gates: [],
    freshness_policy: {},
    index_targets: ["knowledge/registry.json"],
    context_pack_route: {
      target: "knowledge/domains/{domain_id}/publications/{publication_id}/context",
      mode: "copy",
    },
    rollback_policy: {
      require_after_hash_match: true,
      preserve_publication_record: true,
    },
  };
  writeJson(fixture.policy, policy);
  fs.mkdirSync(path.join(fixture.root, "evidence/claims"), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, "evidence/claims/claim-a.yaml"), [
    'schema_version: "1"',
    "id: claim-a",
    "revision: 1",
    "statement: Example fact",
    "fact_type: static-implementation",
    "risk: medium",
    "scope: {}",
    "source: {document: wiki/example.md, section: overview}",
    "status: active",
    "",
  ].join("\n"));
  const approval = JSON.parse(fs.readFileSync(fixture.approval));
  approval.bundle_hash = bundleFingerprint(fixture.bundle);
  writeJson(fixture.approval, approval);
  return fixture;
}

test("profile validator accepts a bounded minimal profile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-profile-"));
  const profile = path.join(dir, "profile.yaml");
  fs.writeFileSync(profile, [
    'profile_version: "1"',
    "profile_id: example-domain",
    "document_roots: [wiki]",
    "repository_roots: [repos]",
    "finding_sink: audits",
    "",
  ].join("\n"));
  const result = run(["--profile", profile, "profile", "validate"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("claim validation rejects invalid supersession", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-claims-"));
  fs.mkdirSync(path.join(dir, "evidence/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "evidence/claims/claim.yaml"), [
    'schema_version: "1"',
    "id: claim-a",
    "revision: 1",
    "statement: A scoped fact",
    "fact_type: static-implementation",
    "risk: high",
    "scope: {}",
    "source: {document: wiki/a.md, section: behavior}",
    "status: superseded",
    "superseded_by: claim-missing",
    "",
  ].join("\n"));
  const result = run(["--root", dir, "claims", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /does not exist/);
});

test("index rebuild is deterministic and queryable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-index-"));
  fs.mkdirSync(path.join(dir, "evidence/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "evidence/claims/claim.yaml"), [
    'schema_version: "1"',
    "id: claim-timeout",
    "revision: 1",
    "statement: Request timeout defaults to 100ms",
    "fact_type: static-implementation",
    "risk: high",
    "scope: {environment: repository}",
    "source: {document: wiki/rules/request.md, section: timeout}",
    "status: active",
    "",
  ].join("\n"));
  let result = run(["--root", dir, "index", "rebuild"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--root", dir, "index", "validate"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--root", dir, "index", "query", "timeout"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).data.results[0].id, "claim-timeout");
});

test("fingerprint ignores JSON object key order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-evidence-hash-"));
  const first = path.join(dir, "a.json");
  const second = path.join(dir, "b.json");
  fs.writeFileSync(first, '{"a":1,"b":2}');
  fs.writeFileSync(second, '{"b":2,"a":1}');
  const a = JSON.parse(run(["fingerprint", first]).stdout).data.sha256;
  const b = JSON.parse(run(["fingerprint", second]).stdout).data.sha256;
  assert.equal(a, b);
});

test("installer exposes the evidence docs capability", () => {
  const modules = JSON.parse(fs.readFileSync(path.join(repo, "manifests/install-modules.json")));
  const components = JSON.parse(fs.readFileSync(path.join(repo, "manifests/install-components.json")));
  const module = modules.modules.find((entry) => entry.id === "skills-evidence-docs");
  const component = components.components.find((entry) => entry.id === "capability:evidence-docs");
  assert.deepEqual(module.paths, [
    "plugins/gg/skills/evidence-backed-docs",
    "plugins/gg/skills/docs-observe",
    "plugins/gg/skills/docs-synthesize",
    "plugins/gg/skills/docs-approve",
    "plugins/gg/skills/docs-publish",
    "plugins/gg/skills/docs-maintain",
  ]);
  assert.deepEqual(component.modules, ["skills-evidence-docs"]);
  const approveSkill = fs.readFileSync(path.join(
    repo, "plugins/gg/skills/docs-approve/SKILL.md",
  ), "utf8");
  assert.match(approveSkill, /\/gg:docs-approve/);
  assert.match(approveSkill, /Default to review-only/);
});

test("blueprint validation rejects unknown consumed slots", () => {
  const { blueprint } = createSynthesisFixture();
  const value = JSON.parse(fs.readFileSync(blueprint));
  value.documents[0].consumes_slots.push("missing-slot");
  writeJson(blueprint, value);
  const result = run(["--blueprint", blueprint, "blueprints", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /missing-slot/);
});

test("synthesis coverage emits observation requests for required gaps", () => {
  const { root, blueprint } = createSynthesisFixture();
  const facts = path.join(root, "facts.json");
  writeJson(facts, {
    slots: {
      purpose: { eligible_claims: [{
        claim_id: "claim-purpose",
        revision: 1,
        latest_revision: 1,
        status: "active",
        fact_type: "business-intent",
        verdict: "static-supported",
        scope_match: true,
        evidence_valid: true,
        evidence_reproducible: true,
      }] },
      topology: { eligible_claims: [] },
    },
  });
  const result = run([
    "--blueprint", blueprint,
    "synthesis", "coverage",
    "--facts", facts,
  ]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.data.coverage.required_covered, 1);
  assert.equal(output.data.coverage.required_total, 2);
  assert.equal(output.data.observation_requests[0].slot_id, "topology");
});

test("synthesis coverage rejects ineligible and constrains partial claims", () => {
  const { root, blueprint } = createSynthesisFixture();
  const facts = path.join(root, "facts.json");
  writeJson(facts, {
    slots: {
      purpose: { eligible_claims: [{
        claim_id: "claim-unknown", revision: 1, latest_revision: 1,
        status: "active", fact_type: "business-intent", verdict: "unknown",
        scope_match: true, evidence_valid: true, evidence_reproducible: true,
      }] },
      topology: { eligible_claims: [{
        claim_id: "claim-partial", revision: 1, latest_revision: 1,
        status: "active", fact_type: "implementation", verdict: "partial",
        scope_match: true, evidence_valid: true, evidence_reproducible: true,
      }] },
    },
  });
  const result = run(["--blueprint", blueprint, "synthesis", "coverage", "--facts", facts]);
  assert.equal(result.status, 2);
  const coverage = JSON.parse(result.stdout).data.coverage;
  assert.equal(coverage.required_covered, 0);
  assert.equal(coverage.required_constrained, 1);
  assert.equal(coverage.slots[0].rejected_claims[0].reasons[0], "verdict-not-eligible");
});

test("context pack rejects empty and dangling references", () => {
  const { bundle } = createPublicationFixture();
  fs.writeFileSync(path.join(bundle, "context-pack/retrieval-cards.jsonl"), "");
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /must not be empty/);
});

test("statement sidecar detects unsupported draft changes", () => {
  const { bundle } = createPublicationFixture();
  fs.appendFileSync(path.join(bundle, "drafts/overview.md"), "\nUnsupported statement.\n");
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /statement mapping/);
});

test("statement sidecar rejects factual claim markers disguised as examples", () => {
  const { bundle } = createPublicationFixture();
  const sidecar = path.join(bundle, "statements/example-overview.jsonl");
  const text = "Evidence-backed overview. [Claim: claim-a@1]";
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), `# Overview\n\n${text}\n`);
  fs.writeFileSync(sidecar, `${JSON.stringify({
    statement_id: "statement-a",
    type: "example",
    non_factual: true,
    text,
    text_hash: `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`,
    claim_refs: [],
  })}\n`);
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /example.*Claim|Claim.*example/);
});

test("synthesis rejects process state in business knowledge", () => {
  const { bundle } = createPublicationFixture();
  const text = "publication_allowed=true";
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), `# Overview\n\n${text}\n`);
  fs.writeFileSync(path.join(bundle, "statements/example-overview.jsonl"),
    `${JSON.stringify({ statement_id: "statement-a", type: "gap", text,
      text_hash: `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`,
      claim_refs: [] })}\n`);
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /process state/);
});

test("context pack requires retrieval and impact coverage for every knowledge id", () => {
  const { bundle } = createPublicationFixture();
  const manifest = JSON.parse(fs.readFileSync(
    path.join(bundle, "context-pack/context-manifest.json")));
  manifest.knowledge_ids.push("example-topology");
  writeJson(path.join(bundle, "context-pack/context-manifest.json"), manifest);
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /retrieval.*example-topology/);
  assert.match(result.stdout, /impact.*example-topology/);
});

test("typed topology rejects legacy repository-shaped edges", () => {
  const { bundle } = createPublicationFixture();
  fs.writeFileSync(path.join(bundle, "context-pack/topology.jsonl"),
    `${JSON.stringify({ edge_id: "edge-a", from_repository: "repository-a",
      to_repository: "topic-a", evidence_refs: ["evidence-a"],
      source_versions: ["commit-a"] })}\n`);
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /typed endpoint|from_repository/);
});

test("knowledge registry validates and locator resolves stable coordinates", () => {
  const { root, domain, publicationId } = createKnowledgeFixture();
  let result = run(["--root", root, "knowledge", "registry", "validate"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = run(["--root", root, "knowledge", "locate",
    "--intent", "example impact"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const located = JSON.parse(result.stdout).data.matches[0];
  assert.equal(located.domain_id, domain);
  assert.equal(located.knowledge_matches[0].knowledge_id, "example-overview");

  result = run(["--root", root, "knowledge", "resolve",
    `knowledge://${domain}/example-overview@${publicationId}`]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(JSON.parse(result.stdout).data.resolved.path, /docs\/overview\.md$/);

  result = run(["--root", root, "knowledge", "resolve", "claim://claim-a@1"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(JSON.parse(result.stdout).data.resolved.path, /claim-a\.yaml$/);

  result = run(["--root", root, "knowledge", "inspect", "--domain", domain]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).data.manifest.domain_id, domain);

  result = run(["--root", root, "knowledge", "validate", "--domain", domain]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("knowledge registry fails closed on a stale manifest hash", () => {
  const { root, manifestPath } = createKnowledgeFixture();
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.verification_status = "partial";
  writeJson(manifestPath, manifest);
  const result = run(["--root", root, "knowledge", "registry", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /manifest_hash/);
});

test("knowledge validate detects dangling context coordinates", () => {
  const { root, domain, publicationId } = createKnowledgeFixture();
  const context = path.join(root, "knowledge/domains", domain, "publications",
    publicationId, "context/retrieval-cards.jsonl");
  const card = JSON.parse(fs.readFileSync(context, "utf8").trim());
  card.coordinates = ["claim://missing@1"];
  fs.writeFileSync(context, `${JSON.stringify(card)}\n`);
  const result = run(["--root", root, "knowledge", "validate",
    "--domain", domain]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /claim:\/\/missing@1/);
});

test("publication policy rejects parent traversal roots", () => {
  const { policy } = createPublicationFixture();
  const value = JSON.parse(fs.readFileSync(policy));
  value.allowed_roots = ["../outside"];
  writeJson(policy, value);
  const result = run(["--policy", policy, "publication-policies", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /allowed_roots/);
});

test("publication plan requires matching bundle hash and approvals", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const value = JSON.parse(fs.readFileSync(approval));
  value.bundle_hash = "sha256:deadbeef";
  writeJson(approval, value);
  const result = run([
    "--root", root,
    "--policy", policy,
    "--bundle", bundle,
    "--approval", approval,
    "publications", "plan",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /bundle_hash/);
});

test("publication policy gates reject partial and critical findings", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const manifestPath = path.join(bundle, "synthesis-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.verification_status = "partial";
  manifest.findings = [{ finding_id: "finding-a", severity: "critical", status: "open" }];
  writeJson(manifestPath, manifest);
  const policyValue = JSON.parse(fs.readFileSync(policy));
  policyValue.allowed_verification_statuses = ["verified-static"];
  policyValue.finding_gates = [{ severity: "critical", block_statuses: ["open"] }];
  writeJson(policy, policyValue);
  const approvalValue = JSON.parse(fs.readFileSync(approval));
  approvalValue.bundle_hash = bundleFingerprint(bundle);
  writeJson(approval, approvalValue);
  const result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "plan"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /verification_status/);
  assert.match(result.stdout, /critical/);
});

test("publication freshness gate rejects stale source versions", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const manifestPath = path.join(bundle, "synthesis-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.freshness.source_versions_current = false;
  writeJson(manifestPath, manifest);
  const policyValue = JSON.parse(fs.readFileSync(policy));
  policyValue.freshness_policy = { require_source_version_match: true };
  writeJson(policy, policyValue);
  const approvalValue = JSON.parse(fs.readFileSync(approval));
  approvalValue.bundle_hash = bundleFingerprint(bundle);
  writeJson(approval, approvalValue);
  const result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "plan"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /source versions are stale/);
});

test("publication policy requires an explicit context pack route", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const value = JSON.parse(fs.readFileSync(policy));
  delete value.context_pack_route;
  writeJson(policy, value);
  const result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "plan"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /context_pack_route/);
});

test("publication apply cannot bypass stage and semantic review", () => {
  const { root } = createPublicationFixture();
  const result = run(["--root", root, "publications", "apply",
    "--publication-id", "publication-1"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--stage-id/);
});

test("unsupported change semantics fail closed", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const manifestPath = path.join(bundle, "synthesis-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.artifacts[0].change_type = "merge";
  writeJson(manifestPath, manifest);
  const approvalValue = JSON.parse(fs.readFileSync(approval));
  approvalValue.bundle_hash = bundleFingerprint(bundle);
  writeJson(approval, approvalValue);
  const result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "plan"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /not implemented safely/);
});

test("publication apply and rollback are deterministic", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  let result = run([
    "--root", root,
    "--policy", policy,
    "--bundle", bundle,
    "--approval", approval,
    "publications", "stage",
    "--stage-id", "stage-1",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stageManifest = JSON.parse(result.stdout).data.stage;
  const review = path.join(root, "review.json");
  writeJson(review, {
    schema_version: "1",
    stage_id: "stage-1",
    staged_tree_hash: stageManifest.staged_tree_hash,
    verdict: "pass",
    reviewer: "reviewer",
  });
  result = run(["--root", root, "publications", "review-record",
    "--stage-id", "stage-1", "--review-record", review]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--root", root, "publications", "apply",
    "--stage-id", "stage-1", "--publication-id", "publication-1"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(path.join(root, "wiki/overview.md"), "utf8"),
    "# Overview\n\nEvidence-backed overview.\n");
  assert.equal(fs.existsSync(path.join(
    root,
    "evidence/publications/publication-1/publication-manifest.json",
  )), true);
  assert.equal(fs.existsSync(path.join(
    root,
    "evidence/publications/publication-1/approval-decision.json",
  )), true);
  assert.equal(fs.existsSync(path.join(
    root,
    "evidence/publications/publication-1/publication-policy.json",
  )), true);

  result = run([
    "--root", root,
    "publications", "rollback",
    "--publication-id", "publication-1",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(root, "wiki/overview.md")), false);
});

test("knowledge publication atomically advances publication, manifest, registry, and gateway", () => {
  const { root, bundle, policy, approval, blueprint } = createKnowledgePublicationFixture();
  let result = run([
    "--root", root, "--policy", policy, "--bundle", bundle, "--blueprint", blueprint,
    "--approval", approval, "publications", "stage",
    "--stage-id", "stage-knowledge", "--publication-id", "publication-knowledge",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stageManifest = JSON.parse(result.stdout).data.stage;
  const review = path.join(root, "review-knowledge.json");
  writeJson(review, {
    schema_version: "1",
    stage_id: "stage-knowledge",
    staged_tree_hash: stageManifest.staged_tree_hash,
    verdict: "pass",
    reviewer: "reviewer",
  });
  result = run(["--root", root, "publications", "review-record",
    "--stage-id", "stage-knowledge", "--review-record", review]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--root", root, "publications", "apply",
    "--stage-id", "stage-knowledge", "--publication-id", "publication-knowledge"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(root,
    "knowledge/domains/example-domain/publications/publication-knowledge/docs/overview.md")), true);
  assert.equal(fs.existsSync(path.join(root,
    "knowledge/domains/example-domain/manifest.json")), true);
  assert.equal(fs.existsSync(path.join(root, "knowledge/registry.json")), true);
  assert.equal(fs.existsSync(path.join(root, "wiki/example-knowledge.md")), true);
  result = run(["--root", root, "knowledge", "validate", "--domain", "example-domain"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  result = run(["--root", root, "publications", "rollback",
    "--publication-id", "publication-knowledge"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(root, "knowledge/registry.json")), false);
  assert.equal(fs.existsSync(path.join(root, "wiki/example-knowledge.md")), false);
});

test("knowledge publication stage requires a stable publication id", () => {
  const { root, bundle, policy, approval, blueprint } = createKnowledgePublicationFixture();
  const result = run([
    "--root", root, "--policy", policy, "--bundle", bundle, "--blueprint", blueprint,
    "--approval", approval, "publications", "stage", "--stage-id", "stage-missing-id",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /publication-id/);
});

test("knowledge publication cannot rename a Coordinate-bound Bundle", () => {
  const { root, bundle, policy, approval, blueprint } =
    createKnowledgePublicationFixture();
  const result = run([
    "--root", root, "--policy", policy, "--bundle", bundle,
    "--blueprint", blueprint, "--approval", approval,
    "publications", "plan", "--publication-id", "different-publication",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /publication_id does not match/);
});

test("knowledge synthesis binds Blueprint sections and approval identity", () => {
  const { bundle, blueprint } = createKnowledgePublicationFixture();
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), "# Wrong heading\n");
  const result = run([
    "--bundle", bundle, "--blueprint", blueprint, "synthesis", "validate",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Blueprint required section missing: Overview/);
});

test("Blueprint-bound synthesis cannot validate without its Blueprint", () => {
  const { bundle } = createKnowledgePublicationFixture();
  const result = run(["--bundle", bundle, "synthesis", "validate"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /--blueprint is required/);
});

test("stage tree changes after semantic review block apply", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  let result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "stage", "--stage-id", "stage-tamper"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stageManifest = JSON.parse(result.stdout).data.stage;
  const review = path.join(root, "review-tamper.json");
  writeJson(review, {
    schema_version: "1", stage_id: "stage-tamper",
    staged_tree_hash: stageManifest.staged_tree_hash,
    verdict: "pass", reviewer: "reviewer",
  });
  result = run(["--root", root, "publications", "review-record",
    "--stage-id", "stage-tamper", "--review-record", review]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  fs.appendFileSync(path.join(root,
    "evidence/stages/stage-tamper/tree/wiki/overview.md"), "\nTampered.\n");
  result = run(["--root", root, "publications", "apply",
    "--stage-id", "stage-tamper", "--publication-id", "publication-tamper"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /staged tree hash mismatch/);
});

test("post-publish validation rolls back and preserves failed record", () => {
  const { root, bundle, policy, approval } = createPublicationFixture();
  const statement = "See [missing knowledge](missing.md).";
  fs.writeFileSync(path.join(bundle, "drafts/overview.md"), `# Overview\n\n${statement}\n`);
  fs.writeFileSync(path.join(bundle, "statements/example-overview.jsonl"),
    `${JSON.stringify({ statement_id: "statement-a", type: "fact", text: statement,
      text_hash: `sha256:${crypto.createHash("sha256").update(statement).digest("hex")}`,
      claim_refs: ["claim-a@1"] })}\n`);
  const approvalValue = JSON.parse(fs.readFileSync(approval));
  approvalValue.bundle_hash = bundleFingerprint(bundle);
  writeJson(approval, approvalValue);
  let result = run(["--root", root, "--policy", policy, "--bundle", bundle,
    "--approval", approval, "publications", "stage", "--stage-id", "stage-invalid"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stageManifest = JSON.parse(result.stdout).data.stage;
  const review = path.join(root, "review-invalid.json");
  writeJson(review, {
    schema_version: "1", stage_id: "stage-invalid",
    staged_tree_hash: stageManifest.staged_tree_hash,
    verdict: "pass", reviewer: "reviewer",
  });
  result = run(["--root", root, "publications", "review-record",
    "--stage-id", "stage-invalid", "--review-record", review]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = run(["--root", root, "publications", "apply",
    "--stage-id", "stage-invalid", "--publication-id", "publication-invalid"]);
  assert.equal(result.status, 2);
  assert.equal(fs.existsSync(path.join(root, "wiki/overview.md")), false);
  const record = JSON.parse(fs.readFileSync(path.join(root,
    "evidence/publications/publication-invalid/publication-manifest.json")));
  assert.equal(record.status, "validation-failed");
  assert.match(record.error, /broken markdown link/);
});

test("generic evidence assets contain no registered domain terms", () => {
  const roots = [
    "plugins/gg/skills/docs-synthesize",
    "plugins/gg/skills/docs-publish",
    "plugins/gg/commands/docs-synthesize.md",
    "plugins/gg/commands/docs-publish.md",
    "plugins/gg/agents/knowledge-architect.md",
    "plugins/gg/agents/evidence-knowledge-writer.md",
    "plugins/gg/agents/knowledge-synthesis-reviewer.md",
    "plugins/gg/agents/knowledge-publish-planner.md",
    "plugins/gg/agents/semantic-diff-reviewer.md",
    "plugins/gg/scripts/evidence_docs",
    "tests/evidence-docs.test.js",
  ];
  const forbidden = [
    new RegExp(`\\b${["car", "pool"].join("")}\\b`, "i"),
    new RegExp(`\\b${["dis", "patch"].join("")}\\b`, "i"),
    new RegExp(["顺", "风", "车"].join("")),
    new RegExp(["派", "单"].join("")),
  ];
  const files = [];
  const visit = (entry) => {
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry)) visit(path.join(entry, child));
    } else if (!entry.includes("__pycache__")) files.push(entry);
  };
  roots.map((entry) => path.join(repo, entry)).forEach(visit);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, file);
  }
});
