import type { ColumnSchema, ColumnType, CorruptionConfig, CorruptionType, RowData } from '../types.ts';

const QWERTY_NEIGHBORS: Record<string, string[]> = {
  a: ['q', 'w', 's', 'z'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'],
  e: ['w', 's', 'd', 'r'],
  f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'j', 'k', 'o'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'k', 'l', 'p'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 'd', 'f', 't'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'f', 'g', 'y'],
  u: ['y', 'h', 'j', 'i'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'a', 's', 'e'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'g', 'h', 'u'],
  z: ['a', 's', 'x'],
};

const BOOLEAN_TOKENS = new Set(['true', 'false', 'yes', 'no', '1', '0', 'y', 'n']);

export function inferColumnSchemas(rows: Record<string, any>[]): ColumnSchema[] {
  if (!rows || rows.length === 0) return [];

  const colSet = new Set<string>();
  rows.slice(0, 50).forEach((r) => {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => colSet.add(k));
    }
  });
  const colNames = Array.from(colSet);
  const totalRows = rows.length;

  return colNames.map((col) => {
    const values = rows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    const sampleValues = values.slice(0, 5);
    const distinctSet = new Set(values.map((v) => String(v).trim().toLowerCase()));
    const distinctCount = distinctSet.size;

    // Boolean intelligence (check before numeric because 0/1 booleans exist, unless column is clearly continuous numeric)
    const boolCount = values.filter((v) =>
      typeof v === 'boolean' || ['true', 'false', 'yes', 'no'].includes(String(v).trim().toLowerCase())
    ).length;
    const isExplicitBoolean =
      values.length > 0 &&
      (boolCount / values.length > 0.8 ||
        (distinctCount <= 2 && values.every((v) => BOOLEAN_TOKENS.has(String(v).trim().toLowerCase())) && (col.toLowerCase().startsWith('is_') || col.toLowerCase().startsWith('has_'))));

    const numericCount = values.filter((v) => {
      if (typeof v === 'boolean') return false;
      const s = String(v).trim();
      return s !== '' && !isNaN(Number(s));
    }).length;
    const isNumeric = !isExplicitBoolean && values.length > 0 && numericCount / values.length > 0.8;

    const colLower = col.toLowerCase();
    const isDateCol =
      !isNumeric &&
      !isExplicitBoolean &&
      (colLower.includes('date') ||
        colLower.includes('time') ||
        values.slice(0, 25).some((v) => {
          const s = String(v).trim();
          return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(s);
        }));

    const hasSpaces = values.slice(0, 20).some((v) => /\s/.test(String(v).trim()));
    const isId =
      colLower === 'id' ||
      colLower.endsWith('_id') ||
      (colLower.endsWith('id') && colLower.length <= 12) ||
      (totalRows >= 20 && distinctCount === totalRows && !isNumeric && !isDateCol && !hasSpaces && !isExplicitBoolean);

    let type: ColumnType = 'text';
    if (isId) type = 'id';
    else if (isExplicitBoolean) type = 'boolean';
    else if (isDateCol) type = 'date';
    else if (isNumeric) type = 'numeric';
    else if (distinctCount <= Math.max(15, totalRows * 0.4)) type = 'categorical';

    return {
      name: col,
      type,
      sampleValues,
      distinctCount,
    };
  });
}

export function corruptDataset(
  originalRows: Record<string, any>[],
  schemas: ColumnSchema[],
  config: CorruptionConfig
): RowData[] {
  const placeholders =
    config.missingPlaceholders && config.missingPlaceholders.length > 0
      ? config.missingPlaceholders
      : ['', 'N/A', 'NaN', 'NULL'];

  const targetSet =
    config.targetColumns && config.targetColumns.length > 0 ? new Set(config.targetColumns) : null;

  // Precompute numeric column baselines so outlierMultiplier drives exact magnitude shifts
  const numericMeans: Record<string, number> = {};
  schemas.forEach((s) => {
    if (s.type === 'numeric') {
      const nums = originalRows
        .map((r) => r[s.name])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '' && !isNaN(Number(v)))
        .map((v) => Number(v));
      numericMeans[s.name] =
        nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 100;
    }
  });

  return originalRows.map((row, rowIdx) => {
    const corruptedData = { ...row };
    const corruptedMeta: Record<string, any> = {};

    schemas.forEach((colSchema) => {
      if (targetSet && !targetSet.has(colSchema.name)) return;
      if (colSchema.type === 'id' && Math.random() > 0.1) return;

      const originalValue = row[colSchema.name];
      let corruptedValue = originalValue;
      const injectedTypes: CorruptionType[] = [];

      // 1. Missingness Injection (MCAR or MAR)
      if (config.enableMissing) {
        let missingProb = config.missingRate;
        if (config.missingnessAlgorithm === 'mar') {
          const wave = Math.sin((rowIdx / Math.max(1, originalRows.length)) * Math.PI * 4);
          missingProb = wave > 0.25 ? Math.min(0.85, config.missingRate * 2.1) : config.missingRate * 0.25;
        }
        if (Math.random() < missingProb) {
          corruptedValue = placeholders[Math.floor(Math.random() * placeholders.length)];
          injectedTypes.push('missing');
        }
      }

      // 2. Outlier Spikes driven directly by config.outlierMultiplier
      if (injectedTypes.length === 0 && config.enableOutliers && colSchema.type === 'numeric') {
        if (Math.random() < config.outlierRate) {
          const rawNum = Number(originalValue);
          const baseVal =
            !isNaN(rawNum) && rawNum !== 0 ? Math.abs(rawNum) : Math.max(10, Math.abs(numericMeans[colSchema.name] || 100));
          const mult = Math.max(2, config.outlierMultiplier);
          const jitter = 0.85 + Math.random() * 0.3;

          const choices = [
            baseVal * mult * jitter,
            baseVal * (mult * 1.15),
            baseVal / Math.max(2, mult),
          ];
          if (config.injectNegativeShocks) {
            choices.push(-Math.abs(baseVal * mult * 0.5 * jitter));
          }
          corruptedValue = Number(choices[Math.floor(Math.random() * choices.length)].toFixed(2));
          injectedTypes.push('outlier');
        }
      }

      // 3. Date Format Pollution
      if (injectedTypes.length === 0 && config.enableDateFormats && colSchema.type === 'date') {
        if (Math.random() < config.dateMixRate) {
          corruptedValue = corruptDateFormat(String(originalValue));
          injectedTypes.push('date_format');
        }
      }

      // 4. Typo & Formatting Pollution
      if (
        injectedTypes.length === 0 &&
        config.enableTypos &&
        (colSchema.type === 'categorical' || colSchema.type === 'text')
      ) {
        if (Math.random() < config.typoRate) {
          corruptedValue = corruptText(String(originalValue), {
            keyboardTypos: config.injectKeyboardTypos,
            whitespace: config.injectWhitespace,
          });
          injectedTypes.push('typo');
        }
      }

      if (injectedTypes.length > 0) {
        corruptedData[colSchema.name] = corruptedValue;
        corruptedMeta[colSchema.name] = {
          isCorrupted: true,
          types: injectedTypes,
          originalValue,
        };
      }
    });

    return {
      _id: `row-${rowIdx}`,
      data: corruptedData,
      corruptedMeta,
      cellLineage: {},
    };
  });
}

function corruptDateFormat(dateStr: string): string {
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    return '99/99/9999';
  }

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthsShort[dateObj.getMonth()];

  const formats = [
    `${mm}/${dd}/${yyyy}`,
    `${dd}-${mm}-${yyyy}`,
    `${dd} ${monthName} ${yyyy}`,
    `${yyyy}.${mm}.${dd}`,
    `${dateObj.getTime()}`,
    `${monthName} ${dd}th, ${yyyy}`,
  ];

  return formats[Math.floor(Math.random() * formats.length)];
}

function corruptText(text: string, opts: { keyboardTypos: boolean; whitespace: boolean }): string {
  if (!text || text.length < 2) return text + 'x';

  let result = text;
  const mode = Math.floor(Math.random() * 5);
  const chars = result.split('');

  if (mode === 0 && opts.keyboardTypos) {
    const candidates = chars
      .map((c, i) => ({ c: c.toLowerCase(), i }))
      .filter((item) => QWERTY_NEIGHBORS[item.c]);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const neighbors = QWERTY_NEIGHBORS[pick.c];
      const replacement = neighbors[Math.floor(Math.random() * neighbors.length)];
      chars[pick.i] =
        chars[pick.i] === chars[pick.i].toUpperCase() ? replacement.toUpperCase() : replacement;
      result = chars.join('');
    }
  } else if (mode === 1 && chars.length > 3) {
    const idx = Math.floor(Math.random() * (chars.length - 1));
    const temp = chars[idx];
    chars[idx] = chars[idx + 1];
    chars[idx + 1] = temp;
    result = chars.join('');
  } else if (mode === 2) {
    const idx = Math.floor(Math.random() * chars.length);
    chars.splice(idx, 1);
    result = chars.join('');
  } else if (mode === 3) {
    result = result
      .split('')
      .map((c) => (Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()))
      .join('');
  } else {
    const idx = Math.floor(Math.random() * chars.length);
    chars.splice(idx, 0, chars[idx]);
    result = chars.join('');
  }

  if (opts.whitespace && Math.random() < 0.65) {
    const wsChoice = Math.floor(Math.random() * 3);
    if (wsChoice === 0) result = `  ${result}`;
    else if (wsChoice === 1) result = `${result}   `;
    else result = result.replace(' ', '  ');
  }

  return result;
}
