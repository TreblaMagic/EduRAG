# EduRAG — optional Python causal worker

This worker is **optional**. The EduRAG application runs fully with the
TypeScript baseline engine and never requires Python to be installed.

Install this worker only if you want to:

- Run DoWhy-based backdoor estimation alongside the baseline OLS.
- Run causal discovery via `causal-learn`'s PC algorithm to compare a
  data-driven DAG against the manually-encoded one.

## Setup

```bash
# From the repository root.
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r python/causal-worker/requirements.txt
```

That's it. The TypeScript side probes for `python` (then `python3`) on PATH
the first time you select the advanced engine; if the probe succeeds the
worker is spawned per request as `python python/causal-worker/worker.py`.

## Verifying the install

```bash
echo '{"cmd":"ping","payload":{}}' | python python/causal-worker/worker.py
```

Expected output (single-line JSON):

```json
{"ok":true,"result":{"pong":true,"deps":{"numpy":true,"pandas":true,"dowhy":true,"causallearn":true,"sklearn":true,"networkx":true}},"warnings":[]}
```

## Protocol

stdin → JSON envelope `{ "cmd": ..., "payload": ... }`
stdout → JSON envelope `{ "ok": bool, "result"?: ..., "error"?: "...", "warnings": [...] }`

Supported `cmd` values:

| cmd        | purpose                                    | payload keys                                                                  |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `ping`     | Capability probe.                          | (none)                                                                        |
| `estimate` | DoWhy backdoor estimate of `β_T`.          | `treatment`, `outcome`, `adjustmentSet`, `rows`, `bootstrapIters`, `ciLevel`, `seed` |
| `discover` | `causal-learn` PC discovery.               | `nodes`, `rows`, `alpha`, `seed`                                              |

Every payload is self-contained — the worker holds no state between calls.

## Graceful degradation

| Missing piece          | What happens                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `python` not installed | `selectEngine("advanced")` falls back to the baseline engine with a warning.                       |
| `dowhy` not installed  | `estimate` falls back to a numpy backdoor-OLS implementation and emits a warning.                  |
| `causal-learn` missing | `discover` returns an error; the TS side surfaces it and shows only the manual DAG.                |
| Worker crash / timeout | The subprocess client throws; the orchestrator falls back to the baseline engine + warning banner. |

## Performance

The worker is a one-shot subprocess. Spawn cost is ~30-150 ms (warm vs.
cold-start on Windows). A typical DoWhy fit + 500 bootstrap iterations on
the demo dataset finishes in well under 5 seconds. Larger cohorts may need
the `bootstrapIters` knob.

## File map

```
python/causal-worker/
├── README.md          ← this file
├── requirements.txt   ← pinned-floor dependencies
└── worker.py          ← single-file JSON-in/JSON-out worker
```

No server, no Docker, no RPC framework. If you outgrow this, swap the
subprocess client in `src/features/causal-engine/engine/advanced-engine.ts`
for an HTTP client — every contract is identical.
