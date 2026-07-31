import { ColumnSchema, ColumnType, CorruptionConfig, CorruptionType, RowData } from '../types';

export function inferColumnSchemas(rows: Record<string, any>[]): ColumnSchema[] {
  if (!rows || rows.length === 0) return [];

  const colNames = Object.keys(rows[0]);
  const totalRows = rows.length;

  return colNames.map((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
    const sampleValues = values.slice(0, 5);
    const distinctSet = new Set(values.map((v) => String(v).trim().toLowerCase()));
    const distinctCount = distinctSet.size;

    // Check if numeric
    const numericCount = values.filter((v) => !isNaN(Number(v))).length;
    const isNumeric = values.length > 0 && numericCount / values.length > 0.8;

    // Check if date
    const isDateCol =
      !isNumeric &&
      (col.toLowerCase().includes('date') ||
        col.toLowerCase().includes('time') ||
        values.some((v) => {
          const s = String(v);
          return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(s);
        }));

    // Check if ID
    const isId =
      col.toLowerCase().includes('id') ||
      col.toLowerCase().endsWith('_id') ||
      (distinctCount === totalRows && !isNumeric);

    let type: ColumnType = 'text';
    if (isId) type = 'id';
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
  const activeTypes: CorruptionType[] = [];
  if (config.enableMissing) activeTypes.push('missing');
  if (config.enableOutliers) activeTypes.push('outlier');
  if (config.enableDateFormats) activeTypes.push('date_format');
  if (config.enableTypos) activeTypes.push('typo');

  if (activeTypes.length === 0) {
    return originalRows.map((r, idx) => ({
      _id: `row-${idx}`,
      data: { ...r },
      corruptedMeta: {},
    }));
  }

  const missingPlaceholders = ['', 'N/A', 'NaN', 'null', '?', '-', 'undefined'];

  return originalRows.map((row, rowIdx) => {
    const corruptedData = { ...row };
    const corruptedMeta: Record<string, any> = {};

    schemas.forEach((colSchema) => {
      // Don't corrupt ID column unless high rate
      if (colSchema.type === 'id' && Math.random() > 0.15) return;

      const shouldCorrupt = Math.random() < config.overallRate;
      if (!shouldCorrupt) return;

      // Select eligible corruption type based on column type
      const possibleForCol: CorruptionType[] = [];
      if (config.enableMissing) possibleForCol.push('missing');

      if (config.enableOutliers && colSchema.type === 'numeric') {
        possibleForCol.push('outlier');
      }

      if (config.enableDateFormats && colSchema.type === 'date') {
        possibleForCol.push('date_format');
      }

      if (config.enableTypos && (colSchema.type === 'categorical' || colSchema.type === 'text')) {
        possibleForCol.push('typo');
      }

      if (possibleForCol.length === 0) return;

      const selectedType = possibleForCol[Math.floor(Math.random() * possibleForCol.length)];
      const originalValue = row[colSchema.name];
      let corruptedValue = originalValue;

      if (selectedType === 'missing') {
        corruptedValue = missingPlaceholders[Math.floor(Math.random() * missingPlaceholders.length)];
      } else if (selectedType === 'outlier') {
        const numVal = Number(originalValue) || 100;
        const choices = [
          numVal * (10 + Math.random() * 40),
          numVal * 0.001,
          999999,
          numVal > 0 ? -Math.abs(numVal * 5) : 88888,
        ];
        corruptedValue = Number(choices[Math.floor(Math.random() * choices.length)].toFixed(2));
      } else if (selectedType === 'date_format') {
        corruptedValue = corruptDateFormat(String(originalValue));
      } else if (selectedType === 'typo') {
        corruptedValue = corruptText(String(originalValue));
      }

      corruptedData[colSchema.name] = corruptedValue;
      corruptedMeta[colSchema.name] = {
        isCorrupted: true,
        types: [selectedType],
        originalValue,
      };
    });

    return {
      _id: `row-${rowIdx}`,
      data: corruptedData,
      corruptedMeta,
    };
  });
}

function corruptDateFormat(dateStr: string): string {
  // Parse standard YYYY-MM-DD
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
    `${mm}/${dd}/${yyyy}`, // US format MM/DD/YYYY
    `${dd}-${mm}-${yyyy}`, // EU format DD-MM-YYYY
    `${dd} ${monthName} ${yyyy}`, // 15 Jan 2024
    `${yyyy}.${mm}.${dd}`, // YYYY.MM.DD
    `${dateObj.getTime()}`, // Unix timestamp ms
    `${monthName} ${dd}th, ${yyyy}`, // Jan 15th, 2024
  ];

  return formats[Math.floor(Math.random() * formats.length)];
}

function corruptText(text: string): string {
  if (!text || text.length < 2) return text + 'x';

  const typoChoice = Math.floor(Math.random() * 4);
  const chars = text.split('');

  if (typoChoice === 0 && chars.length > 3) {
    // Swap adjacent letters
    const idx = Math.floor(Math.random() * (chars.length - 1));
    const temp = chars[idx];
    chars[idx] = chars[idx + 1];
    chars[idx + 1] = temp;
    return chars.join('');
  } else if (typoChoice === 1) {
    // Drop a letter
    const idx = Math.floor(Math.random() * chars.length);
    chars.splice(idx, 1);
    return chars.join('');
  } else if (typoChoice === 2) {
    // Duplicate a letter
    const idx = Math.floor(Math.random() * chars.length);
    chars.splice(idx, 0, chars[idx]);
    return chars.join('');
  } else {
    // Random casing noise
    return text
      .split('')
      .map((c) => (Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()))
      .join('');
  }
}
