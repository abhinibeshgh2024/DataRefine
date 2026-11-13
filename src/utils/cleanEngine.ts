import type {
  AutoCleanConfig,
  CellLineageEntry,
  CleaningPreviewDiff,
  CleaningPreviewResult,
  ColumnPolicy,
  ColumnSchema,
  DuplicateResolutionStrategy,
  RowData,
  TextCaseMode,
  TransformationLog,
} from '../types.ts';
import {
  analyzeAnomalies,
  computeColumnStats,
  computeStringSimilarity,
  getPercentile,
  isMissingCellValue,
  parseStrictNumber,
} from './anomalyDetector.ts';
import { createDefaultPolicies } from './policyEngine.ts';

function formatNumericByPolicy(value: number, policy: ColumnPolicy): number {
  if (policy.enforcedType === 'integer') {
    return Math.round(value);
  }
  return Number(value.toFixed(2));
}

function applyTextCase(text: string, mode: TextCaseMode): string {
  if (mode === 'lower') return text.toLowerCase();
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'title') {
    return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return text;
}

function parseDateSafe(raw: string): { date: Date; confidence: number } | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (!isNaN(dt.getTime())) return { date: dt, confidence: 99 };
  }

  if (/^\d{9,13}$/.test(s)) {
    const num = Number(s);
    const ms = s.length === 10 ? num * 1000 : num;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) return { date: dt, confidence: 95 };
  }

  const parts = s.split(/[-/.\s]+/);
  if (parts.length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && parts[2].length === 4) {
    const d1 = Number(parts[0]);
    const d2 = Number(parts[1]);
    const yr = Number(parts[2]);
    if (d1 > 12 && d2 <= 12) {
      return { date: new Date(yr, d2 - 1, d1), confidence: 97 };
    }
    if (d2 > 12 && d1 <= 12) {
      return { date: new Date(yr, d1 - 1, d2), confidence: 97 };
    }
    return { date: new Date(yr, d1 - 1, d2), confidence: 78 };
  }

  const cleanedRaw = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
  const parsedMs = Date.parse(cleanedRaw);
  if (!isNaN(parsedMs)) {
    return { date: new Date(parsedMs), confidence: 93 };
  }
  return null;
}

function formatDateByTarget(
  dateObj: Date,
  targetFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY'
): string {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  if (targetFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  if (targetFormat === 'DD-MM-YYYY') return `${dd}-${mm}-${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes column-level date baseline (median date, forward, backward, or nearest valid date)
 * with zero hardcoded fallback dates unless the entire column has zero valid dates.
 */
function inferMissingDateValue(
  rows: RowData[],
  colName: string,
  rowIdx: number,
  policy: ColumnPolicy
): { formatted: string; method: string; confidence: number } {
  const targetFormat = policy.dateTargetFormat;

  const findNextValid = (): string | null => {
    for (let i = rowIdx + 1; i < rows.length; i++) {
      const v = rows[i].data[colName];
      if (!isMissingCellValue(v)) {
        const parsed = parseDateSafe(String(v));
        if (parsed) return formatDateByTarget(parsed.date, targetFormat);
      }
    }
    return null;
  };

  const findPrevValid = (): string | null => {
    for (let i = rowIdx - 1; i >= 0; i--) {
      const v = rows[i].data[colName];
      if (!isMissingCellValue(v)) {
        const parsed = parseDateSafe(String(v));
        if (parsed) return formatDateByTarget(parsed.date, targetFormat);
      }
    }
    return null;
  };

  if (policy.dateFallbackStrategy === 'custom' && policy.customDefaultValue.trim()) {
    const parsed = parseDateSafe(policy.customDefaultValue);
    return {
      formatted: parsed ? formatDateByTarget(parsed.date, targetFormat) : policy.customDefaultValue.trim(),
      method: `Custom Date Constant (${policy.customDefaultValue.trim()})`,
      confidence: 92,
    };
  }

  if (policy.dateFallbackStrategy === 'backward_fill' || policy.nullStrategy === 'backward_fill') {
    const next = findNextValid();
    if (next) return { formatted: next, method: `Date Backward-Fill (${next})`, confidence: 88 };
  }

  if (policy.dateFallbackStrategy === 'forward_fill' || policy.nullStrategy === 'forward_fill') {
    const prev = findPrevValid();
    if (prev) return { formatted: prev, method: `Date Forward-Fill (${prev})`, confidence: 89 };
  }

  if (policy.dateFallbackStrategy === 'nearest') {
    const prev = findPrevValid();
    if (prev) return { formatted: prev, method: `Nearest Neighbor Date (${prev})`, confidence: 87 };
    const next = findNextValid();
    if (next) return { formatted: next, method: `Nearest Neighbor Date (${next})`, confidence: 86 };
  }

  // Compute true column median timestamp
  const validTimestamps = rows
    .map((r) => r.data[colName])
    .filter((v) => !isMissingCellValue(v))
    .map((v) => parseDateSafe(String(v)))
    .filter((p): p is { date: Date; confidence: number } => p !== null)
    .map((p) => p.date.getTime())
    .sort((a, b) => a - b);

  if (validTimestamps.length > 0) {
    const medianTs = getPercentile(validTimestamps, 0.5);
    const formatted = formatDateByTarget(new Date(medianTs), targetFormat);
    return {
      formatted,
      method: `Inferred Column Median Date (${formatted})`,
      confidence: 86,
    };
  }

  const today = formatDateByTarget(new Date(), targetFormat);
  return {
    formatted: today,
    method: `Current ISO Date Fallback (${today})`,
    confidence: 65,
  };
}

export function runPolicyClean(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  actor: CellLineageEntry['actor'] = 'auto_clean'
): { cleanedRows: RowData[]; logs: TransformationLog[]; droppedRowCount: number } {
  const stats = computeColumnStats(rows, schemas, policies);
  const logs: TransformationLog[] = [];
  const now = new Date().toLocaleTimeString();
  const lastValidByCol: Record<string, any> = {};
  const cleanedRows: RowData[] = [];
  let droppedRowCount = 0;

  // Precompute sorted numeric values per numeric column for percentile capping
  const sortedNumericByCol: Record<string, number[]> = {};
  schemas.forEach((col) => {
    const p = policies[col.name];
    if (p && (p.enforcedType === 'float' || p.enforcedType === 'integer')) {
      sortedNumericByCol[col.name] = rows
        .map((r) => parseStrictNumber(r.data[col.name], true))
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
    }
  });

  // Helper to look ahead for backward-fill
  const findNextNonMissing = (colName: string, startIdx: number): any => {
    for (let i = startIdx + 1; i < rows.length; i++) {
      const candidate = rows[i].data[colName];
      if (!isMissingCellValue(candidate)) return candidate;
    }
    return undefined;
  };

  rows.forEach((row, rowIdx) => {
    const cleanedData = { ...row.data };
    const nextLineage: Record<string, CellLineageEntry[]> = { ...(row.cellLineage || {}) };
    let shouldDropRow = false;

    for (const col of schemas) {
      const policy = policies[col.name] || createDefaultPolicies([col])[col.name];
      const val = cleanedData[col.name];
      const colStats = stats[col.name];
      const missing = isMissingCellValue(val);
      const originalGroundTruth =
        row.corruptedMeta?.[col.name]?.originalValue !== undefined
          ? row.corruptedMeta[col.name].originalValue
          : val;

      const appendLineage = (
        type: TransformationLog['type'],
        beforeValue: any,
        afterValue: any,
        detectionRule: string,
        methodUsed: string,
        confidenceScore: number
      ) => {
        const entryId = `lin-${rowIdx}-${col.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const lineageEntry: CellLineageEntry = {
          id: entryId,
          timestamp: now,
          actor,
          originalValue:
            originalGroundTruth === null || originalGroundTruth === undefined || originalGroundTruth === ''
              ? 'NULL'
              : String(originalGroundTruth),
          beforeValue:
            beforeValue === null || beforeValue === undefined || beforeValue === ''
              ? 'NULL'
              : String(beforeValue),
          afterValue: afterValue === null || afterValue === undefined ? 'NULL' : String(afterValue),
          detectionRule,
          actionTaken: methodUsed,
          confidenceScore,
          policyApplied: `${policy.enforcedType.toUpperCase()} / ${policy.nullStrategy}`,
        };

        nextLineage[col.name] = [...(nextLineage[col.name] || []), lineageEntry];

        logs.push({
          id: entryId,
          rowIndex: rowIdx + 1,
          rowId: row._id,
          column: col.name,
          type,
          actor,
          originalValue: lineageEntry.originalValue,
          beforeValue: lineageEntry.beforeValue,
          afterValue: lineageEntry.afterValue,
          detectionRule,
          methodUsed,
          confidenceScore,
          timestamp: now,
        });
      };

      const isNumericPolicy = policy.enforcedType === 'float' || policy.enforcedType === 'integer';

      // 1. Missing Value Strategies (7 strategies)
      if (missing) {
        if (policy.nullStrategy === 'drop_row') {
          shouldDropRow = true;
          logs.push({
            id: `drop-${rowIdx}-${col.name}-${Date.now()}`,
            rowIndex: rowIdx + 1,
            rowId: row._id,
            column: col.name,
            type: 'missing',
            actor,
            originalValue: String(originalGroundTruth ?? 'NULL'),
            beforeValue: val === null || val === undefined || val === '' ? 'NULL' : String(val),
            afterValue: 'ROW DROPPED',
            detectionRule: `Missing ${policy.enforcedType.toUpperCase()}`,
            methodUsed: 'Row Deletion (Drop Row)',
            confidenceScore: 100,
            timestamp: now,
          });
          break;
        }

        let replacement: any = val;
        let method = '';
        let confidence = 90;

        if (policy.nullStrategy === 'zero_fill') {
          replacement = isNumericPolicy ? 0 : '0';
          method = 'Zero-Fill Imputation (0)';
          confidence = 85;
        } else if (policy.nullStrategy === 'forward_fill') {
          if (lastValidByCol[col.name] !== undefined) {
            replacement = lastValidByCol[col.name];
            method = `Forward-Fill (${replacement})`;
            confidence = 91;
          } else {
            const nextVal = findNextNonMissing(col.name, rowIdx);
            if (nextVal !== undefined) {
              replacement = nextVal;
              method = `Forward-Fill Fallback to Next Valid (${replacement})`;
              confidence = 84;
            } else if (isNumericPolicy && colStats) {
              replacement = formatNumericByPolicy(colStats.median, policy);
              method = `Forward-Fill Fallback to Median (${replacement})`;
              confidence = 82;
            } else {
              replacement = policy.customDefaultValue || 'Unknown';
              method = `Forward-Fill Constant Fallback (${replacement})`;
              confidence = 75;
            }
          }
        } else if (policy.nullStrategy === 'backward_fill') {
          const nextVal = findNextNonMissing(col.name, rowIdx);
          if (nextVal !== undefined) {
            replacement = nextVal;
            method = `Backward-Fill (${replacement})`;
            confidence = 90;
          } else if (lastValidByCol[col.name] !== undefined) {
            replacement = lastValidByCol[col.name];
            method = `Backward-Fill Fallback to Prev (${replacement})`;
            confidence = 84;
          } else if (isNumericPolicy && colStats) {
            replacement = formatNumericByPolicy(colStats.median, policy);
            method = `Backward-Fill Fallback to Median (${replacement})`;
            confidence = 82;
          } else {
            replacement = policy.customDefaultValue || 'Unknown';
            method = `Backward-Fill Constant Fallback (${replacement})`;
            confidence = 75;
          }
        } else if (policy.nullStrategy === 'custom' || policy.nullStrategy === 'constant') {
          const rawCustom = policy.customDefaultValue ?? '';
          replacement =
            isNumericPolicy && rawCustom !== '' && !isNaN(Number(rawCustom))
              ? formatNumericByPolicy(Number(rawCustom), policy)
              : rawCustom || 'Unknown';
          method = `Constant Imputation (${replacement})`;
          confidence = 95;
        } else if (policy.enforcedType === 'date') {
          const inferred = inferMissingDateValue(rows, col.name, rowIdx, policy);
          replacement = inferred.formatted;
          method = inferred.method;
          confidence = inferred.confidence;
        } else if (isNumericPolicy && colStats) {
          if (policy.nullStrategy === 'mean') {
            replacement = formatNumericByPolicy(colStats.mean, policy);
            method = `Mean Imputation (${replacement})`;
            confidence = Math.min(97, Math.max(78, Math.round(78 + Math.min(19, colStats.sampleSize / 5))));
          } else if (policy.nullStrategy === 'mode' && sortedNumericByCol[col.name]?.length > 0) {
            const counts = new Map<number, number>();
            sortedNumericByCol[col.name].forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
            const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
            replacement = formatNumericByPolicy(top, policy);
            method = `Numeric Mode Imputation (${replacement})`;
            confidence = 88;
          } else {
            replacement = formatNumericByPolicy(colStats.median, policy);
            method = `Median Imputation (${replacement})`;
            confidence = Math.min(98, Math.max(82, Math.round(82 + Math.min(16, colStats.sampleSize / 5))));
          }
        } else if (colStats?.modes && colStats.modes.length > 0) {
          replacement = colStats.modes[0];
          method = `Mode Imputation ("${replacement}")`;
          const modeFreq = colStats.modeCounts[colStats.modes[0]] || 1;
          confidence = Math.min(
            97,
            Math.max(74, Math.round(70 + (modeFreq / Math.max(1, colStats.sampleSize)) * 28))
          );
        } else {
          replacement = policy.customDefaultValue || 'Unknown';
          method = `Constant Fallback (${replacement})`;
          confidence = 78;
        }

        cleanedData[col.name] = replacement;
        lastValidByCol[col.name] = replacement;
        appendLineage('missing', val, replacement, `Missing ${policy.enforcedType.toUpperCase()}`, method, confidence);
        continue;
      }

      // 2. Numeric Validation, Bounds & 5 Outlier Treatments
      if (isNumericPolicy && colStats) {
        const strictNum = parseStrictNumber(val, false);
        const formattedNum = strictNum === null ? parseStrictNumber(val, true) : strictNum;

        if (formattedNum === null) {
          const fallback =
            policy.nullStrategy === 'mean'
              ? formatNumericByPolicy(colStats.mean, policy)
              : policy.nullStrategy === 'zero_fill'
              ? 0
              : formatNumericByPolicy(colStats.median, policy);
          cleanedData[col.name] = fallback;
          lastValidByCol[col.name] = fallback;
          appendLineage(
            'imputation',
            val,
            fallback,
            'Non-Numeric Text in Numeric Column',
            `Replaced invalid string via ${policy.nullStrategy} (${fallback})`,
            94
          );
          continue;
        }

        let currentNum = formattedNum;
        if (strictNum === null) {
          currentNum = formatNumericByPolicy(formattedNum, policy);
          cleanedData[col.name] = currentNum;
          appendLineage(
            'normalization',
            val,
            currentNum,
            'Formatted Numeric Cleanup',
            `Stripped symbols/commas (${currentNum})`,
            98
          );
        }

        // Enforce numeric bounds
        if (policy.nonNegative && currentNum < 0) {
          const clamped = 0;
          cleanedData[col.name] = clamped;
          lastValidByCol[col.name] = clamped;
          appendLineage('validation', currentNum, clamped, 'Non-Negative Constraint', 'Clamped negative value to 0', 99);
          continue;
        }
        if (policy.minBound !== null && policy.minBound !== undefined && currentNum < policy.minBound) {
          const clamped = formatNumericByPolicy(policy.minBound, policy);
          cleanedData[col.name] = clamped;
          lastValidByCol[col.name] = clamped;
          appendLineage('validation', currentNum, clamped, `Min Bound (${policy.minBound})`, `Clamped to minimum (${clamped})`, 99);
          continue;
        }
        if (policy.maxBound !== null && policy.maxBound !== undefined && currentNum > policy.maxBound) {
          const clamped = formatNumericByPolicy(policy.maxBound, policy);
          cleanedData[col.name] = clamped;
          lastValidByCol[col.name] = clamped;
          appendLineage('validation', currentNum, clamped, `Max Bound (${policy.maxBound})`, `Clamped to maximum (${clamped})`, 99);
          continue;
        }

        // Statistical outlier treatment
        if (colStats.sampleSize >= 8 && policy.outlierPolicy !== 'flag_only') {
          const zScore = colStats.stdDev > 0 ? Math.abs((currentNum - colStats.mean) / colStats.stdDev) : 0;
          const modifiedZ = colStats.mad > 0 ? Math.abs((0.6745 * (currentNum - colStats.median)) / colStats.mad) : 0;
          const hasSpreadIQR = colStats.iqr > 0;
          const isIQROutlier =
            hasSpreadIQR &&
            (currentNum < colStats.q1 - policy.iqrMultiplier * colStats.iqr ||
              currentNum > colStats.q3 + policy.iqrMultiplier * colStats.iqr);

          const numsSorted = sortedNumericByCol[col.name] || [];
          const pLow = getPercentile(numsSorted, (policy.percentileLow ?? 1) / 100);
          const pHigh = getPercentile(numsSorted, (policy.percentileHigh ?? 99) / 100);

          let triggered = false;
          if (policy.outlierPolicy === 'zscore_clip') triggered = zScore > policy.zScoreThreshold;
          else if (policy.outlierPolicy === 'modified_zscore_clip')
            triggered = colStats.mad > 0 ? modifiedZ > policy.modifiedZThreshold : zScore > policy.zScoreThreshold;
          else if (policy.outlierPolicy === 'percentile_cap')
            triggered = currentNum < pLow || currentNum > pHigh;
          else
            triggered =
              (isIQROutlier && (modifiedZ > policy.modifiedZThreshold || zScore > policy.zScoreThreshold)) ||
              zScore > Math.max(3.5, policy.zScoreThreshold + 0.8);

          if (triggered) {
            if (policy.outlierPolicy === 'remove_row') {
              shouldDropRow = true;
              logs.push({
                id: `drop-out-${rowIdx}-${col.name}-${Date.now()}`,
                rowIndex: rowIdx + 1,
                rowId: row._id,
                column: col.name,
                type: 'outlier',
                actor,
                originalValue: String(originalGroundTruth ?? currentNum),
                beforeValue: String(currentNum),
                afterValue: 'ROW REMOVED',
                detectionRule: `Outlier Removal Policy (Z=${zScore.toFixed(1)})`,
                methodUsed: 'Removed Outlier Row',
                confidenceScore: 95,
                timestamp: now,
              });
              break;
            }

            let replacement = currentNum;
            let method = '';
            let rule = '';
            let confidence = 93;

            if (policy.outlierPolicy === 'iqr_cap') {
              const upper = hasSpreadIQR ? colStats.q3 + policy.iqrMultiplier * colStats.iqr : colStats.mean + policy.zScoreThreshold * colStats.stdDev;
              const lower = hasSpreadIQR ? colStats.q1 - policy.iqrMultiplier * colStats.iqr : colStats.mean - policy.zScoreThreshold * colStats.stdDev;
              replacement = formatNumericByPolicy(currentNum > upper ? upper : lower, policy);
              rule = `IQR Outlier (${policy.iqrMultiplier}x IQR)`;
              method = `IQR Capped (${replacement})`;
              confidence = Math.min(99, Math.max(85, Math.round(85 + Math.min(14, zScore * 2))));
            } else if (policy.outlierPolicy === 'zscore_clip') {
              const upper = colStats.mean + policy.zScoreThreshold * colStats.stdDev;
              const lower = colStats.mean - policy.zScoreThreshold * colStats.stdDev;
              replacement = formatNumericByPolicy(currentNum > upper ? upper : lower, policy);
              rule = `Z-Score Outlier (|z|=${zScore.toFixed(1)} > ${policy.zScoreThreshold})`;
              method = `Z-Score Clipped to ±${policy.zScoreThreshold}σ (${replacement})`;
              confidence = 92;
            } else if (policy.outlierPolicy === 'modified_zscore_clip') {
              const delta = (policy.modifiedZThreshold * colStats.mad) / 0.6745;
              const upper = colStats.median + delta;
              const lower = colStats.median - delta;
              replacement = formatNumericByPolicy(currentNum > upper ? upper : lower, policy);
              rule = `Modified Z-Score (${modifiedZ.toFixed(1)} > ${policy.modifiedZThreshold})`;
              method = `MAD Modified Z-Score Clipped (${replacement})`;
              confidence = 94;
            } else if (policy.outlierPolicy === 'percentile_cap') {
              replacement = formatNumericByPolicy(currentNum > pHigh ? pHigh : pLow, policy);
              rule = `Percentile Cap [${policy.percentileLow}%, ${policy.percentileHigh}%]`;
              method = `Percentile Winsorized (${replacement})`;
              confidence = 93;
            } else {
              replacement = formatNumericByPolicy(colStats.median, policy);
              rule = `Extreme Spike (|z|=${zScore.toFixed(1)})`;
              method = `Replaced with Median (${replacement})`;
              confidence = 95;
            }

            cleanedData[col.name] = replacement;
            lastValidByCol[col.name] = replacement;
            appendLineage('outlier', currentNum, replacement, rule, method, confidence);
            continue;
          }
        }

        if (policy.enforcedType === 'integer' && !Number.isInteger(currentNum)) {
          const rounded = Math.round(currentNum);
          cleanedData[col.name] = rounded;
          lastValidByCol[col.name] = rounded;
          appendLineage('normalization', currentNum, rounded, 'Integer Type Enforcement', `Rounded to integer (${rounded})`, 99);
          continue;
        }

        lastValidByCol[col.name] = currentNum;
        continue;
      }

      // 3. Boolean Standardization
      if (policy.enforcedType === 'boolean') {
        const lower = String(val).trim().toLowerCase();
        const normalized =
          ['true', '1', 'yes', 'y'].includes(lower)
            ? true
            : ['false', '0', 'no', 'n'].includes(lower)
            ? false
            : null;
        if (normalized !== null && val !== normalized) {
          cleanedData[col.name] = normalized;
          lastValidByCol[col.name] = normalized;
          appendLineage('normalization', val, normalized, 'Boolean Normalization', `Normalized boolean to ${normalized}`, 99);
          continue;
        }
        lastValidByCol[col.name] = val;
        continue;
      }

      // 4. Date Format Normalization
      if (policy.enforcedType === 'date') {
        const strVal = String(val).trim();
        const targetRegex =
          policy.dateTargetFormat === 'MM/DD/YYYY'
            ? /^\d{2}\/\d{2}\/\d{4}$/
            : policy.dateTargetFormat === 'DD-MM-YYYY'
            ? /^\d{2}-\d{2}-\d{4}$/
            : /^\d{4}-\d{2}-\d{2}$/;

        if (!targetRegex.test(strVal) || String(val) !== strVal) {
          const parsed = parseDateSafe(strVal);
          if (parsed) {
            const formatted = formatDateByTarget(parsed.date, policy.dateTargetFormat);
            if (formatted !== String(val)) {
              cleanedData[col.name] = formatted;
              lastValidByCol[col.name] = formatted;
              appendLineage(
                'date_format',
                val,
                formatted,
                `Date Format Drift (Expected ${policy.dateTargetFormat})`,
                `Standardized to ${policy.dateTargetFormat}`,
                parsed.confidence
              );
              continue;
            }
          } else {
            const inferred = inferMissingDateValue(rows, col.name, rowIdx, policy);
            cleanedData[col.name] = inferred.formatted;
            lastValidByCol[col.name] = inferred.formatted;
            appendLineage('date_format', val, inferred.formatted, 'Unparseable Date', inferred.method, inferred.confidence);
            continue;
          }
        }
        lastValidByCol[col.name] = strVal;
        continue;
      }

      // 5. Categorical / Text Standardization & Threshold-Controlled Fuzzy Typo Fix
      if (policy.enforcedType === 'categorical' || policy.enforcedType === 'text') {
        const rawStr = String(val);
        let working = policy.trimWhitespace ? rawStr.trim().replace(/\s+/g, ' ') : rawStr;

        if (policy.enforcedType === 'categorical' && policy.typoNormalization && colStats && colStats.canonicalModes.length > 0) {
          const exactCanonical = colStats.canonicalModes.includes(working);
          if (!exactCanonical) {
            let bestSimilarity = 0;
            let bestMode = working;

            for (const mode of colStats.canonicalModes) {
              const sim = computeStringSimilarity(working, mode);
              if (sim > bestSimilarity) {
                bestSimilarity = sim;
                bestMode = mode;
              }
            }

            // Respect user's fuzzyThreshold and protect rare valid categories!
            if (bestSimilarity >= policy.fuzzyThreshold && bestMode !== rawStr) {
              cleanedData[col.name] = bestMode;
              lastValidByCol[col.name] = bestMode;
              const confidence = Math.round(bestSimilarity * 100);
              appendLineage(
                'typo',
                rawStr,
                bestMode,
                bestSimilarity === 1
                  ? 'Case / Whitespace Mismatch'
                  : `Fuzzy Match (${confidence}% >= ${Math.round(policy.fuzzyThreshold * 100)}%)`,
                `Standardized to canonical "${bestMode}"`,
                confidence
              );
              continue;
            }
          }
        }

        if (policy.textCase !== 'none') {
          working = applyTextCase(working, policy.textCase);
        }

        if (working !== rawStr) {
          cleanedData[col.name] = working;
          lastValidByCol[col.name] = working;
          appendLineage(
            'typo',
            rawStr,
            working,
            'Text Standardization',
            `Whitespace trim & ${policy.textCase !== 'none' ? `${policy.textCase} case` : 'normalization'}`,
            99
          );
          continue;
        }
        lastValidByCol[col.name] = working;
      }
    }

    if (shouldDropRow) {
      droppedRowCount++;
      return;
    }

    cleanedRows.push({
      ...row,
      data: cleanedData,
      cellLineage: nextLineage,
    });
  });

  return { cleanedRows, logs, droppedRowCount };
}

/**
 * Dry-run cleaning preview showing exact before/after cell diffs and projected quality score
 * before committing mutations.
 */
export function previewPolicyClean(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  currentQualityScore: number
): CleaningPreviewResult {
  const { cleanedRows, logs, droppedRowCount } = runPolicyClean(rows, schemas, policies);
  const reAnalyzed = analyzeAnomalies(cleanedRows, schemas, policies);

  const avgResidualAnomaly =
    reAnalyzed.length > 0
      ? reAnalyzed.reduce((acc, r) => acc + (r.anomalyInfo?.totalScore || 0), 0) / reAnalyzed.length
      : 0;
  const projectedQualityScore = Math.max(currentQualityScore, Math.min(100, Math.round(100 - avgResidualAnomaly * 0.7)));

  const diffs: CleaningPreviewDiff[] = logs.slice(0, 500).map((l) => ({
    rowIndex: l.rowIndex,
    rowId: l.rowId,
    column: l.column,
    beforeValue: String(l.beforeValue),
    afterValue: String(l.afterValue),
    rule: l.detectionRule,
    method: l.methodUsed,
    confidenceScore: l.confidenceScore,
  }));

  return {
    diffs,
    totalImpactedCells: logs.length,
    droppedRowCount,
    currentQualityScore,
    projectedQualityScore,
  };
}

/**
 * Duplicate row resolution by exact row or selected subset key columns.
 */
export function resolveDuplicates(
  rows: RowData[],
  schemas: ColumnSchema[],
  keyColumns: string[],
  strategy: DuplicateResolutionStrategy
): { dedupedRows: RowData[]; removedCount: number; logs: TransformationLog[] } {
  const cols = keyColumns.length > 0 ? keyColumns : schemas.map((s) => s.name);
  const now = new Date().toLocaleTimeString();
  const logs: TransformationLog[] = [];

  const getKey = (row: RowData) =>
    cols.map((c) => String(row.data[c] ?? '').trim().toLowerCase()).join('||');

  const groups = new Map<string, number[]>();
  rows.forEach((r, idx) => {
    const k = getKey(r);
    const list = groups.get(k) || [];
    list.push(idx);
    groups.set(k, list);
  });

  if (strategy === 'flag_only') {
    return { dedupedRows: rows, removedCount: 0, logs: [] };
  }

  const dropIndices = new Set<number>();
  groups.forEach((indices) => {
    if (indices.length <= 1) return;
    if (strategy === 'keep_first') {
      indices.slice(1).forEach((i) => dropIndices.add(i));
    } else if (strategy === 'keep_last') {
      indices.slice(0, -1).forEach((i) => dropIndices.add(i));
    } else if (strategy === 'drop_all') {
      indices.forEach((i) => dropIndices.add(i));
    }
  });

  const dedupedRows: RowData[] = [];
  rows.forEach((row, idx) => {
    if (dropIndices.has(idx)) {
      logs.push({
        id: `dedupe-${idx}-${Date.now()}`,
        rowIndex: idx + 1,
        rowId: row._id,
        column: cols.join(', '),
        type: 'duplicate',
        actor: 'deduplication',
        originalValue: getKey(row),
        beforeValue: `Duplicate Row #${idx + 1}`,
        afterValue: 'ROW REMOVED',
        detectionRule: `Duplicate Key Match (${cols.length} cols)`,
        methodUsed: `Duplicate Resolution (${strategy})`,
        confidenceScore: 100,
        timestamp: now,
      });
    } else {
      dedupedRows.push(row);
    }
  });

  return { dedupedRows, removedCount: dropIndices.size, logs };
}

export function runAutoClean(
  rows: RowData[],
  schemas: ColumnSchema[],
  config: AutoCleanConfig
): { cleanedRows: RowData[]; logs: TransformationLog[] } {
  const defaultPolicies = createDefaultPolicies(schemas);
  schemas.forEach((col) => {
    const p = defaultPolicies[col.name];
    if (p.enforcedType === 'float' || p.enforcedType === 'integer') {
      p.nullStrategy =
        config.numericMethod === 'mean'
          ? 'mean'
          : config.numericMethod === 'forward_fill'
          ? 'forward_fill'
          : 'median';
      p.outlierPolicy = config.outlierStrategy === 'keep' ? 'flag_only' : config.outlierStrategy;
      p.iqrMultiplier = config.iqrMultiplier;
    }
    if (p.enforcedType === 'date') {
      p.dateTargetFormat = config.dateTargetFormat;
    }
    p.typoNormalization = config.typoMatching;
    p.fuzzyThreshold = config.fuzzyThreshold;
  });

  const { cleanedRows, logs } = runPolicyClean(rows, schemas, defaultPolicies);
  return { cleanedRows, logs };
}

export function revertSingleCell(
  rows: RowData[],
  rowIndex: number,
  colName: string,
  originalRow: Record<string, any> | undefined,
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>
): { updatedRows: RowData[]; logEntry: TransformationLog } {
  const updated = [...rows];
  const targetRow = { ...updated[rowIndex] };
  const currentVal = targetRow.data[colName];

  const lineage = targetRow.cellLineage?.[colName] || [];
  const revertTarget =
    lineage.length > 0
      ? lineage[0].beforeValue === 'NULL'
        ? ''
        : lineage[0].beforeValue
      : originalRow
      ? originalRow[colName]
      : currentVal;

  const now = new Date().toLocaleTimeString();
  const logId = `rollback-${rowIndex}-${colName}-${Date.now()}`;

  const rollbackLineage: CellLineageEntry = {
    id: logId,
    timestamp: now,
    actor: 'rollback',
    originalValue:
      originalRow?.[colName] !== undefined ? String(originalRow[colName]) : String(revertTarget ?? 'NULL'),
    beforeValue: String(currentVal ?? 'NULL'),
    afterValue: String(revertTarget === '' ? 'NULL' : revertTarget ?? 'NULL'),
    detectionRule: 'Human-in-the-Loop Rollback',
    actionTaken: `Reverted cell to pre-clean value (${revertTarget === '' ? 'NULL' : revertTarget})`,
    confidenceScore: 100,
    policyApplied: 'Manual Rollback',
  };

  targetRow.data = { ...targetRow.data, [colName]: revertTarget };
  targetRow.cellLineage = {
    ...(targetRow.cellLineage || {}),
    [colName]: [...lineage, rollbackLineage],
  };

  updated[rowIndex] = targetRow;
  const reAnalyzed = analyzeAnomalies(updated, schemas, policies);

  const logEntry: TransformationLog = {
    id: logId,
    rowIndex: rowIndex + 1,
    rowId: targetRow._id,
    column: colName,
    type: 'rollback',
    actor: 'rollback',
    originalValue: rollbackLineage.originalValue,
    beforeValue: rollbackLineage.beforeValue,
    afterValue: rollbackLineage.afterValue,
    detectionRule: rollbackLineage.detectionRule,
    methodUsed: rollbackLineage.actionTaken,
    confidenceScore: 100,
    timestamp: now,
  };

  return { updatedRows: reAnalyzed, logEntry };
}

export function overrideSingleCell(
  rows: RowData[],
  rowIndex: number,
  colName: string,
  newValue: any,
  originalRow: Record<string, any> | undefined,
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>
): { updatedRows: RowData[]; logEntry: TransformationLog } {
  const updated = [...rows];
  const targetRow = { ...updated[rowIndex] };
  const currentVal = targetRow.data[colName];
  const policy = policies[colName];

  let coercedValue = newValue;
  if (
    policy &&
    (policy.enforcedType === 'float' || policy.enforcedType === 'integer') &&
    newValue !== '' &&
    !isNaN(Number(newValue))
  ) {
    coercedValue = policy.enforcedType === 'integer' ? Math.round(Number(newValue)) : Number(newValue);
  }

  const now = new Date().toLocaleTimeString();
  const logId = `override-${rowIndex}-${colName}-${Date.now()}`;
  const lineage = targetRow.cellLineage?.[colName] || [];

  const overrideLineage: CellLineageEntry = {
    id: logId,
    timestamp: now,
    actor: 'manual_override',
    originalValue:
      originalRow?.[colName] !== undefined ? String(originalRow[colName]) : String(currentVal ?? 'NULL'),
    beforeValue: String(currentVal ?? 'NULL'),
    afterValue: String(coercedValue ?? 'NULL'),
    detectionRule: 'Human-in-the-Loop Override',
    actionTaken: `Manually edited value to "${coercedValue}"`,
    confidenceScore: 100,
    policyApplied: 'Manual Review',
  };

  targetRow.data = { ...targetRow.data, [colName]: coercedValue };
  targetRow.cellLineage = {
    ...(targetRow.cellLineage || {}),
    [colName]: [...lineage, overrideLineage],
  };

  updated[rowIndex] = targetRow;
  const reAnalyzed = analyzeAnomalies(updated, schemas, policies);

  const logEntry: TransformationLog = {
    id: logId,
    rowIndex: rowIndex + 1,
    rowId: targetRow._id,
    column: colName,
    type: 'override',
    actor: 'manual_override',
    originalValue: overrideLineage.originalValue,
    beforeValue: overrideLineage.beforeValue,
    afterValue: overrideLineage.afterValue,
    detectionRule: overrideLineage.detectionRule,
    methodUsed: overrideLineage.actionTaken,
    confidenceScore: 100,
    timestamp: now,
  };

  return { updatedRows: reAnalyzed, logEntry };
}
