# Graph Report - nutricost-dev-tracker  (2026-06-30)

## Corpus Check
- 6 files · ~9,856 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 96 nodes · 116 edges · 15 communities (11 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `877311fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `scripts` - 5 edges
2. `defOf()` - 5 edges
3. `resolveEvent()` - 5 edges
4. `waitColor()` - 4 edges
5. `parseDate()` - 4 edges
6. `dueStatus()` - 4 edges
7. `EventModal()` - 4 edges
8. `timelineColor()` - 3 edges
9. `startOfDay()` - 3 edges
10. `requiresTeam()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `resolveEvent()` --calls--> `defOf()`  [EXTRACTED]
  src/App.jsx → src/App.jsx  _Bridges community 6 → community 3_
- `resolveEvent()` --calls--> `parseDate()`  [EXTRACTED]
  src/App.jsx → src/App.jsx  _Bridges community 5 → community 3_

## Import Cycles
- None detected.

## Communities (15 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (9): BUCKETS, CFG, DEFAULT_EVENT_DEFS, DEFAULT_SETTINGS, OWNER_COLORS, OWNER_ORDER, PALETTE, SEED (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (14): dependencies, lucide-react, react, react-dom, recharts, name, private, scripts (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @types/react, @types/react-dom (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (6): displayStatus(), ownerColor(), resolveEvent(), stateBadge(), timelineColor(), waitColor()

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): Expanding the ESLint configuration, nutricost-dev-tracker, React Compiler, React + Vite

### Community 5 - "Community 5"
Cohesion: 0.50
Nodes (5): daysBetween(), dueStatus(), metricsFor(), parseDate(), startOfDay()

### Community 6 - "Community 6"
Cohesion: 0.50
Nodes (5): defaultTeamFor(), defOf(), EventModal(), requiresTeam(), toInput()

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (3): bucketByProj(), Dashboard(), teamTime()

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (3): fmtDT(), n1(), Timeline()

## Knowledge Gaps
- **33 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._