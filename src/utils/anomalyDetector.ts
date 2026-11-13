import type { CellAnomalyInfo, ColumnPolicy, ColumnSchema, CorruptionType, RowData } from '../types.ts';

export const MISSING_TOKENS = new Set(['', 'n/a', 'na', 'nan', 'null', 'undefined', 'none', '?', '-', '--']);

export function isMissingCellValue(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'number') return !Number.isFinite(val);
  const str = String(val).trim().toLowerCase();
  return MISSING_TOKENS.has(str);
}

/**
 * Strictly parses finite numbers without converting empty strings or nulls into 0.
 * Handles optional currency/comma/percentage strings cleanly when parseFormatted is true.
 */
export function parseStrictNumber(val: any, parseFormatted = false): number | null {
  if (isMissingCellValue(val)) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  let str = String(val).trim();
  if (parseFormatted) {
    str = str.replace(/[$€£¥,\s]/g, '').replace(/%$/, '');
  }
  if (str === '' || isNaN(Number(str))) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

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
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[lenA][lenB];
}

export function computeStringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(s1, s2);
  return 1 - dist / maxLen;
}

export interface ColumnStats {
  mean: number;
  stdDev: number;
  median: number;
  mad: number;
  q1: number;
  q3: number;
  iqr: number;
  p01: number;
  p99: number;
  min: number;
  max: number;
  sampleSize: number;
  modes: string[];
  canonicalModes: string[];
  modeCounts: Record<string, number>;
}

function getEffectiveType(
  col: ColumnSchema,
  policy?: ColumnPolicy
): 'numeric' | 'date' | 'categorical' | 'text' | 'boolean' | 'id' {
  if (!policy) return col.type;
  if (policy.enforcedType === 'float' || policy.enforcedType === 'integer') return 'numeric';
  return policy.enforcedType;
}

export function getPercentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = (sortedArray.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

export function computeColumnStats(
  rows: RowData[],
  schema: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>
): Record<string, ColumnStats> {
  const statsMap: Record<string, ColumnStats> = {};

  schema.forEach((col) => {
    const effectiveType = getEffectiveType(col, policies?.[col.name]);
    const rawValues = rows.map((r) => r.data[col.name]);

    if (effectiveType === 'numeric') {
      const numbers = rawValues
        .map((v) => parseStrictNumber(v, false))
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);

      if (numbers.length > 0) {
        const sum = numbers.reduce((acc, v) => acc + v, 0);
        const mean = sum / numbers.length;
        const variance = numbers.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numbers.length;
        const stdDev = Math.sqrt(variance);
        const median = getPercentile(numbers, 0.5);
        const absDevs = numbers.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
        const mad = getPercentile(absDevs, 0.5);
        const q1 = getPercentile(numbers, 0.25);
        const q3 = getPercentile(numbers, 0.75);
        const iqr = q3 - q1;
        const p01 = getPercentile(numbers, 0.01);
        const p99 = getPercentile(numbers, 0.99);

        statsMap[col.name] = {
          mean,
          stdDev,
          median,
          mad,
          q1,
          q3,
          iqr,
          p01,
          p99,
          min: numbers[0],
          max: numbers[numbers.length - 1],
          sampleSize: numbers.length,
          modes: [],
          canonicalModes: [],
          modeCounts: {},
        };
      }
    } else if (effectiveType === 'categorical' || effectiveType === 'text' || effectiveType === 'boolean') {
      const freqMap: Record<string, number> = {};
      let validCount = 0;

      rawValues.forEach((v) => {
        if (!isMissingCellValue(v)) {
          const s = String(v).trim();
          freqMap[s] = (freqMap[s] || 0) + 1;
          validCount++;
        }
      });

      const sortedEntries = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);
      const minCanonicalFreq = Math.max(2, Math.floor(validCount * 0.03));
      const canonicalModes = sortedEntries
        .filter(([_, count]) => count >= minCanonicalFreq)
        .map(([val]) => val);

      statsMap[col.name] = {
        mean: 0,
        stdDev: 0,
        median: 0,
        mad: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        p01: 0,
        p99: 0,
        min: 0,
        max: 0,
        sampleSize: validCount,
        modes: sortedEntries.map(([val]) => val),
        canonicalModes:
          canonicalModes.length > 0
            ? canonicalModes
            : sortedEntries.filter(([_, c]) => c >= 2).map(([val]) => val),
        modeCounts: freqMap,
      };
    }
  });

  return statsMap;
}

export function analyzeAnomalies(
  rows: RowData[],
  schema: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>
): RowData[] {
  const stats = computeColumnStats(rows, schema, policies);

  return rows.map((row) => {
    const cellAnomalies: Record<string, CellAnomalyInfo> = {};
    const flaggedCols: string[] = [];
    let totalCellScore = 0;

    schema.forEach((col) => {
      const policy = policies?.[col.name];
      const effectiveType = getEffectiveType(col, policy);
      const val = row.data[col.name];
      const rawStr = val === null || val === undefined ? '' : String(val);
      const strVal = rawStr.trim();
      const colStats = stats[col.name];

      let isAnomaly = false;
      const detectedTypes: CorruptionType[] = [];
      let cellScore = 0;
      let reason = '';
      let aiExplanation = '';
      let detectionRule = '';
      let confidenceScore = 95;
      let suggestedFix: any = undefined;

      // 1. Missing Value Detection
      if (isMissingCellValue(val)) {
        isAnomaly = true;
        detectedTypes.push('missing');
        cellScore = 88;
        detectionRule = effectiveType === 'numeric' ? 'Missing Numeric' : `Missing ${effectiveType.toUpperCase()}`;
        reason = 'Missing or placeholder value detected';
        aiExplanation = `This cell in "${col.name}" is empty or contains a placeholder token ("${rawStr || 'NULL'}").`;

        if (effectiveType === 'numeric' && colStats) {
          suggestedFix =
            policy?.enforcedType === 'integer'
              ? Math.round(colStats.median)
              : Number(colStats.median.toFixed(2));
          confidenceScore = Math.min(98, Math.max(76, Math.round(78 + Math.min(20, colStats.sampleSize / 5))));
        } else if (colStats?.modes && colStats.modes.length > 0) {
          suggestedFix = colStats.modes[0];
          const topCount = colStats.modeCounts[colStats.modes[0]] || 1;
          confidenceScore = Math.min(
            97,
            Math.max(72, Math.round(68 + (topCount / Math.max(1, colStats.sampleSize)) * 30))
          );
        }
      } else if (effectiveType === 'numeric' && colStats) {
        // 2. Numeric Validation, Bounds & Outlier Detection (Low false-positive design)
        const strictNum = parseStrictNumber(val, false);
        const formattedNum = strictNum === null ? parseStrictNumber(val, true) : strictNum;

        if (strictNum === null && formattedNum !== null) {
          isAnomaly = true;
          detectedTypes.push('validation');
          cellScore = 55;
          detectionRule = 'Formatted Numeric String';
          reason = `Value "${strVal}" contains currency/percent symbols or commas`;
          aiExplanation = `"${strVal}" is a formatted numeric string that will fail strict numeric math unless normalized to ${formattedNum}.`;
          suggestedFix =
            policy?.enforcedType === 'integer'
              ? Math.round(formattedNum)
              : Number(formattedNum.toFixed(2));
          confidenceScore = 98;
        } else if (strictNum === null) {
          isAnomaly = true;
          detectedTypes.push('missing');
          cellScore = 85;
          detectionRule = 'Numeric Type Violation';
          reason = `Non-numeric text "${strVal}" in ${policy?.enforcedType || 'numeric'} column`;
          aiExplanation = `Expected a numeric value in "${col.name}", but encountered text "${strVal}".`;
          suggestedFix =
            policy?.enforcedType === 'integer'
              ? Math.round(colStats.median)
              : Number(colStats.median.toFixed(2));
          confidenceScore = 96;
        } else {
          // User-defined validation bounds
          const violatesNonNeg = Boolean(policy?.nonNegative && strictNum < 0);
          const violatesMin = policy?.minBound !== null && policy?.minBound !== undefined && strictNum < policy.minBound;
          const violatesMax = policy?.maxBound !== null && policy?.maxBound !== undefined && strictNum > policy.maxBound;

          if (violatesNonNeg || violatesMin || violatesMax) {
            isAnomaly = true;
            detectedTypes.push('validation');
            cellScore = 82;
            detectionRule = violatesNonNeg
              ? 'Non-Negative Constraint Violation'
              : `Range Bound Violation [${policy?.minBound ?? '-∞'}, ${policy?.maxBound ?? '+∞'}]`;
            reason = `Value ${strictNum} violates configured numeric constraint`;
            aiExplanation = `${strictNum} falls outside the allowed domain constraints defined for "${col.name}".`;
            suggestedFix =
              violatesNonNeg && strictNum < 0
                ? 0
                : violatesMin && policy?.minBound !== null && policy?.minBound !== undefined
                ? policy.minBound
                : policy?.maxBound;
            confidenceScore = 99;
          } else if (policy?.enforcedType === 'integer' && !Number.isInteger(strictNum)) {
            isAnomaly = true;
            detectedTypes.push('outlier');
            cellScore = 45;
            detectionRule = 'Integer Precision Enforcement';
            reason = `Decimal value (${strictNum}) violates enforced Integer schema`;
            aiExplanation = `"${col.name}" enforces whole integers, so ${strictNum} should be rounded to ${Math.round(strictNum)}.`;
            suggestedFix = Math.round(strictNum);
            confidenceScore = 99;
          } else if (colStats.sampleSize >= 8) {
            // Statistical outlier detection using MAD Modified Z-score + IQR + Standard Z-score
            const iqrMult = policy?.iqrMultiplier ?? 1.5;
            const zThresh = policy?.zScoreThreshold ?? 2.5;
            const modZThresh = policy?.modifiedZThreshold ?? 3.5;

            const zScore = colStats.stdDev > 0 ? Math.abs((strictNum - colStats.mean) / colStats.stdDev) : 0;
            const modifiedZ = colStats.mad > 0 ? Math.abs((0.6745 * (strictNum - colStats.median)) / colStats.mad) : 0;

            // Prevent IQR false positives when IQR === 0 (concentrated discrete columns like quantity=1..5)
            const hasSpreadIQR = colStats.iqr > 0;
            const outsideIQR =
              hasSpreadIQR &&
              (strictNum < colStats.q1 - iqrMult * colStats.iqr ||
                strictNum > colStats.q3 + iqrMult * colStats.iqr);

            const isSevereZ = zScore > zThresh;
            const isModZOutlier = colStats.mad > 0 ? modifiedZ > modZThresh : isSevereZ;

            // Require corroborating evidence to distinguish genuine rare values from true errors
            const isTrueOutlier =
              policy?.outlierPolicy === 'zscore_clip'
                ? isSevereZ
                : policy?.outlierPolicy === 'modified_zscore_clip'
                ? isModZOutlier
                : policy?.outlierPolicy === 'percentile_cap'
                ? strictNum < colStats.p01 || strictNum > colStats.p99
                : (outsideIQR && (isModZOutlier || isSevereZ)) || zScore > Math.max(3.5, zThresh + 0.8);

            if (isTrueOutlier) {
              isAnomaly = true;
              detectedTypes.push('outlier');
              cellScore = Math.min(100, Math.round(52 + Math.max(zScore, modifiedZ) * 8));
              detectionRule =
                colStats.mad > 0 && modifiedZ > modZThresh
                  ? `Modified Z-Score (${modifiedZ.toFixed(1)} > ${modZThresh})`
                  : outsideIQR
                  ? `IQR Fence (${iqrMult}x IQR)`
                  : `Z-Score Deviation (${zScore.toFixed(1)}σ)`;
              reason = `Statistical outlier (Z=${zScore.toFixed(1)}, Mod-Z=${modifiedZ.toFixed(1)}, IQR=[${colStats.q1.toFixed(1)}–${colStats.q3.toFixed(1)}])`;
              aiExplanation = `Value ${strictNum} deviates sharply from the column median (${colStats.median.toFixed(2)}) with Modified Z-score ${modifiedZ.toFixed(1)}, indicating a likely spike or entry error rather than normal variation.`;

              const upper = hasSpreadIQR
                ? colStats.q3 + iqrMult * colStats.iqr
                : colStats.mean + zThresh * colStats.stdDev;
              const lower = hasSpreadIQR
                ? colStats.q1 - iqrMult * colStats.iqr
                : colStats.mean - zThresh * colStats.stdDev;
              const capped = strictNum > upper ? upper : strictNum < lower ? lower : colStats.median;
              suggestedFix =
                policy?.enforcedType === 'integer' ? Math.round(capped) : Number(capped.toFixed(2));
              confidenceScore = Math.min(99, Math.max(82, Math.round(80 + Math.min(19, Math.max(zScore, modifiedZ) * 2))));
            }
          }
        }
      } else if (effectiveType === 'boolean') {
        const validBool = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(strVal.toLowerCase());
        if (!validBool) {
          isAnomaly = true;
          detectedTypes.push('validation');
          cellScore = 70;
          detectionRule = 'Boolean Domain Violation';
          reason = `Unexpected boolean token "${strVal}"`;
          aiExplanation = `"${col.name}" expects a Boolean flag (true/false), but received "${strVal}".`;
          suggestedFix = colStats?.modes?.[0] || 'false';
          confidenceScore = 88;
        }
      } else if (effectiveType === 'date') {
        const targetFormat = policy?.dateTargetFormat ?? 'YYYY-MM-DD';
        const targetRegex =
          targetFormat === 'MM/DD/YYYY'
            ? /^\d{2}\/\d{2}\/\d{4}$/
            : targetFormat === 'DD-MM-YYYY'
            ? /^\d{2}-\d{2}-\d{4}$/
            : /^\d{4}-\d{2}-\d{2}$/;

        if (!targetRegex.test(strVal) || rawStr !== strVal) {
          isAnomaly = true;
          detectedTypes.push('date_format');
          cellScore = 74;
          detectionRule = `Date Format Drift (Expected ${targetFormat})`;
          reason = `Non-standard date format: "${rawStr}"`;
          aiExplanation = `Date "${rawStr}" does not match the target "${targetFormat}" format required for consistent time-series sorting.`;
          confidenceScore = 94;
        }
      } else if ((effectiveType === 'categorical' || effectiveType === 'text') && colStats) {
        const hasStrayWhitespace = rawStr !== strVal || /\s{2,}/.test(strVal);

        // User-defined Regex / Allowed Values validation
        if (policy?.allowedValues && policy.allowedValues.length > 0 && !policy.allowedValues.includes(strVal)) {
          isAnomaly = true;
          detectedTypes.push('validation');
          cellScore = 72;
          detectionRule = 'Allowed Enum Constraint';
          reason = `"${strVal}" is not in allowed category list`;
          aiExplanation = `"${strVal}" does not match any of the approved values (${policy.allowedValues.slice(0, 4).join(', ')}).`;
          confidenceScore = 96;
        } else if (policy?.regexPattern && policy.regexPattern.trim() !== '') {
          try {
            const re = new RegExp(policy.regexPattern);
            if (!re.test(strVal)) {
              isAnomaly = true;
              detectedTypes.push('validation');
              cellScore = 72;
              detectionRule = `Regex Pattern Mismatch`;
              reason = `"${strVal}" fails pattern /${policy.regexPattern}/`;
              aiExplanation = `Value "${strVal}" does not conform to the column's required regex pattern.`;
              confidenceScore = 98;
            }
          } catch {
            // Invalid regex ignored safely
          }
        }

        if (!isAnomaly && effectiveType === 'categorical' && colStats.canonicalModes.length > 0) {
          const isExactCanonical = colStats.canonicalModes.includes(strVal);
          const threshold = policy?.fuzzyThreshold ?? 0.75;

          if (!isExactCanonical) {
            let bestSimilarity = 0;
            let closestMode = colStats.canonicalModes[0];

            for (const mode of colStats.canonicalModes) {
              const sim = computeStringSimilarity(strVal, mode);
              if (sim > bestSimilarity) {
                bestSimilarity = sim;
                closestMode = mode;
              }
            }

            // Protect rare legitimate categories: only flag as typo if similarity >= user's fuzzyThreshold
            if (bestSimilarity === 1 && strVal !== closestMode) {
              isAnomaly = true;
              detectedTypes.push('typo');
              cellScore = 40;
              detectionRule = hasStrayWhitespace ? 'Whitespace & Case Normalization' : 'Case Inconsistency';
              reason = `Inconsistent casing or spacing (matches "${closestMode}")`;
              aiExplanation = `"${rawStr}" matches canonical category "${closestMode}" once normalized for case and extra spaces.`;
              suggestedFix = closestMode;
              confidenceScore = 99;
            } else if (bestSimilarity >= threshold && bestSimilarity < 1) {
              isAnomaly = true;
              detectedTypes.push('typo');
              cellScore = 68;
              detectionRule = `Fuzzy Match (${Math.round(bestSimilarity * 100)}% >= ${Math.round(threshold * 100)}%)`;
              reason = `Likely typo (${Math.round(bestSimilarity * 100)}% similar to "${closestMode}")`;
              aiExplanation = `"${strVal}" is ${Math.round(bestSimilarity * 100)}% similar to established category "${closestMode}", exceeding your ${Math.round(threshold * 100)}% fuzzy threshold.`;
              suggestedFix = closestMode;
              confidenceScore = Math.round(bestSimilarity * 100);
            }
          } else if (hasStrayWhitespace) {
            isAnomaly = true;
            detectedTypes.push('typo');
            cellScore = 35;
            detectionRule = 'Stray Whitespace Pollution';
            reason = `Leading/trailing or repeated spaces around "${strVal}"`;
            aiExplanation = `Extra whitespace around "${strVal}" can split identical categories during grouping.`;
            suggestedFix = strVal.replace(/\s+/g, ' ');
            confidenceScore = 99;
          }
        } else if (!isAnomaly && hasStrayWhitespace) {
          isAnomaly = true;
          detectedTypes.push('typo');
          cellScore = 30;
          detectionRule = 'Stray Whitespace Pollution';
          reason = 'Leading/trailing or double whitespace detected';
          aiExplanation = 'Extra whitespace should be trimmed for clean text matching.';
          suggestedFix = strVal.replace(/\s+/g, ' ');
          confidenceScore = 99;
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
        aiExplanation,
        suggestedFix,
        confidenceScore,
        detectionRule,
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
