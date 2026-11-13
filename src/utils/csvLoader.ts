import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedCSVResult {
  filename: string;
  fileFormat: 'csv' | 'xlsx' | 'json';
  headers: string[];
  rows: Record<string, any>[];
  sheetNames?: string[];
  activeSheet?: string;
  needsSheetSelection?: boolean;
  rawBuffer?: ArrayBuffer;
  encodingUsed?: string;
}

function cleanHeaderName(raw: string, index: number, used: Set<string>): string {
  const stripped = String(raw ?? '').replace(/^\uFEFF/, '').trim();
  const base = stripped.length > 0 ? stripped : `column_${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix++;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Normalizes any parsed row array so every row has identical, non-empty,
 * deduplicated column keys and handles jagged rows or __parsed_extra columns.
 */
export function normalizeParsedRows(
  rawRows: Record<string, any>[],
  metaFields?: string[]
): { headers: string[]; rows: Record<string, any>[] } {
  if (!rawRows || rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawKeySet = new Set<string>();
  if (metaFields && metaFields.length > 0) {
    metaFields.forEach((f) => rawKeySet.add(f));
  }
  let maxExtraCols = 0;
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue;
    for (const k of Object.keys(row)) {
      if (k === '__parsed_extra') {
        const extra = row.__parsed_extra;
        if (Array.isArray(extra) && extra.length > maxExtraCols) {
          maxExtraCols = extra.length;
        }
      } else {
        rawKeySet.add(k);
      }
    }
  }

  const rawKeys = Array.from(rawKeySet);
  const usedHeaders = new Set<string>();
  const keyMap = new Map<string, string>();
  const headers: string[] = [];

  rawKeys.forEach((rawKey, idx) => {
    const clean = cleanHeaderName(rawKey, idx, usedHeaders);
    keyMap.set(rawKey, clean);
    headers.push(clean);
  });

  const extraHeaders: string[] = [];
  for (let i = 0; i < maxExtraCols; i++) {
    const clean = cleanHeaderName(`extra_${i + 1}`, headers.length + i, usedHeaders);
    extraHeaders.push(clean);
    headers.push(clean);
  }

  const normalizedRows: Record<string, any>[] = [];
  for (const rawRow of rawRows) {
    if (!rawRow || typeof rawRow !== 'object') continue;
    const obj: Record<string, any> = {};
    let hasAnyValue = false;

    for (const rawKey of rawKeys) {
      const cleanKey = keyMap.get(rawKey)!;
      const val = rawRow[rawKey];
      obj[cleanKey] = val === undefined ? '' : val;
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        hasAnyValue = true;
      }
    }

    if (maxExtraCols > 0) {
      const extra = Array.isArray(rawRow.__parsed_extra) ? rawRow.__parsed_extra : [];
      for (let i = 0; i < maxExtraCols; i++) {
        const val = extra[i];
        obj[extraHeaders[i]] = val === undefined ? '' : val;
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          hasAnyValue = true;
        }
      }
    }

    if (hasAnyValue) {
      normalizedRows.push(obj);
    }
  }

  return { headers, rows: normalizedRows };
}

/**
 * Decodes raw file bytes with UTF-8 first, falling back to Windows-1252 / Latin-1
 * if replacement characters (\uFFFD) indicate legacy encoding.
 */
async function readFileTextWithEncodingFallback(file: File): Promise<{ text: string; encoding: string }> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementMatches = (utf8Text.match(/\uFFFD/g) || []).length;

  if (replacementMatches > 2) {
    try {
      const win1252 = new TextDecoder('windows-1252').decode(buffer);
      return { text: win1252.replace(/^\uFEFF/, ''), encoding: 'windows-1252' };
    } catch {
      // Fallback to utf-8 text
    }
  }
  return { text: utf8Text.replace(/^\uFEFF/, ''), encoding: 'utf-8' };
}

/**
 * Parses a specific sheet from an Excel ArrayBuffer.
 */
export function parseExcelSheetFromBuffer(
  buffer: ArrayBuffer,
  filename: string,
  sheetName?: string
): ParsedCSVResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('The Excel workbook contains no readable worksheets.');
  }

  const selectedSheet = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
    raw: true,
  });

  const { headers, rows } = normalizeParsedRows(rawObjects);
  if (rows.length === 0 || headers.length === 0) {
    throw new Error(`Worksheet "${selectedSheet}" contains no non-empty tabular rows.`);
  }

  return {
    filename,
    fileFormat: 'xlsx',
    headers,
    rows,
    sheetNames,
    activeSheet: selectedSheet,
    needsSheetSelection: false,
    rawBuffer: buffer,
  };
}

function parseStructuredJSONText(cleanText: string, filename: string): ParsedCSVResult {
  let parsed: any;
  try {
    parsed = JSON.parse(cleanText);
  } catch (err: any) {
    throw new Error(`Malformed JSON file: ${err?.message || 'Unable to parse JSON.'}`);
  }

  let rawArray: Record<string, any>[] | null = null;

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && Array.isArray(parsed[0])) {
      // Array of arrays: first row headers
      const headersRow = parsed[0].map((h: any, i: number) => String(h || `column_${i + 1}`));
      rawArray = parsed.slice(1).map((arr: any[]) => {
        const rec: Record<string, any> = {};
        headersRow.forEach((h: string, i: number) => {
          rec[h] = arr[i] ?? '';
        });
        return rec;
      });
    } else {
      rawArray = parsed;
    }
  } else if (parsed && typeof parsed === 'object') {
    const candidateKey = ['data', 'rows', 'records', 'items', 'results'].find((k) =>
      Array.isArray(parsed[k])
    );
    if (candidateKey) {
      rawArray = parsed[candidateKey];
    } else {
      // Columnar object: { colA: [...], colB: [...] }
      const keys = Object.keys(parsed);
      const arrayCols = keys.filter((k) => Array.isArray(parsed[k]));
      if (arrayCols.length > 0) {
        const len = Math.max(...arrayCols.map((k) => parsed[k].length));
        rawArray = Array.from({ length: len }, (_, idx) => {
          const obj: Record<string, any> = {};
          arrayCols.forEach((k) => {
            obj[k] = parsed[k][idx] ?? '';
          });
          return obj;
        });
      }
    }
  }

  if (!rawArray || rawArray.length === 0) {
    throw new Error('JSON must contain an array of record objects, { data/rows/records: [...] }, or columnar arrays.');
  }

  const { headers, rows } = normalizeParsedRows(rawArray);
  if (rows.length === 0 || headers.length === 0) {
    throw new Error('No tabular columns or rows could be extracted from the JSON file.');
  }

  return {
    filename,
    fileFormat: 'json',
    headers,
    rows,
  };
}

/**
 * Parses CSV, TSV, TXT, Excel (.xlsx/.xls), or Structured JSON files robustly.
 */
export async function parseAnyCSVFile(file: File): Promise<ParsedCSVResult> {
  const lowerName = file.name.toLowerCase();

  // 1. Excel Workbook (.xlsx / .xls)
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true });
    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      throw new Error('The uploaded Excel file contains no worksheets.');
    }
    const result = parseExcelSheetFromBuffer(buffer, file.name, sheetNames[0]);
    return {
      ...result,
      needsSheetSelection: sheetNames.length > 1,
    };
  }

  const { text: cleanText, encoding } = await readFileTextWithEncodingFallback(file);
  if (!cleanText.trim()) {
    throw new Error('The uploaded file is empty.');
  }

  // 2. Structured JSON (.json)
  if (lowerName.endsWith('.json') || cleanText.trimStart().startsWith('[') || cleanText.trimStart().startsWith('{')) {
    try {
      return {
        ...parseStructuredJSONText(cleanText, file.name),
        encodingUsed: encoding,
      };
    } catch (jsonErr: any) {
      if (lowerName.endsWith('.json')) {
        throw jsonErr;
      }
      // Otherwise continue and try CSV parsing
    }
  }

  // 3. CSV / TSV / Delimited text
  const parsedWithHeader = await new Promise<Papa.ParseResult<Record<string, any>>>(
    (resolve, reject) => {
      Papa.parse<Record<string, any>>(cleanText, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        delimitersToGuess: [',', ';', '\t', '|'],
        complete: (results) => resolve(results),
        error: (err: Error) => reject(err),
      });
    }
  );

  let { headers, rows } = normalizeParsedRows(
    parsedWithHeader.data,
    parsedWithHeader.meta?.fields
  );

  // Fallback for single-column or headerless CSVs if header parse produced 0 data rows
  if (rows.length === 0) {
    const parsedNoHeader = await new Promise<Papa.ParseResult<any[]>>((resolve, reject) => {
      Papa.parse<any[]>(cleanText, {
        header: false,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        delimitersToGuess: [',', ';', '\t', '|'],
        complete: (results) => resolve(results),
        error: (err: Error) => reject(err),
      });
    });

    const matrix = parsedNoHeader.data.filter(
      (r) => Array.isArray(r) && r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );

    if (matrix.length === 0) {
      throw new Error('No readable data rows were found in the uploaded file.');
    }

    const maxCols = Math.max(...matrix.map((r) => r.length));
    const used = new Set<string>();
    headers = Array.from({ length: maxCols }, (_, i) =>
      cleanHeaderName(`column_${i + 1}`, i, used)
    );
    rows = matrix.map((arr) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => {
        obj[h] = arr[i] === undefined ? '' : arr[i];
      });
      return obj;
    });
  }

  if (rows.length === 0 || headers.length === 0) {
    throw new Error('Could not extract columns or rows from this file.');
  }

  return {
    filename: file.name,
    fileFormat: 'csv',
    headers,
    rows,
    encodingUsed: encoding,
  };
}
