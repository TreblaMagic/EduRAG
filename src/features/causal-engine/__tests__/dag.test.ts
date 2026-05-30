import { describe, expect, it } from "vitest";

import {
  BASELINE_ADJUSTERS,
  CAUSAL_EDGES,
  CAUSAL_NODES,
  adjustmentSetFor,
  buildAdjacency,
  childrenOf,
  isDag,
  parentsOf,
  toDagJson,
  topologicalSort,
  type CausalEdge,
  type CausalNode,
} from "../dag";

describe("DAG structure", () => {
  it("every edge endpoint is a declared node", () => {
    const known = new Set<string>(CAUSAL_NODES);
    for (const e of CAUSAL_EDGES) {
      expect(known.has(e.from)).toBe(true);
      expect(known.has(e.to)).toBe(true);
    }
  });

  it("every edge carries a rationale string", () => {
    for (const e of CAUSAL_EDGES) {
      expect(e.rationale.length).toBeGreaterThan(0);
    }
  });

  it("contains no self-loops", () => {
    for (const e of CAUSAL_EDGES) {
      expect(e.from).not.toBe(e.to);
    }
  });

  it("is a valid DAG", () => {
    expect(isDag()).toBe(true);
  });

  it("topological sort returns every node with parents before children", () => {
    const order = topologicalSort();
    expect(order).not.toBeNull();
    const positions = new Map<CausalNode, number>(
      (order as CausalNode[]).map((n, i) => [n, i]),
    );
    for (const e of CAUSAL_EDGES) {
      expect(positions.get(e.from)! < positions.get(e.to)!).toBe(true);
    }
  });

  it("detects cycles", () => {
    const cyclic: CausalEdge[] = [
      ...CAUSAL_EDGES,
      {
        from: "FinalGrade",
        to: "PriorGPA",
        rationale: "intentional cycle for the test",
      },
    ];
    expect(topologicalSort(CAUSAL_NODES, cyclic)).toBeNull();
    expect(isDag(CAUSAL_NODES, cyclic)).toBe(false);
  });
});

describe("parentsOf / childrenOf", () => {
  it("returns parents of FinalGrade per the documented DAG", () => {
    expect(parentsOf("FinalGrade").sort()).toEqual(
      [
        "PriorGPA",
        "ResourceDiversityIndex",
        "ForumParticipation",
        "QuizConsistency",
        "AssessmentTrend",
      ].sort(),
    );
  });

  it("PriorGPA is a root (no parents)", () => {
    expect(parentsOf("PriorGPA")).toEqual([]);
  });

  it("FinalGrade is a sink (no children)", () => {
    expect(childrenOf("FinalGrade")).toEqual([]);
  });

  it("Engagement's children are RDI and ForumParticipation", () => {
    expect(childrenOf("Engagement").sort()).toEqual(
      ["ForumParticipation", "ResourceDiversityIndex"].sort(),
    );
  });
});

describe("buildAdjacency", () => {
  it("returns parents and children for every node", () => {
    const adj = buildAdjacency();
    for (const n of CAUSAL_NODES) {
      expect(adj.has(n)).toBe(true);
    }
    expect(adj.get("FinalGrade")?.children).toEqual([]);
    expect(adj.get("PriorGPA")?.parents).toEqual([]);
  });
});

describe("adjustmentSetFor", () => {
  it("returns baseline adjusters minus the treatment", () => {
    expect(adjustmentSetFor("ResourceDiversityIndex").sort()).toEqual(
      ["PriorGPA", "Engagement"].sort(),
    );
    expect(adjustmentSetFor("Engagement")).toEqual(["PriorGPA"]);
    expect(adjustmentSetFor("PriorGPA")).toEqual(["Engagement"]);
  });

  it("never includes the treatment itself", () => {
    for (const t of BASELINE_ADJUSTERS) {
      expect(adjustmentSetFor(t)).not.toContain(t);
    }
  });
});

describe("toDagJson", () => {
  it("returns a serialisable structure including labels and topo order", () => {
    const json = toDagJson();
    expect(json.nodes).toHaveLength(CAUSAL_NODES.length);
    expect(json.edges).toHaveLength(CAUSAL_EDGES.length);
    expect(json.isDag).toBe(true);
    expect(json.topologicalOrder).not.toBeNull();
    expect(json.baselineAdjusters).toEqual([...BASELINE_ADJUSTERS]);
    // JSON-roundtrip safety.
    expect(() => JSON.parse(JSON.stringify(json))).not.toThrow();
  });

  it("labels every node with a human-readable string", () => {
    const json = toDagJson();
    for (const n of json.nodes) {
      expect(typeof n.label).toBe("string");
      expect(n.label.length).toBeGreaterThan(0);
    }
  });
});
