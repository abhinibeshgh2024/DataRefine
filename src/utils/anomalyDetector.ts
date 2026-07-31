import { CellAnomalyInfo, ColumnSchema, CorruptionType, RowData } from '../types';

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const lenA = a.length;
  const lenB = b.length;

  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return matrix[lenA][lenB];
}

interface ColumnStats {
  mean: number;
  stdDev: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  modes: string[];
  modeCounts: Record<string, number>;
}

export function computeColumnStats(rows: RowData[], schema: ColumnSchema[]): Record<string, ColumnStats> {
  const statsMap: Record<string, ColumnStats> = {};

  schema.forEach((col) => {
    const rawValues = rows.map((r) => r.data[col.name]);

    if (col.type === 'numeric') {
      const numbers = rawValues
        .map((v) => Number(v))
        .filter((v) => !isNaN(v) && v !== null && v !== undefined)
        .sort((a, b) => a - b);

      if (numbers.length > 0) {
        const sum = numbers.reduce((acc, v) => acc + v, 0);
        const mean = sum / numbers.length;

        const variance = numbers.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numbers.length;
        const stdDev = Math.sqrt(variance);

        const median = getPercentile(numbers, 0.5);
        const q1 = getPercentile(numbers, 0.25);
        const q3 = getPercentile(numbers, 0.75);
        const iqr = q3 - q1;

        statsMap[col.name] = {
          mean,
          stdDev,
          median,
          q1,
          q3,
          iqr,
          modes: [],
          modeCounts: {},
        };
      }
    } else if (col.type === 'categorical' || col.type === 'text') {
      const freqMap: Record<string, number> = {};
      rawValues.forEach((v) => {
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          const s = String(v).trim();
          freqMap[s] = (freqMap[s] || 0) + 1;
        }
      });

      const sortedEntries = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);
      const topModes = sortedEntries.filter(([_, count]) => count >= 2).map(([val]) => val);

      statsMap[col.name] = {
        mean: 0,
        stdDev: 0,
        median: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        modes: topModes.length > 0 ? topModes : sortedEntries.map(([val]) => val),
        modeCounts: freqMap,
      };
    }
  });

  return statsMap;
}

function getPercentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = (sortedArray.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

export function analyzeAnomalies(rows: RowData[], schema: ColumnSchema[]): RowData[] {
  const stats = computeColumnStats(rows, schema);

  return rows.map((row) => {
    const cellAnomalies: Record<string, CellAnomalyInfo> = {};
    const flaggedCols: string[] = [];
    let totalCellScore = 0;

    schema.forEach((col) => {
      const val = row.data[col.name];
      const strVal = String(val ?? '').trim();
      const colStats = stats[col.name];

      let isAnomaly = false;
      const detectedTypes: CorruptionType[] = [];
      let cellScore = 0;
      let reason = '';
      let suggestedFix: any = undefined;

      // 1. Missing Check
      const isMissing =
        val === null ||
        val === undefined ||
        strVal === '' ||
        ['n/a', 'nan', 'null', 'undefined', '?', '-'].includes(strVal.toLowerCase());

      if (isMissing) {
        isAnomaly = true;
        detectedTypes.push('missing');
        cellScore = 90;
        reason = 'Missing or placeholder value detected';
        if (col.type === 'numeric' && colStats) {
          suggestedFix = colStats.median;
        } else if (colStats?.modes && colStats.modes.length > 0) {
          suggestedFix = colStats.modes[0];
        }
      } else if (col.type === 'numeric' && colStats) {
        // 2. Outlier Check
        const numVal = Number(val);
        if (isNaN(numVal)) {
          isAnomaly = true;
          detectedTypes.push('missing');
          cellScore = 85;
          reason = 'Non-numeric string in numeric column';
          suggestedFix = colStats.median;
        } else {
          const zScore = colStats.stdDev > 0 ? Math.abs((numVal - colStats.mean) / colStats.stdDev) : 0;
          const isIQROutlier =
            colStats.iqr > 0 && (numVal < colStats.q1 - 1.5 * colStats.iqr || numVal > colStats.q3 + 1.5 * colStats.iqr);

          if (zScore > 2.5 || isIQROutlier) {
            isAnomaly = true;
            detectedTypes.push('outlier');
            cellScore = Math.min(100, Math.round(50 + zScore * 10));
            reason = `Numeric outlier (Z-Score: ${zScore.toFixed(1)}, Range: [${colStats.q1.toFixed(1)} - ${colStats.q3.toFixed(1)}])`;
            suggestedFix = colStats.median;
          }
        }
      } else if (col.type === 'date') {
        // 3. Date Format Check (Expect YYYY-MM-DD standard)
        const isStandardISO = /^\d{4}-\d{2}-\d{2}$/.test(strVal);
        if (!isStandardISO) {
          isAnomaly = true;
          detectedTypes.push('date_format');
          cellScore = 75;
          reason = `Non-standard date format: "${strVal}"`;
        }
      } else if (col.type === 'categorical' && colStats && colStats.modes.length > 0) {
        // 4. Typo / Categorical check
        const isExactMode = colStats.modes.includes(strVal);

        if (!isExactMode) {
          // Find closest mode by Levenshtein distance or case-insensitive match
          let minDistance = 999;
          let closestMode = colStats.modes[0];

          for (const mode of colStats.modes) {
            if (mode.toLowerCase() === strVal.toLowerCase()) {
              minDistance = 0;
              closestMode = mode;
              break;
            }
            const dist = levenshteinDistance(strVal.toLowerCase(), mode.toLowerCase());
            if (dist < minDistance) {
              minDistance = dist;
              closestMode = mode;
            }
          }

          if (minDistance === 0) {
            // Just case mismatch
            isAnomaly = true;
            detectedTypes.push('typo');
            cellScore = 40;
            reason = `Inconsistent casing (matches mode "${closestMode}")`;
            suggestedFix = closestMode;
          } else if (minDistance <= 3 || strVal.length < 3) {
            isAnomaly = true;
            detectedTypes.push('typo');
            cellScore = 70;
            reason = `Suspected typo (Levenshtein dist ${minDistance} to "${closestMode}")`;
            suggestedFix = closestMode;
          }
        }
      }

      if (isAnomaly) {
        flaggedCols.push(col.name);
        totalCellScore += cellScore;
      }

      cellAnomalies[col.name] = {
        isAnomaly,
        types: detectedTypes,
        score: cellScore,
        reason,
        suggestedFix,
      };
    });

    const totalScore = Math.min(100, Math.round(totalCellScore / Math.sqrt(schema.length || 1)));

    let riskLevel: 'clean' | 'low' | 'medium' | 'high' = 'clean';
    if (totalScore > 60) riskLevel = 'high';
    else if (totalScore > 30) riskLevel = 'medium';
    else if (totalScore > 5) riskLevel = 'low';

    return {
      ...row,
      anomalyInfo: {
        totalScore,
        riskLevel,
        flaggedColumns: flaggedCols,
        cellAnomalies,
      },
    };
  });
}
