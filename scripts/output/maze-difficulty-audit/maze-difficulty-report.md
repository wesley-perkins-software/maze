# Maze Difficulty Scaling Audit Report

**Generated:** 2026-05-20  
**Samples per preset:** 500 (seeds 60000–60499)  
**Generation mode:** `anyPortalSide: true` (matches production MazeGenerator UI)  

> **Key structural finding:** Small uses `newestBias=0.75 / braidFactor=0.02` (braided, winding)
> while Medium–Monster all use `newestBias=1.0 / braidFactor=0.00` (pure DFS, perfect mazes).
> This creates two distinct families: Small has higher *local* complexity per step;
> larger presets have higher *total* path commitment.

## Composite Difficulty Score — Two Views

### Density Difficulty Score (per-step complexity)

Computed per maze at generation time. Measures local difficulty per unit of traversal.

```
difficultyScore =
  0.30 × solutionPathFraction                              # how much of board you traverse
+ 0.20 × min(1, turnsPer100PathCells / 50)                # how twisty (cap 50/100)
+ 0.25 × min(1, decisionPointsPer100PathCells / 25)       # how many choices (cap 25/100)
+ 0.25 × min(1, averageWrongBranchLength / √totalCells)   # trap depth relative to maze
```

All four components range [0, 1]; weights sum to 1.0.

### Commitment Score (total experience cost)

Computed in post-processing. Uses global min-max normalization across all square presets.

```
commitmentScore =
  0.40 × norm(solutionPathCells)         # dominant: raw path length
+ 0.25 × norm(solutionDecisionPoints)    # raw count of choices encountered
+ 0.20 × norm(averageWrongBranchLength)  # absolute wrong-turn cost
+ 0.15 × norm(minSpan)                   # board spread
```

Where `norm(x) = (x - global_min) / (global_max - global_min)` across all square presets.

## Key Metrics — Median (p50) by Preset

| Metric | Small | Medium | Large | Expert | Monster |
| --- | --- | --- | --- | --- | --- |
| Grid cells | 400 | 1600 | 3600 | 6400 | 10000 |
| solutionPathCells | 99 | 644 | 1308 | 2149 | 3223 |
| solutionPathFraction | 24.8% | 40.3% | 36.3% | 33.6% | 32.2% |
| solutionTurns | 61 | 413 | 838 | 1388 | 2080 |
| solutionDecisionPoints | 25 | 53 | 101 | 158 | 228 |
| decisionPointsPer100 | 24.46 | 8.28 | 7.71 | 7.33 | 7.12 |
| avgWrongBranchLength | 5.7 | 9.9 | 11.7 | 13.2 | 13.9 |
| difficultyScore | 0.585 | 0.470 | 0.438 | 0.418 | 0.404 |
| commitmentScore | 0.156 | 0.281 | 0.390 | 0.509 | 0.648 |

## Mathematical Analysis

### 1. Does raw solution path length increase clearly from Small → Monster?

**Yes** — median path cells: 99 → 644 → 1308 → 2149 → 3223.  
Monster's median path is **32.6×** longer than Small's.  
Grid area grows 25× (400→10,000 cells); path length grows 32.6×.  
Path scales sub-quadratically — expected for tree-structured mazes.

### 2. Does solution path fraction remain healthy as size grows?

Median path fractions: 24.8% → 40.3% → 36.3% → 33.6% → 32.2%.  
**Healthy** — fraction declines but stays comfortably above the quality gate floor.  
The quality gate (compositeScore ≥ 0.78) actively enforces path fraction minimums.

### 3. Are medians monotonic from Small → Monster for key metrics?

| Metric | Values | Direction |
| --- | --- | --- |
| solutionPathCells | 99.00 → 644.50 → 1308.00 → 2149.00 → 3223.00 | ✅ monotone ↑ |
| solutionTurns | 61.00 → 413.00 → 837.50 → 1387.50 → 2080.50 | ✅ monotone ↑ |
| solutionDecisionPoints | 25.00 → 53.00 → 101.00 → 158.00 → 228.50 | ✅ monotone ↑ |
| avgWrongBranch | 5.74 → 9.88 → 11.66 → 13.21 → 13.94 | ✅ monotone ↑ |
| commitmentScore | 0.16 → 0.28 → 0.39 → 0.51 → 0.65 | ✅ monotone ↑ |
| pathFraction | 0.25 → 0.40 → 0.36 → 0.34 → 0.32 | ⚠️ non-monotone |
| decisionDensity | 24.46 → 8.28 → 7.71 → 7.33 → 7.12 | ✅ monotone ↓ |
| difficultyScore (density) | 0.59 → 0.47 → 0.44 → 0.42 → 0.40 | ✅ monotone ↓ |

**Note:** The density difficulty score (per-step formula) decreases Small→Monster because Small's braided/winding structure produces more local complexity per step. This is expected and informative — see Q13 for the full explanation.

### 4. Are the preset distributions meaningfully separated?

Separation using commitmentScore (Cohen's d approximation):

| Pair | Commit score gap | Sep. ratio | Verdict |
| --- | --- | --- | --- |
| Small→Medium | +0.136 | 5.08 | strong |
| Medium→Large | +0.105 | 6.63 | strong |
| Large→Expert | +0.123 | 5.17 | strong |
| Expert→Monster | +0.144 | 3.67 | strong |

### 5. Which metrics have the most overlap between presets?

| Metric | Small IQR | Monster IQR | Note |
| --- | --- | --- | --- |
| Turn density (per 100 cells) | [58.15, 64.36] | [63.69, 64.83] | overlap ≈ 0.66 |
| Decision density (per 100 cells) | [21.36, 27.22] | [6.77, 7.49] | overlap ≈ 0.00 |
| Zone coverage | [0.62, 0.75] | [0.94, 1.00] | overlap ≈ 0.00 |
| Min board span | [0.78, 1.00] | [1.00, 1.00] | overlap ≈ 0.00 |

Density-normalized metrics overlap significantly across sizes — by design. Raw absolute metrics (pathCells, decisionPoints) separate cleanly.

### 6. Does decision count increase with size?

Median decision points: 25 → 53 → 101 → 158 → 228.  
**Yes** — decision count rises monotonically with size.

### 7. Does decision density increase, decrease, or stay stable?

Median dp/100: 24.46 → 8.28 → 7.71 → 7.33 → 7.12.  
Decision density **decreases** across sizes — larger DFS mazes have longer corridors between junctions.  
Small's braided structure creates more junctions per cell; pure-DFS presets have longer corridors.

### 8. Do larger mazes have deeper wrong branches?

Median avg wrong-branch depth: 5.7 → 9.9 → 11.7 → 13.2 → 13.9.  
**Yes** — branch depth grows monotonically.  
Monster's median wrong-branch depth is **2.4×** deeper than Small's.  
Pure-DFS mazes produce very long uninterrupted corridors that dead-end far from the solution.

### 9. Does board coverage improve or remain healthy across sizes?

Median zone coverage: 0.69 → 0.94 → 1.00 → 1.00 → 1.00.  
**Good** — coverage is healthy, stays above 65%. The quality gate enforces spatial coverage.

### 10. Is Medium too hard or too easy relative to Small/Large?

Commitment score medians: Small=0.156, Medium=0.281, Large=0.390.  
Small→Medium gap: +0.124; Medium→Large gap: +0.109.  
Gaps are nearly equal — Medium is proportionally positioned.

### 11. Is Monster appropriately extreme?

Commitment score — Expert: 0.509, Monster: 0.648.  
Monster raw path cells median: 3223 vs Expert: 2149 (1.50× longer).  
**Monster is distinctly harder than Expert** — appropriately extreme.

### 12. Are there outlier mazes that are too easy or too punishing?

Found **122 outlier mazes** (|z| > 2 within preset): 69 too-easy, 53 too-hard.  
Outlier rate: 4.9% of all square-preset mazes.  

Sample outliers (first 20):

| Preset | Seed | difficultyScore | Direction |
| --- | --- | --- | --- |
| Small | 60015 | 0.537 | easy |
| Small | 60035 | 0.531 | easy |
| Small | 60065 | 0.518 | easy |
| Small | 60069 | 0.533 | easy |
| Small | 60096 | 0.496 | easy |
| Small | 60097 | 0.537 | easy |
| Small | 60098 | 0.520 | easy |
| Small | 60101 | 0.536 | easy |
| Small | 60121 | 0.513 | easy |
| Small | 60238 | 0.528 | easy |
| Small | 60268 | 0.535 | easy |
| Small | 60278 | 0.505 | easy |
| Small | 60306 | 0.520 | easy |
| Small | 60334 | 0.507 | easy |
| Small | 60374 | 0.532 | easy |
| Small | 60389 | 0.527 | easy |
| Small | 60394 | 0.526 | easy |
| Small | 60397 | 0.510 | easy |
| Small | 60401 | 0.523 | easy |
| Small | 60413 | 0.622 | hard |

_(and 102 more — see raw CSV for full list)_

### 13. Which metric best explains the perceived difficulty increase?

Correlation with commitmentScore:

| Metric | r |
| --- | --- |
| solutionPathCells | 0.976 |
| solutionTurns | 0.976 |
| solutionDecisionPoints | 0.959 |
| difficultyScore | -0.852 |
| maxWrongBranchLength | 0.771 |
| decisionPointsPer100PathCells | -0.706 |
| zoneCoverage | 0.644 |
| averageWrongBranchLength | 0.630 |
| minSpan | 0.511 |
| turnsPer100PathCells | 0.334 |
| solutionPathFraction | 0.197 |

**solutionPathCells** has the strongest correlation with the commitment score (r=0.976).  
Raw path length is the dominant driver of perceived total difficulty.

### 14. Are metrics measuring distinct properties or mostly correlated with path length?

Correlation with solutionPathCells:

| Metric | r with pathCells | Independent? |
| --- | --- | --- |
| solutionTurns | 1.000 | ❌ highly correlated |
| solutionDecisionPoints | 0.989 | ❌ highly correlated |
| commitmentScore | 0.976 | ❌ highly correlated |
| difficultyScore | -0.778 | ⚠️ moderate |
| maxWrongBranchLength | 0.709 | ⚠️ moderate |
| decisionPointsPer100PathCells | -0.618 | ⚠️ moderate |
| zoneCoverage | 0.587 | ⚠️ moderate |
| averageWrongBranchLength | 0.485 | ✅ largely independent |
| minSpan | 0.378 | ✅ largely independent |
| turnsPer100PathCells | 0.315 | ✅ largely independent |
| solutionPathFraction | 0.218 | ✅ largely independent |

Density metrics (turnsPer100PathCells) are largely independent of path length — they measure distinct per-step properties.  
Absolute metrics (pathCells, turns, decisionPoints) are highly correlated with each other since they all scale with maze size.

## Difficulty Ladder Coherence Verdict

| Check | Result |
| --- | --- |
| Raw path length increases monotonically Small→Monster | ✅ Pass |
| Decision count increases monotonically | ✅ Pass |
| Wrong-branch depth increases monotonically | ✅ Pass |
| Commitment score increases monotonically | ✅ Pass |
| Path fraction stays healthy (p50 > 10%) | ✅ Pass |
| All presets separated by commitment score (d > 0.5) | ✅ Pass |

**✅ COHERENT** — The difficulty ladder is well-ordered across all key metrics.

## Recommendations for Future Tuning

- The **density difficulty score** is higher for Small than larger presets. If a single sortable score is needed, use the commitment score or a hybrid. Consider adding raw path length as a 40% component in the product-facing formula.
- Re-run this audit after any generator parameter changes to verify ladder coherence.
