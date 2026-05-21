---
description: ML/PyTorch workflow — apply deep learning patterns, fix runtime/CUDA/training errors, write tests for ML code, and review PyTorch implementations.
argument-hint: "[training issue | model to implement | error message | --fix | --test | --review]"
---

# ML — Machine Learning & PyTorch Workflow

Covers the ML development cycle: pattern guidance → error resolution → testing → code review. Delegates to `pytorch-build-resolver`, `python-reviewer`, and `tdd-guide` agents.

**Input**: $ARGUMENTS

---

## Step 1 — Classify Task

From `$ARGUMENTS`, identify the task:

| Flag | Task | Primary Agent |
|------|------|---------------|
| `--fix` | Training crash, CUDA error, DataLoader error | `pytorch-build-resolver` |
| `--test` | Write tests for ML pipeline | `tdd-guide` |
| `--review` | Review model/training code | `python-reviewer` |
| (none) | Full cycle: patterns → fix if errors → review |

---

## Step 2 — Apply PyTorch Patterns

Apply `pytorch-patterns` skill as the baseline for all ML code:

### Model Architecture
```python
class MyModel(nn.Module):
    def __init__(self):
        super().__init__()
        # Define layers

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Define forward pass
        return x
```

**Best practices:**
- Always call `model.train()` before training, `model.eval()` before inference
- Use `with torch.no_grad():` for inference and validation to save memory
- Prefer `nn.Sequential` for simple linear stacks
- Use `torch.compile()` (PyTorch 2+) for performance
- Set `device = torch.device("cuda" if torch.cuda.is_available() else "cpu")`

### Training Loop
```python
for epoch in range(num_epochs):
    model.train()
    for batch in dataloader:
        optimizer.zero_grad()         # Clear gradients
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()               # Compute gradients
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)  # Clip
        optimizer.step()              # Update weights
```

### DataLoader
```python
dataset = MyDataset(...)
dataloader = DataLoader(
    dataset,
    batch_size=32,
    shuffle=True,
    num_workers=4,
    pin_memory=True,      # Faster GPU transfer
    persistent_workers=True,
)
```

### Reproducibility
```python
torch.manual_seed(42)
torch.cuda.manual_seed_all(42)
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
```

---

## Step 3 — Error Resolution (if --fix or errors detected)

Invoke `pytorch-build-resolver` agent.

Common error patterns and their fixes:

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `RuntimeError: Expected all tensors to be on the same device` | Tensor/model device mismatch | Move tensor: `x = x.to(device)` |
| `CUDA out of memory` | Batch too large, gradient accumulation | Reduce batch size; use `torch.cuda.empty_cache()` |
| `RuntimeError: Expected input batch_size (N) to match target batch_size (M)` | Shape mismatch | Check reshape/squeeze/unsqueeze |
| `ValueError: only one element tensors can be converted to scalars` | Using tensor where scalar expected | Call `.item()` on single-element tensor |
| `RuntimeError: one of the variables needed for gradient computation has been modified by an inplace operation` | In-place op on leaf | Use `x = x + ...` not `x += ...` |
| Gradient is None | Leaf tensor requires_grad=False | Set `requires_grad=True` on param |
| Slow DataLoader | num_workers=0 | Set `num_workers > 0` |
| NaN loss | Exploding gradients | Clip gradients; reduce learning rate |

Apply `python-patterns` skill for general Python quality (type hints, context managers, etc.).

---

## Step 4 — Testing ML Code (if --test)

Invoke `tdd-guide` agent.

Apply `python-testing` skill for pytest patterns.

ML testing strategies:
```python
# Test model output shape
def test_model_output_shape():
    model = MyModel()
    x = torch.randn(batch_size, in_features)
    output = model(x)
    assert output.shape == (batch_size, out_features)

# Test model can overfit a tiny dataset (sanity check)
def test_model_overfit_single_batch():
    model = MyModel()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    x, y = generate_tiny_dataset()
    for _ in range(100):
        loss = compute_loss(model, x, y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    assert loss.item() < 0.01  # Should overfit

# Test DataLoader produces correct shapes
def test_dataloader_shapes():
    loader = create_dataloader(batch_size=4)
    batch = next(iter(loader))
    assert batch["input"].shape == (4, ...)
    assert batch["label"].shape == (4,)

# Test reproducibility
def test_reproducibility():
    torch.manual_seed(42)
    output1 = model(x)
    torch.manual_seed(42)
    output2 = model(x)
    assert torch.allclose(output1, output2)
```

---

## Step 5 — Code Review (if --review)

Invoke `python-reviewer` agent for the ML code.

ML-specific review checklist:
- [ ] Model saved with `torch.save(model.state_dict())` not `torch.save(model)`
- [ ] Validation loop uses `model.eval()` and `torch.no_grad()`
- [ ] Loss function matches task type (CrossEntropyLoss for classification, MSELoss for regression)
- [ ] LR scheduler stepped at correct cadence (per epoch vs per batch)
- [ ] Checkpoint saves optimizer state alongside model state
- [ ] `DataLoader` uses `pin_memory=True` when using GPU
- [ ] No random ops outside seeded context
- [ ] Mixed precision training uses `torch.cuda.amp.autocast()` correctly

---

## Step 6 — Summary

```
ML Workflow Complete
─────────────────────────────────────────
Task:       fix | test | review | full
─────────────────────────────────────────
Errors fixed:     N (CUDA / shape / gradient / DataLoader)
Tests written:    N (shape / overfit / DataLoader / repro)
Review findings:  CRITICAL:N HIGH:N MEDIUM:N

Training status:  converging | NaN loss | OOM | not tested
─────────────────────────────────────────
Next: /gg:review for full Python code quality review
      /gg:tdd to add more Python unit tests
```

---

## Skills activated

- `pytorch-patterns` — model architecture, training loop, DataLoader, reproducibility
- `python-patterns` — Pythonic idioms, type hints, context managers
- `python-testing` — pytest patterns, fixture conventions, parametrize

## Agents invoked

- `pytorch-build-resolver` — CUDA, tensor, training runtime errors (--fix)
- `tdd-guide` — ML-aware test writing (--test)
- `python-reviewer` — Python code quality and ML best practices (--review)

## Related commands

- `/gg:tdd` — full TDD cycle for Python (broader than ML)
- `/gg:review` — comprehensive Python code review including security
- `/gg:diagnose` — profile training bottlenecks or memory growth
- `/gg:build-fix` — fix pip/dependency errors before ML errors
