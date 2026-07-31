import { AutoCleanConfig, ColumnSchema, RowData, TransformationLog } from '../types';

import { computeColumnStats, levenshteinDistance } from './anomalyDetector';

export function runAutoClean(
  rows: RowData[],
  schemas: ColumnSchema[],
  config: AutoCleanConfig
): { cleanedRows: RowData[]; logs: TransformationLog[] } {
  const stats = computeColumnStats(rows, schemas);
  const logs: TransformationLog[] = [];
  const now = new Date().toLocaleTimeString();

  const cleanedRows = rows.map((row, rowIdx) => {
    const cleanedData = { ...row.data };
    const currentCellAnomalies = row.anomalyInfo?.cellAnomalies || {};

    schemas.forEach((col) => {
      const val = row.data[col.name];
      const cellInfo = currentCellAnomalies[col.name];
      const colStats = stats[col.name];

      // 1. Missing Values
      const isMissing =
        val === null ||
        val === undefined ||
        String(val).trim() === '' ||
        ['n/a', 'nan', 'null', 'undefined', '?', '-'].includes(String(val).trim().toLowerCase());

      if (isMissing) {
        let replacement: any = val;
        let method = '';

        if (col.type === 'numeric' && colStats) {
          replacement =
            config.numericMethod === 'mean' ? Number(colStats.mean.toFixed(2)) : Number(colStats.median.toFixed(2));
          method = `${config.numericMethod.toUpperCase()} Imputation (${replacement})`;
        } else if (col.type === 'date') {
          // Default to median date or today's date format
          replacement = '2024-01-15';
          method = 'Default Baseline Date Imputation';
        } else if (colStats?.modes && colStats.modes.length > 0) {
          replacement = colStats.modes[0];
          method = `Mode Categorical Imputation ("${replacement}")`;
        } else {
          replacement = 'Unknown';
          method = 'Default Placeholder Imputation';
        }

        cleanedData[col.name] = replacement;
        logs.push({
          id: `log-${rowIdx}-${col.name}-${Date.now()}`,
          rowIndex: rowIdx + 1,
          rowId: row._id,
          column: col.name,
          type: 'missing',
          beforeValue: val === undefined || val === null ? 'NULL' : String(val),
          afterValue: String(replacement),
          methodUsed: method,
          timestamp: now,
        });
        return;
      }

      // 2. Outliers on Numeric
      if (col.type === 'numeric' && colStats && !isMissing) {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          const replacement = Number(colStats.median.toFixed(2));
          cleanedData[col.name] = replacement;
          logs.push({
            id: `log-${rowIdx}-${col.name}-${Date.now()}`,
            rowIndex: rowIdx + 1,
            rowId: row._id,
            column: col.name,
            type: 'outlier',
            beforeValue: String(val),
            afterValue: String(replacement),
            methodUsed: `Median Imputation for Non-Numeric string (${replacement})`,
            timestamp: now,
          });
          return;
        }

        const isOutlier =
          colStats.iqr > 0 &&
          (numVal < colStats.q1 - config.iqrMultiplier * colStats.iqr ||
            numVal > colStats.q3 + config.iqrMultiplier * colStats.iqr);

        if (isOutlier && config.outlierStrategy !== 'keep') {
          let replacement = numVal;
          let method = '';

          if (config.outlierStrategy === 'iqr_cap') {
            const upperBound = colStats.q3 + config.iqrMultiplier * colStats.iqr;
            const lowerBound = colStats.q1 - config.iqrMultiplier * colStats.iqr;
            replacement = numVal > upperBound ? Number(upperBound.toFixed(2)) : Number(lowerBound.toFixed(2));
            method = `IQR Capping Winsorization (Bound: ${replacement})`;
          } else {
            replacement = Number(colStats.median.toFixed(2));
            method = `Median Replacement (${replacement})`;
          }

          cleanedData[col.name] = replacement;
          logs.push({
            id: `log-${rowIdx}-${col.name}-${Date.now()}`,
            rowIndex: rowIdx + 1,
            rowId: row._id,
            column: col.name,
            type: 'outlier',
            beforeValue: String(val),
            afterValue: String(replacement),
            methodUsed: method,
            timestamp: now,
          });
          return;
        }
      }

      // 3. Date Format Normalization
      if (col.type === 'date' && !isMissing) {
        const strVal = String(val).trim();
        const isStandardISO = /^\d{4}-\d{2}-\d{2}$/.test(strVal);

        if (!isStandardISO) {
          const parsedISO = parseAndStandardizeDate(strVal, config.dateTargetFormat);
          if (parsedISO !== strVal) {
            cleanedData[col.name] = parsedISO;
            logs.push({
              id: `log-${rowIdx}-${col.name}-${Date.now()}`,
              rowIndex: rowIdx + 1,
              rowId: row._id,
              column: col.name,
              type: 'date_format',
              beforeValue: strVal,
              afterValue: parsedISO,
              methodUsed: `Standardized Date Parsing (${config.dateTargetFormat})`,
              timestamp: now,
            });
            return;
          }
        }
      }

      // 4. Categorical Typos
      if ((col.type === 'categorical' || col.type === 'text') && colStats && colStats.modes.length > 0 && !isMissing) {
        const strVal = String(val).trim();
        const exactMatch = colStats.modes.includes(strVal);

        if (!exactMatch && config.typoMatching) {
          // Find closest mode
          let minDistance = 999;
          let bestMode = colStats.modes[0];

          for (const mode of colStats.modes) {
            if (mode.toLowerCase() === strVal.toLowerCase()) {
              minDistance = 0;
              bestMode = mode;
              break;
            }
            const dist = levenshteinDistance(strVal.toLowerCase(), mode.toLowerCase());
            if (dist < minDistance) {
              minDistance = dist;
              bestMode = mode;
            }
          }

          if (minDistance <= 3 || minDistance === 0) {
            cleanedData[col.name] = bestMode;
            logs.push({
              id: `log-${rowIdx}-${col.name}-${Date.now()}`,
              rowIndex: rowIdx + 1,
              rowId: row._id,
              column: col.name,
              type: 'typo',
              beforeValue: strVal,
              afterValue: bestMode,
              methodUsed: `Levenshtein Fuzzy Match (dist: ${minDistance} -> "${bestMode}")`,
              timestamp: now,
            });
            return;
          }
        }
      }
    });

    return {
      _id: row._id,
      data: cleanedData,
      corruptedMeta: {},
      anomalyInfo: {
        totalScore: 0,
        riskLevel: 'clean' as const,
        flaggedColumns: [],
        cellAnomalies: {},
      },
    };
  });

  return { cleanedRows, logs };
}

function parseAndStandardizeDate(raw: string, targetFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY'): string {
  if (!raw) return '2024-01-01';

  let dateObj: Date | null = null;

  // Check if timestamp (ms or sec)
  if (/^\d{9,13}$/.test(raw)) {
    const num = Number(raw);
    const ms = raw.length === 10 ? num * 1000 : num;
    dateObj = new Date(ms);
  } else {
    // Try standard JS Date parse
    const t = Date.parse(raw);
    if (!isNaN(t)) {
      dateObj = new Date(t);
    } else {
      // Try regex for DD-MM-YYYY or MM/DD/YYYY
      const parts = raw.split(/[-/.\s]+/);
      if (parts.length === 3) {
        let [p1, p2, p3] = parts;
        if (p3.length === 4) {
          // DD-MM-YYYY or MM-DD-YYYY
          const d1 = Number(p1);
          const d2 = Number(p2);
          const yr = Number(p3);
          if (d1 > 12) {
            dateObj = new Date(yr, d2 - 1, d1); // DD/MM/YYYY
          } else {
            dateObj = new Date(yr, d1 - 1, d2); // MM/DD/YYYY
          }
        }
      }
    }
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return '2024-01-15'; // fallback baseline
  }

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');

  if (targetFormat === 'MM/DD/YYYY') {
    return `${mm}/${dd}/${yyyy}`;
  } else if (targetFormat === 'DD-MM-YYYY') {
    return `${dd}-${mm}-${yyyy}`;
  }
  return `${yyyy}-${mm}-${dd}`; // Default YYYY-MM-DD
}
