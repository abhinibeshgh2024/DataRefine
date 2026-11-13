import type {
  CategoryFrequency,
  ColumnPolicy,
  ColumnProfileReport,
  ColumnSchema,
  CorrelationMatrix,
  CorrelationPair,
  DatasetKPI,
  DatasetProfileReport,
  DuplicateCluster,
  EnforcedColumnType,
  HistogramBin,
  RowData,
  TrendSummary,
} from '../types.ts';
import { getPercentile, isMissingCellValue, parseStrictNumber } from './anomalyDetector.ts';
import { mapSchemaTypeToEnforced } from './policyEngine.ts';

export function inferSemanticRole(colName: string, type: EnforcedColumnType, samples: any[]): string {
  const n = colName.toLowerCase();
  if (type === 'id' || n === 'id' || n.endsWith('_id')) return 'Unique Identifier';
  if (type === 'date' || n.includes('date') || n.includes('time') || n.includes('timestamp'))
    return 'Temporal / Event Timestamp';
  if (type === 'boolean' || n.startsWith('is_') || n.startsWith('has_'))
    return 'Boolean State Flag';
  if (
    n.includes('price') ||
    n.includes('cost') ||
    n.includes('revenue') ||
    n.includes('spend') ||
    n.includes('amount') ||
    n.includes('rate') ||
    n.includes('salary')
  )
    return 'Financial / Monetary Metric';
  if (n.includes('country') || n.includes('region') || n.includes('city') || n.includes('state'))
    return 'Geographic Dimension';
  if (n.includes('bp') || n.includes('sugar') || n.includes('age') || n.includes('patient') || n.includes('temp'))
    return 'Clinical / Sensor Measurement';
  if (n.includes('qty') || n.includes('quantity') || n.includes('count') || n.includes('days') || n.includes('lots'))
    return 'Volume / Count Metric';
  if (type === 'categorical' || n.includes('status') || n.includes('tier') || n.includes('category') || n.includes('department'))
    return 'Categorical Segment';
  if (samples.some((s) => String(s).includes('@'))) return 'Contact / Email Attribute';
  if (type === 'float' || type === 'integer') return 'Quantitative Metric';
  return 'Descriptive Text Attribute';
}

function buildNumericHistogram(sortedNums: number[], binCount = 8): HistogramBin[] {
  if (sortedNums.length === 0) return [];
  const min = sortedNums[0];
  const max = sortedNums[sortedNums.length - 1];
  if (min === max) {
    return [{ bin: `${min.toFixed(1)}`, count: sortedNums.length }];
  }

  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * width;
    const end = start + width;
    return {
      bin: `${start.toFixed(1)}–${end.toFixed(1)}`,
      count: 0,
    };
  });

  for (const num of sortedNums) {
    let idx = Math.floor((num - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

export function detectDuplicates(
  rows: RowData[],
  schemas: ColumnSchema[],
  subsetColumns?: string[]
): { exactCount: number; clusters: DuplicateCluster[] } {
  const exactMap = new Map<string, number[]>();
  const allCols = schemas.map((s) => s.name);

  rows.forEach((r, idx) => {
    const key = allCols.map((c) => String(r.data[c] ?? '').trim().toLowerCase()).join('||');
    const arr = exactMap.get(key) || [];
    arr.push(idx);
    exactMap.set(key, arr);
  });

  const clusters: DuplicateCluster[] = [];
  let exactCount = 0;

  exactMap.forEach((indices, key) => {
    if (indices.length > 1) {
      exactCount += indices.length - 1;
      clusters.push({
        id: `dup-exact-${indices[0]}`,
        type: 'exact',
        keyColumns: allCols,
        rowIndices: indices,
        count: indices.length,
        preview: key.split('||').slice(0, 3).join(' · '),
      });
    }
  });

  if (subsetColumns && subsetColumns.length > 0 && subsetColumns.length < allCols.length) {
    const subMap = new Map<string, number[]>();
    rows.forEach((r, idx) => {
      const key = subsetColumns.map((c) => String(r.data[c] ?? '').trim().toLowerCase()).join('||');
      const arr = subMap.get(key) || [];
      arr.push(idx);
      subMap.set(key, arr);
    });

    subMap.forEach((indices, key) => {
      if (indices.length > 1) {
        clusters.push({
          id: `dup-sub-${indices[0]}`,
          type: 'subset',
          keyColumns: subsetColumns,
          rowIndices: indices,
          count: indices.length,
          preview: key.split('||').join(' · '),
        });
      }
    });
  }

  return { exactCount, clusters: clusters.slice(0, 50) };
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return 0;
  return Number((num / denom).toFixed(3));
}

export function computeCorrelationMatrix(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>
): CorrelationMatrix {
  const numericCols = schemas
    .filter((s) => {
      const p = policies?.[s.name];
      if (p) return p.enforcedType === 'float' || p.enforcedType === 'integer';
      return s.type === 'numeric';
    })
    .map((s) => s.name)
    .slice(0, 10);

  const matrix: number[][] = numericCols.map(() => numericCols.map(() => 0));
  const strongPairs: CorrelationPair[] = [];

  for (let i = 0; i < numericCols.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < numericCols.length; j++) {
      const colA = numericCols[i];
      const colB = numericCols[j];
      const xs: number[] = [];
      const ys: number[] = [];

      for (const r of rows) {
        const vx = parseStrictNumber(r.data[colA], true);
        const vy = parseStrictNumber(r.data[colB], true);
        if (vx !== null && vy !== null) {
          xs.push(vx);
          ys.push(vy);
        }
      }

      const rVal = pearsonCorrelation(xs, ys);
      matrix[i][j] = rVal;
      matrix[j][i] = rVal;

      const absR = Math.abs(rVal);
      if (absR >= 0.35) {
        const strength: CorrelationPair['strength'] =
          rVal >= 0.7
            ? 'Strong Positive'
            : rVal >= 0.35
            ? 'Moderate Positive'
            : rVal <= -0.7
            ? 'Strong Negative'
            : rVal <= -0.35
            ? 'Moderate Negative'
            : 'Weak';
        strongPairs.push({ colA, colB, r: rVal, strength });
      }
    }
  }

  strongPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return { columns: numericCols, matrix, strongPairs };
}

function detectTrends(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>
): TrendSummary[] {
  const dateCol = schemas.find((s) => {
    const p = policies?.[s.name];
    return p ? p.enforcedType === 'date' : s.type === 'date';
  });
  if (!dateCol || rows.length < 5) return [];

  const numericCols = schemas.filter((s) => {
    const p = policies?.[s.name];
    return p ? p.enforcedType === 'float' || p.enforcedType === 'integer' : s.type === 'numeric';
  });

  const trends: TrendSummary[] = [];

  for (const metric of numericCols.slice(0, 3)) {
    const paired: { ts: number; date: string; val: number }[] = [];
    for (const r of rows) {
      const rawDate = r.data[dateCol.name];
      const numVal = parseStrictNumber(r.data[metric.name], true);
      if (isMissingCellValue(rawDate) || numVal === null) continue;
      const ms = Date.parse(String(rawDate).trim());
      if (!isNaN(ms)) {
        paired.push({
          ts: ms,
          date: new Date(ms).toISOString().slice(0, 10),
          val: numVal,
        });
      }
    }

    if (paired.length < 5) continue;
    paired.sort((a, b) => a.ts - b.ts);

    // Aggregate by date for clean trend line
    const byDate = new Map<string, number[]>();
    paired.forEach((p) => {
      const list = byDate.get(p.date) || [];
      list.push(p.val);
      byDate.set(p.date, list);
    });

    const series = Array.from(byDate.entries()).map(([date, vals]) => ({
      date,
      value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
    }));

    if (series.length < 3) continue;

    // Simple linear regression slope across ordered points
    const n = series.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += series[i].value;
      sumXY += i * series[i].value;
      sumXX += i * i;
    }
    const meanY = sumY / n;
    const denom = n * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    const totalChangePct =
      meanY !== 0 ? Number((((slope * (n - 1)) / Math.abs(meanY)) * 100).toFixed(1)) : 0;

    const direction: TrendSummary['direction'] =
      totalChangePct > 5 ? 'increasing' : totalChangePct < -5 ? 'decreasing' : 'stable';

    // Downsample points to max 60 for chart clarity
    const step = Math.max(1, Math.floor(series.length / 60));
    const sampledPoints = series.filter((_, i) => i % step === 0 || i === series.length - 1);

    const avg = meanY;
    const std = Math.sqrt(
      series.reduce((acc, p) => acc + Math.pow(p.value - avg, 2), 0) / series.length
    );
    const anomaliesCount = std > 0 ? series.filter((p) => Math.abs(p.value - avg) > 2.5 * std).length : 0;

    trends.push({
      dateColumn: dateCol.name,
      metricColumn: metric.name,
      direction,
      slopePct: totalChangePct,
      anomaliesCount,
      points: sampledPoints,
    });
  }

  return trends;
}

export function generateDatasetProfile(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>,
  duplicateSubsetCols?: string[]
): DatasetProfileReport {
  const rowCount = rows.length;
  const columnCount = schemas.length;
  const columnProfiles: Record<string, ColumnProfileReport> = {};
  const consistencyAlerts: string[] = [];

  let totalMissingCells = 0;
  let totalAnomalyCells = 0;
  let totalConsistencyIssues = 0;

  const kpis: DatasetKPI[] = [];

  schemas.forEach((col) => {
    const policy = policies?.[col.name];
    const detectedType =
      policy?.enforcedType || mapSchemaTypeToEnforced(col.type, col.sampleValues);

    const rawValues = rows.map((r) => r.data[col.name]);
    const nonMissingValues = rawValues.filter((v) => !isMissingCellValue(v));
    const missingCount = rowCount - nonMissingValues.length;
    const missingPct = rowCount > 0 ? Number(((missingCount / rowCount) * 100).toFixed(1)) : 0;
    totalMissingCells += missingCount;

    const distinctSet = new Set(nonMissingValues.map((v) => String(v).trim()));
    const uniqueCount = distinctSet.size;

    const anomalyCount = rows.filter((r) => r.anomalyInfo?.cellAnomalies?.[col.name]?.isAnomaly).length;
    totalAnomalyCells += anomalyCount;

    const freqMap = new Map<string, number>();
    nonMissingValues.forEach((v) => {
      const s = String(v).trim();
      freqMap.set(s, (freqMap.get(s) || 0) + 1);
    });
    const sortedFreq = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
    const modeVal = sortedFreq.length > 0 ? sortedFreq[0][0] : null;

    const topCategories: CategoryFrequency[] = sortedFreq.slice(0, 8).map(([value, count]) => ({
      value,
      count,
      pct: nonMissingValues.length > 0 ? Number(((count / nonMissingValues.length) * 100).toFixed(1)) : 0,
    }));

    const consistencyIssues: string[] = [];
    let mean: number | null = null;
    let median: number | null = null;
    let stdDev: number | null = null;
    let mad: number | null = null;
    let min: number | string | null = null;
    let max: number | string | null = null;
    let q1: number | null = null;
    let q3: number | null = null;
    let iqr: number | null = null;
    let skewness: number | null = null;
    let histogram: HistogramBin[] = [];

    const isNumeric = detectedType === 'float' || detectedType === 'integer';
    if (isNumeric) {
      const nums = nonMissingValues
        .map((v) => parseStrictNumber(v, false))
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);

      const nonNumericInvalid = nonMissingValues.length - nums.length;
      if (nonNumericInvalid > 0) {
        consistencyIssues.push(`${nonNumericInvalid} non-numeric entries in numeric column`);
      }

      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        mean = Number((sum / nums.length).toFixed(2));
        const variance = nums.reduce((a, b) => a + Math.pow(b - mean!, 2), 0) / nums.length;
        stdDev = Number(Math.sqrt(variance).toFixed(2));
        median = Number(getPercentile(nums, 0.5).toFixed(2));
        const absDevs = nums.map((n) => Math.abs(n - median!)).sort((a, b) => a - b);
        mad = Number(getPercentile(absDevs, 0.5).toFixed(2));
        q1 = Number(getPercentile(nums, 0.25).toFixed(2));
        q3 = Number(getPercentile(nums, 0.75).toFixed(2));
        iqr = Number((q3 - q1).toFixed(2));
        min = nums[0];
        max = nums[nums.length - 1];
        if (stdDev > 0) {
          const m3 = nums.reduce((a, b) => a + Math.pow((b - mean!) / stdDev!, 3), 0) / nums.length;
          skewness = Number(m3.toFixed(2));
        } else {
          skewness = 0;
        }
        histogram = buildNumericHistogram(nums, 8);

        if (nums.some((n) => n < 0) && (col.name.toLowerCase().includes('price') || col.name.toLowerCase().includes('age') || col.name.toLowerCase().includes('qty') || col.name.toLowerCase().includes('quantity'))) {
          consistencyIssues.push('Negative values detected in non-negative domain column');
        }

        kpis.push({
          column: col.name,
          label: inferSemanticRole(col.name, detectedType, col.sampleValues),
          total: Number(sum.toFixed(2)),
          average: mean,
          median,
          spreadNote: `Range ${min} – ${max} (StdDev ${stdDev})`,
        });
      }
    } else {
      if (sortedFreq.length > 0) {
        min = sortedFreq[sortedFreq.length - 1][0];
        max = sortedFreq[0][0];
      }

      // Check whitespace & mixed casing consistency
      const whitespaceIssues = nonMissingValues.filter((v) => String(v) !== String(v).trim() || /\s{2,}/.test(String(v))).length;
      if (whitespaceIssues > 0) {
        consistencyIssues.push(`${whitespaceIssues} values contain stray whitespace`);
      }

      const lowerMap = new Map<string, Set<string>>();
      nonMissingValues.forEach((v) => {
        const s = String(v).trim();
        const low = s.toLowerCase();
        const set = lowerMap.get(low) || new Set<string>();
        set.add(s);
        lowerMap.set(low, set);
      });
      const casingVariants = Array.from(lowerMap.values()).filter((s) => s.size > 1).length;
      if (casingVariants > 0) {
        consistencyIssues.push(`${casingVariants} labels have inconsistent capitalization`);
      }

      if (detectedType === 'date') {
        const formats = new Set<string>();
        nonMissingValues.forEach((v) => {
          const s = String(v).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) formats.add('ISO');
          else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) formats.add('US');
          else if (/^\d{2}-\d{2}-\d{4}$/.test(s)) formats.add('EU');
          else if (/^\d{9,13}$/.test(s)) formats.add('Timestamp');
          else formats.add('TextDate');
        });
        if (formats.size > 1) {
          consistencyIssues.push(`Mixed date formats detected (${Array.from(formats).join(', ')})`);
        }
      }
    }

    totalConsistencyIssues += consistencyIssues.length;
    consistencyIssues.forEach((issue) => consistencyAlerts.push(`${col.name}: ${issue}`));

    const anomalyPct = rowCount > 0 ? (anomalyCount / rowCount) * 100 : 0;
    const colQuality = Math.max(
      0,
      Math.min(100, Math.round(100 - missingPct * 0.7 - anomalyPct * 0.5 - consistencyIssues.length * 4))
    );

    columnProfiles[col.name] = {
      columnName: col.name,
      semanticRole: inferSemanticRole(col.name, detectedType, col.sampleValues),
      detectedType,
      totalCount: rowCount,
      validCount: nonMissingValues.length,
      missingCount,
      missingPct,
      uniqueCount,
      mean,
      median,
      mode: modeVal,
      stdDev,
      mad,
      min,
      max,
      q1,
      q3,
      iqr,
      skewness,
      anomalyCount,
      qualityScore: colQuality,
      consistencyIssues,
      histogram,
      topCategories,
    };
  });

  const { exactCount, clusters } = detectDuplicates(rows, schemas, duplicateSubsetCols);
  const correlations = computeCorrelationMatrix(rows, schemas, policies);
  const trends = detectTrends(rows, schemas, policies);

  const totalCells = Math.max(1, rowCount * columnCount);
  const completenessScore = Math.max(0, Math.round(100 - (totalMissingCells / totalCells) * 100));
  const validityScore = Math.max(0, Math.round(100 - (totalAnomalyCells / totalCells) * 100));
  const uniquenessScore =
    rowCount > 0 ? Math.max(0, Math.round(100 - (exactCount / rowCount) * 100)) : 100;
  const consistencyScore = Math.max(0, Math.round(100 - totalConsistencyIssues * 5));

  const overallQualityScore = Math.round(
    completenessScore * 0.35 + validityScore * 0.35 + uniquenessScore * 0.15 + consistencyScore * 0.15
  );

  // Business insights generation
  const businessInsights: string[] = [];
  const profileArr = Object.values(columnProfiles);
  const worstMissing = [...profileArr].sort((a, b) => b.missingPct - a.missingPct)[0];
  if (worstMissing && worstMissing.missingCount > 0) {
    businessInsights.push(
      `"${worstMissing.columnName}" has the highest missing rate (${worstMissing.missingPct}%, ${worstMissing.missingCount} cells), making it the top completeness priority.`
    );
  }
  if (exactCount > 0) {
    businessInsights.push(
      `Detected ${exactCount} exact duplicate row${exactCount === 1 ? '' : 's'} that could inflate aggregate totals if left unmerged.`
    );
  }
  if (correlations.strongPairs.length > 0) {
    const topPair = correlations.strongPairs[0];
    businessInsights.push(
      `Strongest numeric relationship: "${topPair.colA}" and "${topPair.colB}" show a ${topPair.strength.toLowerCase()} correlation (r = ${topPair.r}).`
    );
  }
  if (trends.length > 0) {
    const topTrend = trends[0];
    businessInsights.push(
      `Over "${topTrend.dateColumn}", "${topTrend.metricColumn}" shows a ${topTrend.direction} trajectory (${topTrend.slopePct > 0 ? '+' : ''}${topTrend.slopePct}% net change).`
    );
  }
  const skewedCol = profileArr.find((p) => p.skewness !== null && Math.abs(p.skewness) > 1.2);
  if (skewedCol) {
    businessInsights.push(
      `"${skewedCol.columnName}" is skewed (skewness ${skewedCol.skewness}) — Median (${skewedCol.median}) is safer than Mean (${skewedCol.mean}) for imputation.`
    );
  }
  if (businessInsights.length === 0) {
    businessInsights.push(
      `Dataset passed completeness, uniqueness, and format consistency checks with an overall quality score of ${overallQualityScore}/100.`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    rowCount,
    columnCount,
    overallQualityScore,
    completenessScore,
    validityScore,
    uniquenessScore,
    consistencyScore,
    exactDuplicateRowCount: exactCount,
    columnProfiles,
    duplicates: clusters,
    correlations,
    trends,
    kpis,
    consistencyAlerts,
    businessInsights,
  };
}

export interface GroupAnalysisRow {
  group: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export function computeGroupAnalysis(
  rows: RowData[],
  groupColumn: string,
  metricColumn: string
): GroupAnalysisRow[] {
  const buckets = new Map<string, number[]>();

  for (const r of rows) {
    const rawGroup = r.data[groupColumn];
    const groupKey = isMissingCellValue(rawGroup) ? '(Missing)' : String(rawGroup).trim();
    const num = parseStrictNumber(r.data[metricColumn], true);
    if (num !== null) {
      const list = buckets.get(groupKey) || [];
      list.push(num);
      buckets.set(groupKey, list);
    }
  }

  return Array.from(buckets.entries())
    .map(([group, vals]) => {
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        group,
        count: vals.length,
        sum: Number(sum.toFixed(2)),
        avg: Number((sum / vals.length).toFixed(2)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    })
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 20);
}
