#!/usr/bin/env python3
"""EduRAG — optional advanced causal worker.

JSON in (stdin) / JSON out (stdout). Spawned one-shot by the TypeScript
`advancedEngine`. No state is kept between invocations.

Protocol
--------
Input:
    {"cmd": "estimate" | "discover" | "ping", "payload": {...}}

Output:
    {"ok": true,  "result": {...}, "warnings": [...]}
    {"ok": false, "error":  "human-readable message"}

The worker degrades cleanly when optional libraries (dowhy, causal-learn)
are not installed — the TypeScript caller will fall back to the baseline
engine and surface a warning.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Dict, List


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        _emit_error("empty stdin payload")
        return
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        _emit_error(f"invalid JSON envelope: {exc}")
        return
    cmd = envelope.get("cmd")
    payload = envelope.get("payload") or {}
    try:
        if cmd == "ping":
            _emit_ok({"pong": True, "deps": _detect_deps()})
        elif cmd == "estimate":
            _emit(_estimate(payload))
        elif cmd == "discover":
            _emit(_discover(payload))
        elif cmd == "predict_train":
            _emit(_predict_train(payload))
        elif cmd == "predict_infer":
            _emit(_predict_infer(payload))
        else:
            _emit_error(f"unknown cmd: {cmd!r}")
    except Exception as exc:  # pragma: no cover — top-level safety net
        _emit_error(f"worker crash: {exc}\n{traceback.format_exc()}")


# ---- estimation ------------------------------------------------------------


def _estimate(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run a backdoor-adjusted estimate with DoWhy if available.

    Falls back to a numpy linear regression if DoWhy is missing — that way
    the worker still produces a useful result on a partial install.
    """
    rows = payload.get("rows") or []
    treatment = payload["treatment"]
    outcome = payload["outcome"]
    adjustment = payload.get("adjustmentSet") or []
    bootstrap = int(payload.get("bootstrapIters", 500))
    ci_level = float(payload.get("ciLevel", 0.95))
    seed = int(payload.get("seed", 42))

    if not rows:
        return {
            "ok": False,
            "error": "estimate: empty rows array",
        }

    warnings: List[str] = []
    try:
        import numpy as np
        import pandas as pd
    except ImportError as exc:
        return {"ok": False, "error": f"missing dependency: {exc}"}

    df = pd.DataFrame([r["features"] for r in rows])

    method = "dowhy_linear_regression"
    try:
        from dowhy import CausalModel
    except ImportError:
        warnings.append(
            "dowhy is not installed; falling back to a plain backdoor-adjusted "
            "linear regression. `pip install dowhy` to enable DoWhy."
        )
        return _emit_payload(
            _estimate_numpy(df, treatment, outcome, adjustment, bootstrap, ci_level, seed),
            method="numpy_ols_backdoor",
            warnings=warnings,
        )

    graph_gml = _build_gml(treatment, outcome, adjustment)
    model = CausalModel(
        data=df,
        treatment=treatment,
        outcome=outcome,
        graph=graph_gml,
    )
    identified_estimand = model.identify_effect(proceed_when_unidentifiable=True)
    estimate = model.estimate_effect(
        identified_estimand,
        method_name="backdoor.linear_regression",
    )
    point = float(estimate.value)

    np.random.seed(seed)
    boot = []
    n = len(df)
    for _ in range(bootstrap):
        idx = np.random.randint(0, n, size=n)
        sample = df.iloc[idx]
        boot.append(_fit_beta(sample, treatment, outcome, adjustment))
    boot.sort()
    alpha = (1 - ci_level) / 2
    ci_low = float(boot[int(alpha * len(boot))])
    ci_high = float(boot[int((1 - alpha) * len(boot)) - 1])

    return _emit_payload(
        {
            "estimate": round(point, 4),
            "ciLow": round(ci_low, 4),
            "ciHigh": round(ci_high, 4),
            "ciLevel": ci_level,
            "sampleSize": int(n),
            "bootstrapIters": bootstrap,
            "notes": [
                "DoWhy point estimate via backdoor.linear_regression.",
                "Percentile bootstrap CI computed independently in numpy.",
                "Model-based estimate, not causal proof.",
            ],
        },
        method=method,
        warnings=warnings,
    )


def _estimate_numpy(df, treatment, outcome, adjustment, bootstrap, ci_level, seed):
    import numpy as np

    point = _fit_beta(df, treatment, outcome, adjustment)
    np.random.seed(seed)
    boot = []
    n = len(df)
    for _ in range(bootstrap):
        idx = np.random.randint(0, n, size=n)
        sample = df.iloc[idx]
        try:
            boot.append(_fit_beta(sample, treatment, outcome, adjustment))
        except Exception:
            continue
    boot.sort()
    alpha = (1 - ci_level) / 2
    ci_low = float(boot[int(alpha * len(boot))]) if boot else float("nan")
    ci_high = float(boot[int((1 - alpha) * len(boot)) - 1]) if boot else float("nan")
    return {
        "estimate": round(float(point), 4),
        "ciLow": round(ci_low, 4),
        "ciHigh": round(ci_high, 4),
        "ciLevel": ci_level,
        "sampleSize": int(n),
        "bootstrapIters": bootstrap,
        "notes": [
            "Backdoor-adjusted OLS via numpy (DoWhy not installed).",
            "Percentile bootstrap CI.",
            "Model-based estimate, not causal proof.",
        ],
    }


def _fit_beta(df, treatment, outcome, adjustment):
    import numpy as np

    cols = [treatment, *adjustment]
    X = np.column_stack([np.ones(len(df))] + [df[c].to_numpy() for c in cols])
    y = df[outcome].to_numpy()
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return float(beta[1])  # index 0 is intercept, 1 is the treatment


def _build_gml(treatment: str, outcome: str, adjustment: List[str]) -> str:
    """Minimal GML graph: treatment + adjusters → outcome, adjusters → treatment."""
    nodes = sorted({treatment, outcome, *adjustment})
    parts = ["graph [", "  directed 1"]
    node_ids = {name: idx for idx, name in enumerate(nodes)}
    for name, idx in node_ids.items():
        parts.append(f'  node [ id {idx} label "{name}" ]')
    edges: List[tuple[str, str]] = [(treatment, outcome)]
    for a in adjustment:
        edges.append((a, outcome))
        edges.append((a, treatment))
    for src, dst in edges:
        parts.append(
            f"  edge [ source {node_ids[src]} target {node_ids[dst]} ]"
        )
    parts.append("]")
    return "\n".join(parts)


# ---- discovery -------------------------------------------------------------


def _discover(payload: Dict[str, Any]) -> Dict[str, Any]:
    rows = payload.get("rows") or []
    nodes = payload.get("nodes") or []
    alpha = float(payload.get("alpha", 0.05))

    if not rows:
        return {"ok": False, "error": "discover: empty rows array"}
    if not nodes:
        return {"ok": False, "error": "discover: empty nodes array"}

    try:
        import numpy as np
    except ImportError as exc:
        return {"ok": False, "error": f"missing dependency: {exc}"}

    warnings: List[str] = []
    try:
        from causallearn.search.ConstraintBased.PC import pc
        from causallearn.utils.cit import fisherz
    except ImportError:
        warnings.append(
            "causal-learn is not installed; cannot run PC discovery. "
            "`pip install causal-learn` to enable."
        )
        return {"ok": False, "error": "causal-learn unavailable"}

    matrix = np.array(
        [[float(r["features"][n]) for n in nodes] for r in rows], dtype=float
    )
    cg = pc(matrix, alpha=alpha, indep_test=fisherz)
    g = cg.G
    edges: List[Dict[str, Any]] = []
    seen = set()
    for i, name_i in enumerate(nodes):
        for j, name_j in enumerate(nodes):
            if i == j:
                continue
            edge_ij = g.graph[i][j]
            edge_ji = g.graph[j][i]
            # causal-learn convention: -1 = arrow tail, 1 = arrow head, 0 = no edge.
            if edge_ij == 0 and edge_ji == 0:
                continue
            key = tuple(sorted((name_i, name_j)))
            if key in seen:
                continue
            seen.add(key)
            if edge_ij == 1 and edge_ji == -1:
                edges.append({"from": name_j, "to": name_i, "oriented": True})
            elif edge_ji == 1 and edge_ij == -1:
                edges.append({"from": name_i, "to": name_j, "oriented": True})
            else:
                edges.append({"from": name_i, "to": name_j, "oriented": False})
    return _emit_payload(
        {
            "algorithm": "pc_causal_learn",
            "alpha": alpha,
            "edges": edges,
            "independenceTests": -1,  # causal-learn does not expose the count
        },
        method="pc_causal_learn",
        warnings=warnings,
    )


# ---- prediction (Phase 9) --------------------------------------------------


def _predict_train(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Train an sklearn classifier and return its serialised parameters.

    Supported models: ``logistic`` (LogisticRegression) and
    ``random_forest`` (RandomForestClassifier). The worker returns the
    fitted parameters in a JSON-safe shape so the TypeScript side can
    persist them and use them at inference time *without* a second
    Python round-trip.

    Falls back with a clean error when sklearn isn't installed — the TS
    factory then degrades to its built-in logistic baseline.
    """
    rows = payload.get("rows") or []
    model_type = payload.get("modelType", "logistic")
    threshold = float(payload.get("threshold", 0.5))
    seed = int(payload.get("seed", 42))
    feature_names: List[str] = payload.get("featureNames") or []
    at_risk_threshold = float(payload.get("atRiskThreshold", 55))

    if not rows:
        return {"ok": False, "error": "predict_train: empty rows array"}
    if not feature_names:
        return {"ok": False, "error": "predict_train: empty featureNames array"}

    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        return {"ok": False, "error": f"missing dependency: {exc}"}

    X = np.array(
        [[float(r["features"][n]) for n in feature_names] for r in rows],
        dtype=float,
    )
    y = np.array(
        [1 if float(r["finalGrade"]) < at_risk_threshold else 0 for r in rows],
        dtype=int,
    )

    if y.sum() in (0, len(y)):
        return {
            "ok": False,
            "error": "predict_train: training set has only one class — add more rows.",
        }

    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)

    warnings: List[str] = []
    if model_type == "logistic":
        clf = LogisticRegression(
            penalty="l2",
            C=1.0,
            solver="lbfgs",
            max_iter=400,
            random_state=seed,
        ).fit(Xs, y)
        coefficients = clf.coef_[0].tolist()
        intercept = float(clf.intercept_[0])
        importance = [
            {
                "feature": feature_names[i],
                "value": round(coefficients[i], 4),
                "absValue": round(abs(coefficients[i]), 4),
                "description": (
                    f"sklearn LogisticRegression coefficient β = {coefficients[i]:.4f} — "
                    f"{'raises predicted risk' if coefficients[i] > 0 else 'lowers predicted risk'}."
                ),
            }
            for i in range(len(feature_names))
        ]
        importance.sort(key=lambda r: r["absValue"], reverse=True)
        train_acc = float(((clf.predict_proba(Xs)[:, 1] >= threshold).astype(int) == y).mean())
        method = "sklearn_logistic_regression"
        payload_out = {
            "kind": "logistic",
            "coefficients": coefficients,
            "intercept": intercept,
            "scaler": {
                "mean": scaler.mean_.tolist(),
                "std": scaler.scale_.tolist(),
            },
            "threshold": threshold,
            "featureNames": feature_names,
        }
    elif model_type == "random_forest":
        clf = RandomForestClassifier(
            n_estimators=200,
            max_depth=6,
            random_state=seed,
            n_jobs=1,
        ).fit(Xs, y)
        importances = clf.feature_importances_.tolist()
        importance = [
            {
                "feature": feature_names[i],
                "value": round(importances[i], 4),
                "absValue": round(importances[i], 4),
                "description": (
                    f"sklearn RandomForestClassifier importance = {importances[i]:.4f} "
                    "(magnitude only — tree models are sign-blind)."
                ),
            }
            for i in range(len(feature_names))
        ]
        importance.sort(key=lambda r: r["absValue"], reverse=True)
        train_acc = float(((clf.predict_proba(Xs)[:, 1] >= threshold).astype(int) == y).mean())
        method = "sklearn_random_forest"
        # Predict probabilities at training time so we can return them in the
        # train response; the TS side will use them directly to avoid a second
        # subprocess round-trip on already-seen rows.
        probs = clf.predict_proba(Xs)[:, 1].tolist()
        payload_out = {
            "kind": "random_forest",
            "trainProbabilities": [round(p, 4) for p in probs],
            "scaler": {
                "mean": scaler.mean_.tolist(),
                "std": scaler.scale_.tolist(),
            },
            "threshold": threshold,
            "featureNames": feature_names,
        }
    else:
        return {"ok": False, "error": f"unknown modelType: {model_type!r}"}

    log_loss = float(_log_loss(clf.predict_proba(Xs)[:, 1], y))

    return _emit_payload(
        {
            "modelType": model_type,
            "trainAccuracy": round(train_acc, 4),
            "trainLogLoss": round(log_loss, 4),
            "sampleSize": int(len(rows)),
            "featureImportance": importance,
            "payload": payload_out,
            "notes": [
                f"sklearn {model_type} fit via lbfgs / random forest.",
                "Probabilistic prediction — feature importance is NOT causal effect.",
                "All inference happens against the standardised feature space stored on the payload.",
            ],
        },
        method=method,
        warnings=warnings,
    )


def _predict_infer(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Re-score rows against a previously-trained sklearn model payload.

    For ``logistic`` we use the persisted coefficients + intercept and never
    touch sklearn — this keeps inference cheap and removes one round-trip.
    For ``random_forest`` we cannot re-create the forest from JSON, so the
    expected pattern is: call ``predict_train`` once and reuse the
    ``trainProbabilities`` it returned.
    """
    rows = payload.get("rows") or []
    model_payload = payload.get("modelPayload") or {}
    threshold = float(payload.get("threshold", model_payload.get("threshold", 0.5)))
    if not rows:
        return {"ok": False, "error": "predict_infer: empty rows array"}

    try:
        import numpy as np
    except ImportError as exc:
        return {"ok": False, "error": f"missing dependency: {exc}"}

    kind = model_payload.get("kind")
    feature_names: List[str] = model_payload.get("featureNames") or []
    scaler = model_payload.get("scaler") or {}
    mean = np.array(scaler.get("mean") or [], dtype=float)
    std = np.array(scaler.get("std") or [], dtype=float)
    if mean.size == 0 or std.size == 0 or not feature_names:
        return {"ok": False, "error": "predict_infer: malformed model payload"}

    X = np.array(
        [[float(r["features"][n]) for n in feature_names] for r in rows],
        dtype=float,
    )
    Xs = (X - mean) / std

    if kind == "logistic":
        coef = np.array(model_payload["coefficients"], dtype=float)
        intercept = float(model_payload["intercept"])
        logits = Xs @ coef + intercept
        probs = 1 / (1 + np.exp(-logits))
        return _emit_payload(
            {
                "probabilities": [round(float(p), 4) for p in probs.tolist()],
                "threshold": threshold,
            },
            method="sklearn_logistic_regression",
            warnings=[],
        )

    return {
        "ok": False,
        "error": (
            f"predict_infer: kind {kind!r} not re-inferrable; "
            "for random_forest, reuse trainProbabilities from predict_train."
        ),
    }


def _log_loss(probs, y) -> float:
    import numpy as np

    p = np.clip(probs, 1e-15, 1 - 1e-15)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


# ---- envelope helpers ------------------------------------------------------


def _detect_deps() -> Dict[str, bool]:
    """Quick capability map for the TS side to log on first run."""
    deps: Dict[str, bool] = {}
    for name in ("numpy", "pandas", "dowhy", "causallearn", "sklearn", "networkx"):
        try:
            __import__(name)
            deps[name] = True
        except Exception:
            deps[name] = False
    return deps


def _emit_payload(result: Dict[str, Any], *, method: str, warnings: List[str]) -> Dict[str, Any]:
    result.setdefault("method", method)
    return {"ok": True, "result": result, "warnings": warnings}


def _emit(envelope: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(envelope))
    sys.stdout.flush()


def _emit_ok(result: Dict[str, Any]) -> None:
    _emit({"ok": True, "result": result, "warnings": []})


def _emit_error(message: str) -> None:
    _emit({"ok": False, "error": message})


if __name__ == "__main__":
    main()
