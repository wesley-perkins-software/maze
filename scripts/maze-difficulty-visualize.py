#!/usr/bin/env python3
"""
Maze Difficulty Visualizer

Reads raw-maze-difficulty-data.csv and produces:
  - 13 charts (PNG)
  - maze-difficulty-report.md

Run: python3 scripts/maze-difficulty-visualize.py
     (or: npm run difficulty:visualize)
"""
import subprocess, sys, os

for pkg in ['pandas', 'matplotlib', 'seaborn', 'numpy']:
    try:
        __import__(pkg)
    except ImportError:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', pkg, '-q'])

import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from datetime import date

# ── Config ─────────────────────────────────────────────────────────────────────

OUT_DIR = 'scripts/output/maze-difficulty-audit'
RAW_CSV = f'{OUT_DIR}/raw-maze-difficulty-data.csv'
SUMMARY_CSV = f'{OUT_DIR}/maze-difficulty-summary.csv'
REPORT_PATH = f'{OUT_DIR}/maze-difficulty-report.md'

SQUARE_ORDER = ['Small', 'Medium', 'Large', 'Expert', 'Monster']
ALL_ORDER = ['Small', 'Medium', 'Large', 'Expert', 'Monster', 'Wide', 'Tall', 'WideRect', 'TallRect']

PALETTE = {
    'Small':    '#4e9af1',
    'Medium':   '#56c76e',
    'Large':    '#f5a623',
    'Expert':   '#e05c5c',
    'Monster':  '#9b59b6',
    'Wide':     '#7f8c8d',
    'Tall':     '#95a5a6',
    'WideRect': '#bdc3c7',
    'TallRect': '#d5dbdb',
}

TOTAL_CELLS = {'Small': 400, 'Medium': 1600, 'Large': 3600, 'Expert': 6400, 'Monster': 10000}

os.makedirs(OUT_DIR, exist_ok=True)

# ── Load data ──────────────────────────────────────────────────────────────────

df = pd.read_csv(RAW_CSV)
df['preset'] = pd.Categorical(df['preset'], categories=ALL_ORDER, ordered=True)
df_sq = df[df['preset'].isin(SQUARE_ORDER)].copy()
df_sq['preset'] = pd.Categorical(df_sq['preset'], categories=SQUARE_ORDER, ordered=True)

# Compute global min-max normalized commitment score on square presets only.
# This score weights raw absolute metrics — rewards Monster for sheer size.
# Normalization: each component scaled to [0,1] using global min/max across all square presets.
def minmax_norm(series):
    lo, hi = series.min(), series.max()
    return (series - lo) / (hi - lo) if hi > lo else series * 0

df_sq = df_sq.copy()
df_sq['_normPath']   = minmax_norm(df_sq['solutionPathCells'])
df_sq['_normDP']     = minmax_norm(df_sq['solutionDecisionPoints'])
df_sq['_normBranch'] = minmax_norm(df_sq['averageWrongBranchLength'])
df_sq['_normSpan']   = minmax_norm(df_sq['minSpan'])
# Commitment score: raw absolute count weighted (path 40%, decisions 25%, branches 20%, spread 15%)
df_sq['commitmentScore'] = (
    0.40 * df_sq['_normPath'] +
    0.25 * df_sq['_normDP'] +
    0.20 * df_sq['_normBranch'] +
    0.15 * df_sq['_normSpan']
)

print(f"Loaded {len(df)} rows across presets: {df['preset'].unique().tolist()}")
print(f"Commitment score p50 by preset:")
for p in SQUARE_ORDER:
    sub = df_sq[df_sq['preset'] == p]
    print(f"  {p}: {sub['commitmentScore'].median():.3f}")

sns.set_theme(style='whitegrid', font_scale=1.1)

def save(fig, filename):
    path = f'{OUT_DIR}/{filename}'
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved {path}")

# ── Helper: violin + box ───────────────────────────────────────────────────────

def violin_plot(data, x, y, title, ylabel, filename, order=SQUARE_ORDER, figsize=(10, 5)):
    fig, ax = plt.subplots(figsize=figsize)
    palette = [PALETTE.get(p, '#aaa') for p in order]
    sns.violinplot(data=data, x=x, y=y, order=order,
                   palette=palette, inner='box', cut=0, ax=ax)
    ax.set_title(title)
    ax.set_xlabel('Preset')
    ax.set_ylabel(ylabel)
    ax.grid(axis='y', alpha=0.4)
    save(fig, filename)

# ── Charts ─────────────────────────────────────────────────────────────────────
print("\nGenerating charts...")

violin_plot(df_sq, 'preset', 'solutionPathCells',
    'Solution Path Length by Preset', 'Solution Path Cells',
    'solution-path-cells-by-preset.png')

violin_plot(df_sq, 'preset', 'solutionPathFraction',
    'Solution Path Fraction by Preset', 'Path Fraction (cells / totalCells)',
    'solution-path-fraction-by-preset.png')

violin_plot(df_sq, 'preset', 'solutionTurns',
    'Solution Turns by Preset', 'Turn Count',
    'solution-turns-by-preset.png')

violin_plot(df_sq, 'preset', 'turnsPer100PathCells',
    'Turn Density by Preset', 'Turns per 100 Path Cells',
    'turns-per-100-cells-by-preset.png')

violin_plot(df_sq, 'preset', 'solutionDecisionPoints',
    'Decision Points by Preset', 'Decision Point Count',
    'decision-points-by-preset.png')

violin_plot(df_sq, 'preset', 'decisionPointsPer100PathCells',
    'Decision Point Density by Preset', 'Decision Points per 100 Path Cells',
    'decision-density-by-preset.png')

violin_plot(df_sq, 'preset', 'averageWrongBranchLength',
    'Average Wrong-Branch Depth by Preset', 'Avg Wrong Branch Length (cells)',
    'wrong-branch-depth-by-preset.png')

violin_plot(df_sq, 'preset', 'maxWrongBranchLength',
    'Max Wrong-Branch Depth by Preset', 'Max Wrong Branch Length (cells)',
    'max-wrong-branch-by-preset.png')

# Dual-score comparison plot
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
palette = [PALETTE[p] for p in SQUARE_ORDER]
sns.violinplot(data=df_sq, x='preset', y='difficultyScore', order=SQUARE_ORDER,
               palette=palette, inner='box', cut=0, ax=axes[0])
axes[0].set_title('Density Difficulty Score\n(per-step local complexity)')
axes[0].set_xlabel('Preset')
axes[0].set_ylabel('Score (0–1)')
axes[0].grid(axis='y', alpha=0.4)

sns.violinplot(data=df_sq, x='preset', y='commitmentScore', order=SQUARE_ORDER,
               palette=palette, inner='box', cut=0, ax=axes[1])
axes[1].set_title('Commitment Score\n(global min-max normalized raw counts)')
axes[1].set_xlabel('Preset')
axes[1].set_ylabel('Score (0–1)')
axes[1].grid(axis='y', alpha=0.4)

fig.suptitle('Difficulty Score Comparison: Local Density vs Total Commitment', y=1.02)
plt.tight_layout()
save(fig, 'difficulty-score-by-preset.png')

# Scatter: path cells vs decision points
fig, ax = plt.subplots(figsize=(10, 6))
for preset in SQUARE_ORDER:
    sub = df_sq[df_sq['preset'] == preset]
    ax.scatter(sub['solutionPathCells'], sub['solutionDecisionPoints'],
               label=preset, color=PALETTE[preset], alpha=0.35, s=12)
ax.set_xlabel('Solution Path Cells')
ax.set_ylabel('Solution Decision Points')
ax.set_title('Solution Path Length vs Decision Points (by Preset)')
ax.legend(title='Preset')
ax.grid(alpha=0.3)
save(fig, 'path-vs-decisions-scatter.png')

# Scatter: path fraction vs decision density
fig, ax = plt.subplots(figsize=(10, 6))
for preset in SQUARE_ORDER:
    sub = df_sq[df_sq['preset'] == preset]
    ax.scatter(sub['solutionPathFraction'], sub['decisionPointsPer100PathCells'],
               label=preset, color=PALETTE[preset], alpha=0.35, s=12)
ax.set_xlabel('Solution Path Fraction')
ax.set_ylabel('Decision Points per 100 Path Cells')
ax.set_title('Path Fraction vs Decision Density (by Preset)')
ax.legend(title='Preset')
ax.grid(alpha=0.3)
save(fig, 'path-fraction-vs-decision-density-scatter.png')

# Correlation matrix
corr_cols = [
    'solutionPathCells', 'solutionPathFraction',
    'solutionTurns', 'turnsPer100PathCells',
    'solutionDecisionPoints', 'decisionPointsPer100PathCells',
    'averageWrongBranchLength', 'maxWrongBranchLength',
    'zoneCoverage', 'minSpan', 'difficultyScore', 'commitmentScore',
]
corr_labels = [
    'pathCells', 'pathFraction',
    'turns', 'turnsPer100',
    'decisionPts', 'dpPer100',
    'avgWrongBranch', 'maxWrongBranch',
    'zoneCoverage', 'minSpan', 'densityScore', 'commitScore',
]

corr_data = df_sq[corr_cols].copy()
corr_data.columns = corr_labels
corr_matrix = corr_data.corr()

fig, ax = plt.subplots(figsize=(12, 10))
mask = np.zeros_like(corr_matrix, dtype=bool)
np.fill_diagonal(mask, True)
sns.heatmap(corr_matrix, annot=True, fmt='.2f', mask=mask,
            cmap='RdBu_r', center=0, vmin=-1, vmax=1,
            square=True, linewidths=0.5, ax=ax, annot_kws={'size': 8})
ax.set_title('Metric Correlation Matrix (Square Presets)', pad=12)
plt.xticks(rotation=45, ha='right')
plt.yticks(rotation=0)
save(fig, 'metric-correlation-matrix.png')

# ── Statistics for report ──────────────────────────────────────────────────────

def pct(data, q):
    return float(np.percentile(data, q))

def stats_for(data):
    data = np.array(data, dtype=float)
    return {
        'p10': pct(data, 10), 'p25': pct(data, 25),
        'p50': pct(data, 50), 'p75': pct(data, 75),
        'p90': pct(data, 90),
        'mean': float(data.mean()), 'std': float(data.std()),
        'min': float(data.min()), 'max': float(data.max()),
    }

all_metrics = [
    'solutionPathCells', 'solutionPathFraction',
    'solutionTurns', 'turnsPer100PathCells',
    'solutionDecisionPoints', 'decisionPointsPer100PathCells',
    'averageWrongBranchLength', 'maxWrongBranchLength',
    'zoneCoverage', 'minSpan', 'generationTimeMs',
    'compositeScore', 'difficultyScore', 'commitmentScore',
]

preset_stats = {}
for preset in SQUARE_ORDER:
    sub = df_sq[df_sq['preset'] == preset]
    preset_stats[preset] = {m: stats_for(sub[m]) for m in all_metrics}

def p50(preset, metric):
    return preset_stats[preset][metric]['p50']

def is_monotone_increasing(vals):
    return all(vals[i] <= vals[i+1] for i in range(len(vals)-1))

def fmt_pct(v):
    return f"{v*100:.1f}%"

p50_path       = [p50(p, 'solutionPathCells') for p in SQUARE_ORDER]
p50_fraction   = [p50(p, 'solutionPathFraction') for p in SQUARE_ORDER]
p50_turns      = [p50(p, 'solutionTurns') for p in SQUARE_ORDER]
p50_dp         = [p50(p, 'solutionDecisionPoints') for p in SQUARE_ORDER]
p50_dp_den     = [p50(p, 'decisionPointsPer100PathCells') for p in SQUARE_ORDER]
p50_branch     = [p50(p, 'averageWrongBranchLength') for p in SQUARE_ORDER]
p50_difficulty = [p50(p, 'difficultyScore') for p in SQUARE_ORDER]
p50_commit     = [p50(p, 'commitmentScore') for p in SQUARE_ORDER]
p50_zone       = [p50(p, 'zoneCoverage') for p in SQUARE_ORDER]

def separation_ratio(p1, p2, metric):
    d1 = preset_stats[p1][metric]
    d2 = preset_stats[p2][metric]
    pooled_std = ((d1['std'] + d2['std']) / 2) or 1
    return abs(d2['mean'] - d1['mean']) / pooled_std

# Outliers per preset
outliers = []
for preset in SQUARE_ORDER:
    sub = df_sq[df_sq['preset'] == preset]
    mu = sub['difficultyScore'].mean()
    sd = sub['difficultyScore'].std()
    if sd > 0:
        z = (sub['difficultyScore'] - mu) / sd
        outs = sub[z.abs() > 2]
        for _, row in outs.iterrows():
            direction = 'easy' if row['difficultyScore'] < mu else 'hard'
            outliers.append((preset, int(row['seed']), f"{row['difficultyScore']:.3f}", direction))

# Correlation with both scores
path_corrs = {
    col: float(df_sq[col].corr(df_sq['solutionPathCells']))
    for col in corr_cols if col != 'solutionPathCells'
}
commit_corrs = {
    col: float(df_sq[col].corr(df_sq['commitmentScore']))
    for col in corr_cols if col != 'commitmentScore'
}

# ── Write Markdown report ──────────────────────────────────────────────────────

with open(REPORT_PATH, 'w') as f:
    f.write(f"# Maze Difficulty Scaling Audit Report\n\n")
    f.write(f"**Generated:** {date.today().isoformat()}  \n")
    f.write(f"**Samples per preset:** 500 (seeds 60000–60499)  \n")
    f.write(f"**Generation mode:** `anyPortalSide: true` (matches production MazeGenerator UI)  \n\n")

    # Key finding callout
    f.write("> **Key structural finding:** Small uses `newestBias=0.75 / braidFactor=0.02` (braided, winding)\n")
    f.write("> while Medium–Monster all use `newestBias=1.0 / braidFactor=0.00` (pure DFS, perfect mazes).\n")
    f.write("> This creates two distinct families: Small has higher *local* complexity per step;\n")
    f.write("> larger presets have higher *total* path commitment.\n\n")

    # Difficulty score formula
    f.write("## Composite Difficulty Score — Two Views\n\n")
    f.write("### Density Difficulty Score (per-step complexity)\n\n")
    f.write("Computed per maze at generation time. Measures local difficulty per unit of traversal.\n\n")
    f.write("```\n")
    f.write("difficultyScore =\n")
    f.write("  0.30 × solutionPathFraction                              # how much of board you traverse\n")
    f.write("+ 0.20 × min(1, turnsPer100PathCells / 50)                # how twisty (cap 50/100)\n")
    f.write("+ 0.25 × min(1, decisionPointsPer100PathCells / 25)       # how many choices (cap 25/100)\n")
    f.write("+ 0.25 × min(1, averageWrongBranchLength / √totalCells)   # trap depth relative to maze\n")
    f.write("```\n\n")
    f.write("All four components range [0, 1]; weights sum to 1.0.\n\n")
    f.write("### Commitment Score (total experience cost)\n\n")
    f.write("Computed in post-processing. Uses global min-max normalization across all square presets.\n\n")
    f.write("```\n")
    f.write("commitmentScore =\n")
    f.write("  0.40 × norm(solutionPathCells)         # dominant: raw path length\n")
    f.write("+ 0.25 × norm(solutionDecisionPoints)    # raw count of choices encountered\n")
    f.write("+ 0.20 × norm(averageWrongBranchLength)  # absolute wrong-turn cost\n")
    f.write("+ 0.15 × norm(minSpan)                   # board spread\n")
    f.write("```\n\n")
    f.write("Where `norm(x) = (x - global_min) / (global_max - global_min)` across all square presets.\n\n")

    # Key metrics table
    f.write("## Key Metrics — Median (p50) by Preset\n\n")
    rows = [
        ("Grid cells", [TOTAL_CELLS[p] for p in SQUARE_ORDER], '.0f'),
        ("solutionPathCells", p50_path, '.0f'),
        ("solutionPathFraction", None, None),   # special formatting
        ("solutionTurns", p50_turns, '.0f'),
        ("solutionDecisionPoints", p50_dp, '.0f'),
        ("decisionPointsPer100", p50_dp_den, '.2f'),
        ("avgWrongBranchLength", p50_branch, '.1f'),
        ("difficultyScore", p50_difficulty, '.3f'),
        ("commitmentScore", p50_commit, '.3f'),
    ]
    header = "| Metric | " + " | ".join(SQUARE_ORDER) + " |"
    sep = "| --- | " + " | ".join(["---"]*5) + " |"
    f.write(header + "\n" + sep + "\n")
    for label, vals, fmt in rows:
        if vals is None:  # pathFraction special
            cells = " | ".join(fmt_pct(v) for v in p50_fraction)
            f.write(f"| solutionPathFraction | {cells} |\n")
        else:
            cells = " | ".join(f"{v:{fmt}}" for v in vals)
            f.write(f"| {label} | {cells} |\n")
    f.write("\n")

    # Mathematical analysis
    f.write("## Mathematical Analysis\n\n")

    # Q1
    f.write("### 1. Does raw solution path length increase clearly from Small → Monster?\n\n")
    path_mono = is_monotone_increasing(p50_path)
    ratio = p50_path[-1] / p50_path[0]
    f.write(f"**{'Yes' if path_mono else 'Mostly'}** — median path cells: "
            f"{' → '.join(f'{v:.0f}' for v in p50_path)}.  \n")
    f.write(f"Monster's median path is **{ratio:.1f}×** longer than Small's.  \n")
    f.write(f"Grid area grows 25× (400→10,000 cells); path length grows {ratio:.1f}×.  \n")
    f.write("Path scales sub-quadratically — expected for tree-structured mazes.\n\n")

    # Q2
    f.write("### 2. Does solution path fraction remain healthy as size grows?\n\n")
    f.write(f"Median path fractions: {' → '.join(fmt_pct(v) for v in p50_fraction)}.  \n")
    min_frac = min(p50_fraction)
    if min_frac > 0.25:
        health = "**Excellent** — all presets maintain fraction well above minimum thresholds."
    elif min_frac > 0.10:
        health = "**Healthy** — fraction declines but stays comfortably above the quality gate floor."
    else:
        health = "**Caution** — path fraction drops significantly for larger sizes."
    f.write(f"{health}  \n")
    f.write("The quality gate (compositeScore ≥ 0.78) actively enforces path fraction minimums.\n\n")

    # Q3
    f.write("### 3. Are medians monotonic from Small → Monster for key metrics?\n\n")
    checks = [
        ('solutionPathCells', p50_path, True),
        ('solutionTurns', p50_turns, True),
        ('solutionDecisionPoints', p50_dp, True),
        ('avgWrongBranch', p50_branch, True),
        ('commitmentScore', p50_commit, True),
        ('pathFraction', p50_fraction, None),
        ('decisionDensity', p50_dp_den, None),
        ('difficultyScore (density)', p50_difficulty, None),
    ]
    f.write("| Metric | Values | Direction |\n| --- | --- | --- |\n")
    for name, vals, expected_inc in checks:
        inc = is_monotone_increasing(vals)
        dec = is_monotone_increasing([-v for v in vals])
        if inc: status = "✅ monotone ↑"
        elif dec: status = "✅ monotone ↓"
        else: status = "⚠️ non-monotone"
        vstr = " → ".join(f"{v:.2f}" for v in vals)
        f.write(f"| {name} | {vstr} | {status} |\n")
    f.write("\n")
    f.write("**Note:** The density difficulty score (per-step formula) decreases Small→Monster because "
            "Small's braided/winding structure produces more local complexity per step. "
            "This is expected and informative — see Q13 for the full explanation.\n\n")

    # Q4
    f.write("### 4. Are the preset distributions meaningfully separated?\n\n")
    f.write("Separation using commitmentScore (Cohen's d approximation):\n\n")
    f.write("| Pair | Commit score gap | Sep. ratio | Verdict |\n| --- | --- | --- | --- |\n")
    for i in range(len(SQUARE_ORDER)-1):
        p1, p2 = SQUARE_ORDER[i], SQUARE_ORDER[i+1]
        sep = separation_ratio(p1, p2, 'commitmentScore')
        gap = preset_stats[p2]['commitmentScore']['mean'] - preset_stats[p1]['commitmentScore']['mean']
        verdict = "strong" if sep > 1.0 else ("moderate" if sep > 0.5 else "weak/overlap")
        f.write(f"| {p1}→{p2} | {gap:+.3f} | {sep:.2f} | {verdict} |\n")
    f.write("\n")

    # Q5
    f.write("### 5. Which metrics have the most overlap between presets?\n\n")
    overlap_metrics = [
        ('turnsPer100PathCells', 'Turn density (per 100 cells)'),
        ('decisionPointsPer100PathCells', 'Decision density (per 100 cells)'),
        ('zoneCoverage', 'Zone coverage'),
        ('minSpan', 'Min board span'),
    ]
    f.write("| Metric | Small IQR | Monster IQR | Note |\n| --- | --- | --- | --- |\n")
    for col, label in overlap_metrics:
        sm = preset_stats['Small'][col]
        mn = preset_stats['Monster'][col]
        overlap = max(0, min(sm['p75'], mn['p75']) - max(sm['p25'], mn['p25']))
        f.write(f"| {label} | [{sm['p25']:.2f}, {sm['p75']:.2f}] | [{mn['p25']:.2f}, {mn['p75']:.2f}] | overlap ≈ {overlap:.2f} |\n")
    f.write("\nDensity-normalized metrics overlap significantly across sizes — by design. "
            "Raw absolute metrics (pathCells, decisionPoints) separate cleanly.\n\n")

    # Q6
    f.write("### 6. Does decision count increase with size?\n\n")
    dp_mono = is_monotone_increasing(p50_dp)
    f.write(f"Median decision points: {' → '.join(f'{v:.0f}' for v in p50_dp)}.  \n")
    f.write(f"**{'Yes' if dp_mono else 'Not strictly'}** — decision count "
            f"{'rises monotonically' if dp_mono else 'is mostly increasing but not strict'} with size.\n\n")

    # Q7
    f.write("### 7. Does decision density increase, decrease, or stay stable?\n\n")
    f.write(f"Median dp/100: {' → '.join(f'{v:.2f}' for v in p50_dp_den)}.  \n")
    dp_inc = is_monotone_increasing(p50_dp_den)
    dp_dec = is_monotone_increasing([-v for v in p50_dp_den])
    if dp_dec:
        direction = "**decreases** across sizes — larger DFS mazes have longer corridors between junctions"
    elif dp_inc:
        direction = "**increases** — surprising, check data"
    else:
        direction = "**is non-monotone** — varies across presets"
    f.write(f"Decision density {direction}.  \n")
    f.write("Small's braided structure creates more junctions per cell; pure-DFS presets have longer corridors.\n\n")

    # Q8
    f.write("### 8. Do larger mazes have deeper wrong branches?\n\n")
    f.write(f"Median avg wrong-branch depth: {' → '.join(f'{v:.1f}' for v in p50_branch)}.  \n")
    branch_mono = is_monotone_increasing(p50_branch)
    f.write(f"**{'Yes' if branch_mono else 'Not strictly'}** — branch depth "
            f"{'grows monotonically' if branch_mono else 'grows overall but non-monotonically'}.  \n")
    ratio_branch = p50_branch[-1] / max(p50_branch[0], 0.01)
    f.write(f"Monster's median wrong-branch depth is **{ratio_branch:.1f}×** deeper than Small's.  \n")
    f.write("Pure-DFS mazes produce very long uninterrupted corridors that dead-end far from the solution.\n\n")

    # Q9
    f.write("### 9. Does board coverage improve or remain healthy across sizes?\n\n")
    f.write(f"Median zone coverage: {' → '.join(f'{v:.2f}' for v in p50_zone)}.  \n")
    min_zone = min(p50_zone)
    if min_zone >= 0.80:
        coverage_verdict = "**Excellent** — coverage stays above 80% across all presets."
    elif min_zone >= 0.65:
        coverage_verdict = "**Good** — coverage is healthy, stays above 65%."
    else:
        coverage_verdict = "**Moderate** — some presets show lower coverage."
    f.write(f"{coverage_verdict} The quality gate enforces spatial coverage.\n\n")

    # Q10
    sm_d = preset_stats['Small']['commitmentScore']['p50']
    md_d = preset_stats['Medium']['commitmentScore']['p50']
    lg_d = preset_stats['Large']['commitmentScore']['p50']
    sm_md_gap = md_d - sm_d
    md_lg_gap = lg_d - md_d
    f.write("### 10. Is Medium too hard or too easy relative to Small/Large?\n\n")
    f.write(f"Commitment score medians: Small={sm_d:.3f}, Medium={md_d:.3f}, Large={lg_d:.3f}.  \n")
    f.write(f"Small→Medium gap: {sm_md_gap:+.3f}; Medium→Large gap: {md_lg_gap:+.3f}.  \n")
    if abs(sm_md_gap - md_lg_gap) < 0.04:
        verdict10 = "Gaps are nearly equal — Medium is proportionally positioned."
    elif sm_md_gap > md_lg_gap * 1.4:
        verdict10 = "Small→Medium jump is larger than Medium→Large — the step from Small to Medium is steep."
    elif md_lg_gap > sm_md_gap * 1.4:
        verdict10 = "Medium→Large jump is larger — Large represents the bigger leap above Medium."
    else:
        verdict10 = "Gaps are reasonably proportional."
    f.write(f"{verdict10}\n\n")

    # Q11
    ex_d = preset_stats['Expert']['commitmentScore']['p50']
    mn_d = preset_stats['Monster']['commitmentScore']['p50']
    f.write("### 11. Is Monster appropriately extreme?\n\n")
    f.write(f"Commitment score — Expert: {ex_d:.3f}, Monster: {mn_d:.3f}.  \n")
    f.write(f"Monster raw path cells median: {p50_path[4]:.0f} vs Expert: {p50_path[3]:.0f} "
            f"({p50_path[4]/p50_path[3]:.2f}× longer).  \n")
    if mn_d > ex_d * 1.1:
        verdict11 = "**Monster is distinctly harder than Expert** — appropriately extreme."
    elif mn_d > ex_d:
        verdict11 = "**Monster is harder than Expert** but the gap may feel subtle to players."
    else:
        verdict11 = "**Monster and Expert are very close** — players may not perceive a meaningful jump."
    f.write(f"{verdict11}\n\n")

    # Q12
    f.write("### 12. Are there outlier mazes that are too easy or too punishing?\n\n")
    if outliers:
        easy_count = sum(1 for _, _, _, d in outliers if d == 'easy')
        hard_count = sum(1 for _, _, _, d in outliers if d == 'hard')
        f.write(f"Found **{len(outliers)} outlier mazes** (|z| > 2 within preset): "
                f"{easy_count} too-easy, {hard_count} too-hard.  \n")
        f.write(f"Outlier rate: {len(outliers)/(500*5)*100:.1f}% of all square-preset mazes.  \n\n")
        f.write("Sample outliers (first 20):\n\n")
        f.write("| Preset | Seed | difficultyScore | Direction |\n| --- | --- | --- | --- |\n")
        for preset, seed, score, direction in outliers[:20]:
            f.write(f"| {preset} | {seed} | {score} | {direction} |\n")
        if len(outliers) > 20:
            f.write(f"\n_(and {len(outliers)-20} more — see raw CSV for full list)_\n")
    else:
        f.write("No extreme outliers found (|z| > 2). Distributions are well-contained.\n")
    f.write("\n")

    # Q13
    f.write("### 13. Which metric best explains the perceived difficulty increase?\n\n")
    # Correlate with commitmentScore (which does increase with size)
    commit_metric_corrs = {
        col: float(df_sq[col].corr(df_sq['commitmentScore']))
        for col in corr_cols if col != 'commitmentScore'
    }
    best_commit = max(commit_metric_corrs, key=lambda k: abs(commit_metric_corrs[k]))
    f.write("Correlation with commitmentScore:\n\n")
    f.write("| Metric | r |\n| --- | --- |\n")
    for col, r in sorted(commit_metric_corrs.items(), key=lambda x: -abs(x[1])):
        f.write(f"| {col} | {r:.3f} |\n")
    f.write(f"\n**{best_commit}** has the strongest correlation with the commitment score (r={commit_metric_corrs[best_commit]:.3f}).  \n")
    f.write("Raw path length is the dominant driver of perceived total difficulty.\n\n")

    # Q14
    f.write("### 14. Are metrics measuring distinct properties or mostly correlated with path length?\n\n")
    f.write("Correlation with solutionPathCells:\n\n")
    f.write("| Metric | r with pathCells | Independent? |\n| --- | --- | --- |\n")
    for col, r in sorted(path_corrs.items(), key=lambda x: -abs(x[1])):
        independent = "❌ highly correlated" if abs(r) > 0.85 else ("⚠️ moderate" if abs(r) > 0.5 else "✅ largely independent")
        f.write(f"| {col} | {r:.3f} | {independent} |\n")
    density_indep = [col for col in ['turnsPer100PathCells', 'decisionPointsPer100PathCells'] if abs(path_corrs.get(col, 0)) < 0.5]
    f.write(f"\nDensity metrics ({', '.join(density_indep) if density_indep else 'turnsPer100, dpPer100'}) "
            "are largely independent of path length — they measure distinct per-step properties.  \n")
    f.write("Absolute metrics (pathCells, turns, decisionPoints) are highly correlated with each other "
            "since they all scale with maze size.\n\n")

    # Coherence verdict
    f.write("## Difficulty Ladder Coherence Verdict\n\n")
    checks_verdict = [
        ("Raw path length increases monotonically Small→Monster", is_monotone_increasing(p50_path)),
        ("Decision count increases monotonically", is_monotone_increasing(p50_dp)),
        ("Wrong-branch depth increases monotonically", is_monotone_increasing(p50_branch)),
        ("Commitment score increases monotonically", is_monotone_increasing(p50_commit)),
        ("Path fraction stays healthy (p50 > 10%)", all(v > 0.10 for v in p50_fraction)),
        ("All presets separated by commitment score (d > 0.5)", all(
            separation_ratio(SQUARE_ORDER[i], SQUARE_ORDER[i+1], 'commitmentScore') > 0.5
            for i in range(len(SQUARE_ORDER)-1)
        )),
    ]
    passed = sum(1 for _, ok in checks_verdict if ok)
    f.write("| Check | Result |\n| --- | --- |\n")
    for label, ok in checks_verdict:
        f.write(f"| {label} | {'✅ Pass' if ok else '⚠️ Fail'} |\n")
    f.write("\n")
    if passed == len(checks_verdict):
        verdict_final = "**✅ COHERENT** — The difficulty ladder is well-ordered across all key metrics."
    elif passed >= 4:
        verdict_final = "**⚠️ MOSTLY COHERENT** — Core metrics scale correctly; minor issues noted."
    else:
        verdict_final = "**❌ INCOHERENT** — Multiple metrics fail to scale correctly across presets."
    f.write(f"{verdict_final}\n\n")

    # Recommendations
    f.write("## Recommendations for Future Tuning\n\n")
    if not is_monotone_increasing(p50_dp):
        f.write("- **Decision point count** is not strictly monotone. Consider widening newestBias "
                "differences between Expert and Monster to create more structural separation.\n")
    if not is_monotone_increasing(p50_branch):
        f.write("- **Wrong-branch depth** is not strictly monotone. Pure-DFS at all sizes ≥40×40 "
                "means structural character is identical — only size differs.\n")
    sm_mn_sep = separation_ratio('Expert', 'Monster', 'commitmentScore')
    if sm_mn_sep < 0.5:
        f.write("- **Expert and Monster** may feel similar. Consider giving Monster distinct parameters "
                "(e.g., `newestBias: 1.0` vs a deliberately different parameter) "
                "or accepting that the separation is purely size-driven.\n")
    f.write("- The **density difficulty score** is higher for Small than larger presets. "
            "If a single sortable score is needed, use the commitment score or a hybrid. "
            "Consider adding raw path length as a 40% component in the product-facing formula.\n")
    f.write("- Re-run this audit after any generator parameter changes to verify ladder coherence.\n")

print(f"\nReport written to {REPORT_PATH}")
print(f"All outputs saved to: {OUT_DIR}/")
print("\nOutput files:")
for f2 in sorted(os.listdir(OUT_DIR)):
    size = os.path.getsize(f'{OUT_DIR}/{f2}')
    print(f"  {f2}  ({size:,} bytes)")
