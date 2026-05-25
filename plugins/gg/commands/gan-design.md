---
description: Run a generator/evaluator design loop for frontend or visual work with bounded iterations and scoring.
---

Parse the following from $ARGUMENTS:
1. `brief` — the user's description of the design to create
2. `--max-iterations N` — (optional, default 10) maximum design-evaluate cycles
3. `--pass-threshold N` — (optional, default 7.5) weighted score to pass (higher default for design)

## GAN-Style Design Harness

A two-agent loop (Generator + Evaluator) focused on frontend design quality. No planner — the brief IS the spec.

This is the same mode Anthropic used for their frontend design experiments, where they saw creative breakthroughs like the 3D Dutch art museum with CSS perspective and doorway navigation.

### Setup
1. Create `gan-harness/` directory
2. Write the brief directly as `gan-harness/spec.md`
3. Write a design-focused `gan-harness/eval-rubric.md` with extra weight on Design Quality and Originality

### Design-Specific Eval Rubric
```markdown
### Design Quality (weight: 0.35)
### Originality (weight: 0.30)
### Craft (weight: 0.25)
### Functionality (weight: 0.10)
```

Note: Originality weight is higher (0.30 vs 0.20) to push for creative breakthroughs. Functionality weight is lower since design mode focuses on visual quality.

### Loop
Same as `/project:gan-build` Phase 2, but:
- Skip the planner
- Use the design-focused rubric
- Generator prompt emphasizes visual quality over feature completeness
- Evaluator prompt emphasizes "would this win a design award?" over "do all features work?"

### Key Difference from gan-build
The Generator is told: "Your PRIMARY goal is visual excellence. A stunning half-finished app beats a functional ugly one. Push for creative leaps — unusual layouts, custom animations, distinctive color work."

---

## gg Adaptation — Stack Constraint Recipes

The vanilla harness lets the Generator pick any stack (and it tends to default to React + Vite + Tailwind). When you need to keep the output **inside an existing stack**, append a `## Stack Constraints` block to `gan-harness/spec.md` *before* Phase 2 and raise its weight in `gan-harness/eval-rubric.md`.

### Recipe A — Jinja2 + HTMX, no JS framework

Append to `gan-harness/spec.md`:

```markdown
## Stack Constraints (HARD — violation = automatic FAIL)

- Templating: Jinja2 only. Output `.html` files into `templates/`, `_*.html` for partials.
- Interactivity: HTMX 1.9.x via `hx-get`, `hx-post`, `hx-trigger`, `hx-swap`, `hx-target` only.
- Allowed JS: zero npm packages; only inline `<script>` for ~10 lines of progressive enhancement, plus the HTMX script tag.
- Forbidden: React, Vue, Svelte, Alpine.js, jQuery, Tailwind CDN/CLI, any `<script type="module">`, any `import` statement, any build step.
- CSS: single hand-written stylesheet (e.g. `static/app.css`). May use CSS variables, `@media (prefers-reduced-motion: reduce)`, container queries. No CSS-in-JS, no PostCSS.
- Server: assume a Python web app already serves the templates; the Generator must NOT introduce Node, Vite, or any bundler.
- Accessibility floor: every interactive element must satisfy WCAG 2.2 AA (keyboard reachable, visible focus, ≥24×24 px target, semantic role).
```

Append to `gan-harness/eval-rubric.md`:

```markdown
### Stack Compliance (weight: 0.20)
- Score 0 if any forbidden dependency or build step is detected.
- Score 0 if any output file is `.jsx`, `.tsx`, `.vue`, or imports a JS framework.
- Otherwise score on idiomatic HTMX use (correct swap targets, no over-fetching, server-side partial returns).
```

Then rebalance the other weights so they sum to 1.0:

```markdown
### Design Quality (weight: 0.30)
### Originality (weight: 0.25)
### Craft (weight: 0.15)
### Functionality (weight: 0.10)
### Stack Compliance (weight: 0.20)
```

### Recipe B — Existing design system

If the project already has a token system (e.g. `static/app.css` with CSS variables), add to the spec:

```markdown
## Design System Constraints

- Reuse existing CSS variables from `<path/to/app.css>` (color, spacing, font-size, radius, motion).
- New tokens must be declared in the same file under `:root` and documented in `_components.md`.
- Do not introduce a second utility-class system.
```

### Recipe C — Server-rendered Flask/FastAPI/Django

Same as Recipe A, with one addition:

```markdown
- The Generator may produce a single `routes.py` (or equivalent) snippet to demonstrate the partial-return endpoints HTMX targets, but MUST NOT modify any other server file.
```

### Operator Checklist Before Phase 2

- [ ] `spec.md` has a `## Stack Constraints` block.
- [ ] `eval-rubric.md` has a `Stack Compliance` axis with weight ≥ 0.15.
- [ ] First iteration's evaluator feedback is scanned for any stack violation; if found, that iteration is hard-failed regardless of design score.
