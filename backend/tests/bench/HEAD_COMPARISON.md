# Comparing the solve speed of two commits

Measures the cold solve time of every shipped example case and the stress networks for two commits on the same
machine. Each checkout uses its own examples, so commits with different file formats can be compared.

## 1. Check out both commits side by side

From the repo root (example: old system against neutral ports):

```bash
git worktree add ../walflow-a main
git worktree add ../walflow-b feature/neutral-ports
```

Use the same Python environment for both (`pip install -r requirements-dev.txt`).

## 2. Time them, alternating

Close other heavy programs, keep the machine on mains power. Run each side several times in turn (A, B, B, A, A, B),
so drift in machine load hits both sides equally:

```bash
python ../walflow-a/backend/tests/bench/profile_solver.py time --repeats 5
python ../walflow-b/backend/tests/bench/profile_solver.py time --repeats 5
```

## 3. Read the result

- Compare the `total of bests` line: per side take the lowest total over its runs. Ratio B / A below 1 means B is
  faster.
- The spread between runs of the same side is the noise floor. A difference smaller than about 3x that spread is
  not a result.
- `inner`, `outer` and `prop` are the iteration counts per case. Different counts mean the two commits take a
  different path to the solution, so the time difference is not only overhead.

## 4. Clean up

```bash
git worktree remove ../walflow-a
git worktree remove ../walflow-b
```
