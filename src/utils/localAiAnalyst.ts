import type {
  CleaningRecommendation,
  ColumnPolicy,
  ColumnSchema,
  DatasetProfileReport,
  NLQueryResponse,
  RowData,
  TransformationLog,
} from '../types.ts';
import { executeDuckDBSQL } from './duckdbEngine.ts';
import { computeGroupAnalysis } from './profilerEngine.ts';
import { isMissingCellValue, parseStrictNumber } from './anomalyDetector.ts';

export interface StrategyGuideItem {
  strategy: string;
  bestFor: string;
  pros: string;
  cons: string;
}

export const CLEANING_STRATEGY_GUIDE: StrategyGuideItem[] = [
  {
    strategy: 'Median Imputation',
    bestFor: 'Skewed numeric columns or data with extreme spikes',
    pros: 'Resistant to outliers; preserves central tendency without distorting variance.',
    cons: 'Reduces spread slightly when missingness exceeds 25%.',
  },
  {
    strategy: 'Mean Imputation',
    bestFor: 'Symmetric, normally distributed numeric measurements',
    pros: 'Preserves the arithmetic sum and sample mean across the dataset.',
    cons: 'Easily pulled upward or downward by unclipped outliers.',
  },
  {
    strategy: 'Mode Imputation',
    bestFor: 'Categorical labels, statuses, and discrete flags',
    pros: 'Guarantees imputed values belong to valid existing categories.',
    cons: 'Over-represents the majority class if many rows are missing.',
  },
  {
    strategy: 'Forward / Backward Fill',
    bestFor: 'Chronological time-series logs and sensor feeds',
    pros: 'Preserves local temporal continuity and sequence ordering.',
    cons: 'Propagates stale values across long consecutive gaps.',
  },
  {
    strategy: 'Row Deletion (Drop Row)',
    bestFor: 'Missing critical IDs or heavily corrupted rows (<5% of data)',
    pros: 'Avoids inventing synthetic values where accuracy is strictly audited.',
    cons: 'Shrinks sample size and can introduce selection bias if missingness is MAR.',
  },
  {
    strategy: 'IQR & Modified Z-Score Capping',
    bestFor: 'Handling sensor spikes while keeping rows intact',
    pros: 'Retains record count while preventing spikes from skewing averages.',
    cons: 'Masks true extreme events unless flagged in the audit lineage.',
  },
];

export function generateCleaningRecommendations(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  profile: DatasetProfileReport
): CleaningRecommendation[] {
  const recs: CleaningRecommendation[] = [];

  if (profile.exactDuplicateRowCount > 0) {
    recs.push({
      id: `rec-duplicates`,
      columnName: 'All Columns',
      category: 'duplicate',
      title: `Remove ${profile.exactDuplicateRowCount} exact duplicate row${profile.exactDuplicateRowCount === 1 ? '' : 's'}`,
      explanation: `Found ${profile.duplicates.filter((d) => d.type === 'exact').length} duplicate row cluster(s) inflating record counts.`,
      strategyTradeoff: 'Keep First preserves earliest chronological records while removing redundant copies.',
      affectedRowsCount: profile.exactDuplicateRowCount,
      recommendedAction: 'Deduplicate keeping first occurrence',
      duplicateStrategy: 'keep_first',
      confidenceScore: 99,
      status: 'pending',
    });
  }

  schemas.forEach((col) => {
    const colProf = profile.columnProfiles[col.name];
    const policy = policies[col.name];
    if (!colProf || !policy) return;

    const isNumeric = colProf.detectedType === 'float' || colProf.detectedType === 'integer';

    if (colProf.missingCount > 0) {
      const skewed = colProf.skewness !== null && Math.abs(colProf.skewness) > 1.0;
      const recommendedNull =
        colProf.detectedType === 'date'
          ? 'forward_fill'
          : isNumeric
          ? skewed
            ? 'median'
            : 'median'
          : 'mode';

      recs.push({
        id: `rec-missing-${col.name}`,
        columnName: col.name,
        category: 'missing',
        title: `Impute ${colProf.missingCount} missing value${colProf.missingCount === 1 ? '' : 's'} in "${col.name}"`,
        explanation:
          colProf.detectedType === 'date'
            ? `${colProf.missingPct}% of dates are missing. Forward-fill or inferred median date preserves timeline continuity.`
            : isNumeric
            ? `${colProf.missingPct}% missing. ${skewed ? `Skewness (${colProf.skewness}) favors Median (${colProf.median}) over Mean (${colProf.mean}).` : `Column median (${colProf.median}) safely fills gaps without distorting range.`}`
            : `${colProf.missingPct}% missing. Mode imputation ("${colProf.mode}") restores valid category membership.`,
        strategyTradeoff: isNumeric
          ? 'Median avoids outlier distortion; Drop Row avoids synthetic values.'
          : 'Mode preserves distribution; Constant ("Unknown") isolates missingness explicitly.',
        affectedRowsCount: colProf.missingCount,
        recommendedAction: `Set Null Strategy -> ${recommendedNull.replace('_', ' ')}`,
        patchPolicy: { nullStrategy: recommendedNull },
        confidenceScore: 94,
        status: 'pending',
      });
    }

    if (isNumeric && colProf.anomalyCount > colProf.missingCount) {
      const outlierOnly = colProf.anomalyCount - colProf.missingCount;
      recs.push({
        id: `rec-outlier-${col.name}`,
        columnName: col.name,
        category: 'outlier',
        title: `Treat ${outlierOnly} numeric outlier${outlierOnly === 1 ? '' : 's'} in "${col.name}"`,
        explanation: `Values exceed statistical fences (Q1=${colProf.q1}, Q3=${colProf.q3}, MAD=${colProf.mad}). Winsorizing caps extreme spikes without deleting records.`,
        strategyTradeoff: 'IQR Cap retains rows; Modified Z-Score is stronger for skewed distributions; Flag-Only preserves raw anomalies.',
        affectedRowsCount: outlierOnly,
        recommendedAction: 'Apply Modified Z-Score / IQR Capping',
        patchPolicy: {
          outlierPolicy: colProf.skewness && Math.abs(colProf.skewness) > 1.5 ? 'modified_zscore_clip' : 'iqr_cap',
        },
        confidenceScore: 91,
        status: 'pending',
      });
    }

    if (colProf.detectedType === 'date' && colProf.consistencyIssues.some((i) => i.includes('Mixed date'))) {
      const affected = rows.filter((r) =>
        r.anomalyInfo?.cellAnomalies?.[col.name]?.types.includes('date_format')
      ).length;
      if (affected > 0) {
        recs.push({
          id: `rec-date-${col.name}`,
          columnName: col.name,
          category: 'date',
          title: `Standardize ${affected} inconsistent date formats in "${col.name}"`,
          explanation: `Detected mixed US, EU, or timestamp formats that break chronological sorting.`,
          strategyTradeoff: 'ISO 8601 (YYYY-MM-DD) ensures unambiguous sorting across databases and Excel.',
          affectedRowsCount: affected,
          recommendedAction: 'Normalize to ISO YYYY-MM-DD',
          patchPolicy: { dateTargetFormat: 'YYYY-MM-DD' },
          confidenceScore: 96,
          status: 'pending',
        });
      }
    }

    if ((colProf.detectedType === 'categorical' || colProf.detectedType === 'text') && colProf.anomalyCount > colProf.missingCount) {
      const typoAffected = colProf.anomalyCount - colProf.missingCount;
      recs.push({
        id: `rec-typo-${col.name}`,
        columnName: col.name,
        category: 'typo',
        title: `Standardize ${typoAffected} spelling/whitespace variant${typoAffected === 1 ? '' : 's'} in "${col.name}"`,
        explanation: `Detected casing mismatches, stray spaces, or typos matching canonical labels at >=${Math.round(policy.fuzzyThreshold * 100)}% similarity while protecting rare valid categories.`,
        strategyTradeoff: 'Higher fuzzy threshold (0.80+) prevents over-merging distinct rare labels.',
        affectedRowsCount: typoAffected,
        recommendedAction: 'Enable Whitespace Trim & Fuzzy Standardization',
        patchPolicy: { trimWhitespace: true, typoNormalization: true },
        confidenceScore: 92,
        status: 'pending',
      });
    }
  });

  return recs;
}

function escapeSqlIdent(col: string): string {
  return `"${col.replace(/"/g, '""')}"`;
}

function findMentionedColumns(question: string, schemas: ColumnSchema[]): ColumnSchema[] {
  const q = question.toLowerCase();
  const matches: ColumnSchema[] = [];
  for (const s of schemas) {
    const raw = s.name.toLowerCase();
    const spaced = raw.replace(/_/g, ' ');
    if (q.includes(raw) || q.includes(spaced)) {
      matches.push(s);
    }
  }
  return matches;
}

/**
 * 100% local deterministic NL-to-SQL and statistical analyst (zero API keys, zero network calls).
 */
export async function answerNaturalLanguageQuestion(
  question: string,
  rows: RowData[],
  schemas: ColumnSchema[],
  profile: DatasetProfileReport,
  useDuckDB: boolean
): Promise<NLQueryResponse> {
  const start = performance.now();
  const q = question.trim().toLowerCase();
  const id = `nlq-${Date.now()}`;
  const timestamp = new Date().toLocaleTimeString();
  const mentionedCols = findMentionedColumns(question, schemas);
  const profilesList = Object.values(profile.columnProfiles);

  // 1. Missing-value ranking question
  if (q.includes('missing') || q.includes('null') || q.includes('empty') || q.includes('incomplete')) {
    const sorted = [...profilesList].sort((a, b) => b.missingPct - a.missingPct);
    const top = sorted[0];
    const tableRows = sorted.map((p) => ({
      column: p.columnName,
      missing_count: p.missingCount,
      missing_pct: `${p.missingPct}%`,
      quality_score: p.qualityScore,
    }));

    return {
      id,
      question,
      answer:
        top && top.missingCount > 0
          ? `"${top.columnName}" has the highest missing-value rate at ${top.missingPct}% (${top.missingCount} of ${profile.rowCount} rows).`
          : `Zero missing values were found across all ${profile.columnCount} columns.`,
      columns: ['column', 'missing_count', 'missing_pct', 'quality_score'],
      rows: tableRows,
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      insights: [
        `Overall dataset completeness score is ${profile.completenessScore}/100.`,
      ],
      timestamp,
    };
  }

  // 2. Duplicate rows question
  if (q.includes('duplicate') || q.includes('repeated')) {
    return {
      id,
      question,
      answer:
        profile.exactDuplicateRowCount > 0
          ? `Found ${profile.exactDuplicateRowCount} exact duplicate row(s) across ${profile.duplicates.filter((d) => d.type === 'exact').length} cluster(s).`
          : 'No exact duplicate rows exist in the current dataset.',
      columns: ['cluster_type', 'row_indices', 'occurrences', 'preview'],
      rows: profile.duplicates.map((d) => ({
        cluster_type: d.type,
        row_indices: d.rowIndices.map((i) => i + 1).join(', '),
        occurrences: d.count,
        preview: d.preview,
      })),
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      insights: [`Dataset uniqueness score: ${profile.uniquenessScore}/100.`],
      timestamp,
    };
  }

  // 3. Correlation / relationship question
  if (q.includes('correlat') || q.includes('relationship') || q.includes('related')) {
    const pairs = profile.correlations.strongPairs;
    return {
      id,
      question,
      answer:
        pairs.length > 0
          ? `Strongest relationship is between "${pairs[0].colA}" and "${pairs[0].colB}" (Pearson r = ${pairs[0].r}, ${pairs[0].strength}).`
          : 'No strong linear correlations (|r| >= 0.35) were detected between numeric columns.',
      columns: ['column_a', 'column_b', 'pearson_r', 'strength'],
      rows: pairs.map((p) => ({
        column_a: p.colA,
        column_b: p.colB,
        pearson_r: p.r,
        strength: p.strength,
      })),
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      timestamp,
    };
  }

  // 4. Quality score / worst column / anomalies overview
  if (q.includes('quality') || q.includes('worst') || q.includes('issue') || q.includes('problem') || q.includes('anomal')) {
    const worst = [...profilesList].sort((a, b) => a.qualityScore - b.qualityScore);
    return {
      id,
      question,
      answer: `Overall dataset quality score is ${profile.overallQualityScore}/100. The lowest-scoring column is "${worst[0]?.columnName}" (${worst[0]?.qualityScore}/100, ${worst[0]?.anomalyCount} flagged cells).`,
      columns: ['column', 'semantic_role', 'quality_score', 'flagged_cells', 'missing_pct'],
      rows: worst.map((p) => ({
        column: p.columnName,
        semantic_role: p.semanticRole,
        quality_score: p.qualityScore,
        flagged_cells: p.anomalyCount,
        missing_pct: `${p.missingPct}%`,
      })),
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      insights: profile.businessInsights,
      timestamp,
    };
  }

  // 5. Group-By aggregation ("average X by Y", "total X per Y", "count by Y")
  if ((q.includes(' by ') || q.includes(' per ') || q.includes('each ')) && mentionedCols.length >= 1) {
    const catCol =
      mentionedCols.find((c) => profile.columnProfiles[c.name]?.detectedType === 'categorical' || c.type === 'categorical' || c.type === 'text') ||
      schemas.find((c) => profile.columnProfiles[c.name]?.detectedType === 'categorical');
    const numCol =
      mentionedCols.find((c) => profile.columnProfiles[c.name]?.detectedType === 'float' || profile.columnProfiles[c.name]?.detectedType === 'integer') ||
      schemas.find((c) => profile.columnProfiles[c.name]?.detectedType === 'float' || profile.columnProfiles[c.name]?.detectedType === 'integer');

    if (catCol && numCol) {
      const sql = `SELECT ${escapeSqlIdent(catCol.name)}, COUNT(*) AS records, ROUND(SUM(TRY_CAST(${escapeSqlIdent(numCol.name)} AS DOUBLE)), 2) AS total_${numCol.name}, ROUND(AVG(TRY_CAST(${escapeSqlIdent(numCol.name)} AS DOUBLE)), 2) AS avg_${numCol.name} FROM dataset GROUP BY ${escapeSqlIdent(catCol.name)} ORDER BY total_${numCol.name} DESC LIMIT 20;`;

      if (useDuckDB) {
        try {
          const res = await executeDuckDBSQL(sql, rows, schemas);
          return {
            id,
            question,
            answer: `Grouped "${numCol.name}" by "${catCol.name}" across ${res.rowCount} segment(s) using DuckDB-WASM SQL.`,
            generatedSQL: sql,
            columns: res.columns,
            rows: res.rows,
            durationMs: res.durationMs,
            timestamp,
          };
        } catch {
          // Fall back to local group compute
        }
      }

      const grouped = computeGroupAnalysis(rows, catCol.name, numCol.name);
      return {
        id,
        question,
        answer: `Grouped "${numCol.name}" by "${catCol.name}": top segment is "${grouped[0]?.group}" (total ${grouped[0]?.sum}, avg ${grouped[0]?.avg}).`,
        generatedSQL: sql,
        columns: ['group', 'count', 'sum', 'avg', 'min', 'max'],
        rows: grouped,
        durationMs: Math.round((performance.now() - start) * 10) / 10,
        timestamp,
      };
    }
  }

  // 6. Top / Highest / Lowest rows query
  if (q.includes('top') || q.includes('highest') || q.includes('largest') || q.includes('lowest') || q.includes('smallest') || q.includes('max') || q.includes('min')) {
    const numCol =
      mentionedCols.find((c) => profile.columnProfiles[c.name]?.detectedType === 'float' || profile.columnProfiles[c.name]?.detectedType === 'integer') ||
      schemas.find((c) => profile.columnProfiles[c.name]?.detectedType === 'float' || profile.columnProfiles[c.name]?.detectedType === 'integer');

    if (numCol) {
      const desc = !(q.includes('lowest') || q.includes('smallest') || q.includes('min'));
      const limitMatch = q.match(/\b(\d{1,2})\b/);
      const limit = limitMatch ? Math.min(50, Math.max(1, Number(limitMatch[1]))) : 10;
      const sql = `SELECT * FROM dataset ORDER BY TRY_CAST(${escapeSqlIdent(numCol.name)} AS DOUBLE) ${desc ? 'DESC' : 'ASC'} NULLS LAST LIMIT ${limit};`;

      if (useDuckDB) {
        try {
          const res = await executeDuckDBSQL(sql, rows, schemas);
          return {
            id,
            question,
            answer: `Returned the ${desc ? 'highest' : 'lowest'} ${limit} records ordered by "${numCol.name}".`,
            generatedSQL: sql,
            columns: res.columns,
            rows: res.rows,
            durationMs: res.durationMs,
            timestamp,
          };
        } catch {
          // Fallback below
        }
      }

      const sorted = [...rows]
        .filter((r) => parseStrictNumber(r.data[numCol.name], true) !== null)
        .sort((a, b) => {
          const va = parseStrictNumber(a.data[numCol.name], true) ?? 0;
          const vb = parseStrictNumber(b.data[numCol.name], true) ?? 0;
          return desc ? vb - va : va - vb;
        })
        .slice(0, limit)
        .map((r) => r.data);

      return {
        id,
        question,
        answer: `Returned the ${desc ? 'highest' : 'lowest'} ${sorted.length} records ordered by "${numCol.name}".`,
        generatedSQL: sql,
        columns: schemas.map((s) => s.name),
        rows: sorted,
        durationMs: Math.round((performance.now() - start) * 10) / 10,
        timestamp,
      };
    }
  }

  // 7. Specific Column Statistics Inquiry
  if (mentionedCols.length === 1) {
    const colProf = profile.columnProfiles[mentionedCols[0].name];
    if (colProf) {
      return {
        id,
        question,
        answer: `Column "${colProf.columnName}" (${colProf.semanticRole}, type: ${colProf.detectedType}) has ${colProf.uniqueCount} unique values, ${colProf.missingPct}% missing, and a quality score of ${colProf.qualityScore}/100.${colProf.mean !== null ? ` Mean: ${colProf.mean}, Median: ${colProf.median}, StdDev: ${colProf.stdDev}.` : ` Top mode: "${colProf.mode}".`}`,
        columns: ['metric', 'value'],
        rows: [
          { metric: 'Semantic Role', value: colProf.semanticRole },
          { metric: 'Quality Score', value: `${colProf.qualityScore}/100` },
          { metric: 'Missing Rate', value: `${colProf.missingPct}% (${colProf.missingCount})` },
          { metric: 'Unique Values', value: colProf.uniqueCount },
          { metric: 'Mean / Median', value: colProf.mean !== null ? `${colProf.mean} / ${colProf.median}` : 'N/A' },
          { metric: 'Min / Max', value: `${colProf.min ?? 'N/A'} / ${colProf.max ?? 'N/A'}` },
        ],
        durationMs: Math.round((performance.now() - start) * 10) / 10,
        timestamp,
      };
    }
  }

  // 8. Default Executive Summary Answer
  return {
    id,
    question,
    answer: `This dataset contains ${profile.rowCount.toLocaleString()} rows across ${profile.columnCount} columns with an overall quality score of ${profile.overallQualityScore}/100 (Completeness ${profile.completenessScore}%, Validity ${profile.validityScore}%, Uniqueness ${profile.uniquenessScore}%). Try asking about missing values, duplicates, correlations, quality issues, or "average <metric> by <category>".`,
    insights: profile.businessInsights,
    durationMs: Math.round((performance.now() - start) * 10) / 10,
    timestamp,
  };
}

export function generateCleaningSummaryNarrative(
  beforeProfile: DatasetProfileReport | undefined,
  afterProfile: DatasetProfileReport,
  logs: TransformationLog[]
): string {
  const totalChanges = logs.length;
  const beforeScore = beforeProfile?.overallQualityScore ?? afterProfile.overallQualityScore;
  const delta = afterProfile.overallQualityScore - beforeScore;

  const byType: Record<string, number> = {};
  logs.forEach((l) => {
    byType[l.type] = (byType[l.type] || 0) + 1;
  });

  const parts: string[] = [];
  if (byType.missing) parts.push(`${byType.missing} missing values imputed`);
  if (byType.outlier) parts.push(`${byType.outlier} numeric outliers treated`);
  if (byType.date_format) parts.push(`${byType.date_format} dates standardized`);
  if (byType.typo) parts.push(`${byType.typo} typos/whitespace normalized`);
  if (byType.duplicate) parts.push(`${byType.duplicate} duplicate rows removed`);
  if (byType.validation) parts.push(`${byType.validation} constraint violations corrected`);

  if (totalChanges === 0) {
    return `No automated modifications have been committed yet. Current dataset quality stands at ${afterProfile.overallQualityScore}/100 across ${afterProfile.rowCount.toLocaleString()} rows.`;
  }

  return `Executed ${totalChanges.toLocaleString()} audited transformations (${parts.join(', ')}). Dataset quality score moved from ${beforeScore}/100 to ${afterProfile.overallQualityScore}/100 (${delta >= 0 ? '+' : ''}${delta} pts), with ${afterProfile.exactDuplicateRowCount} remaining duplicates and ${afterProfile.completenessScore}% completeness.`;
}
