import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { ColumnPolicy, ColumnSchema, DuckDBColumnProfile, RowData, SQLQueryResult } from '../types';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

export interface DuckDBStatus {
  state: 'idle' | 'initializing' | 'ready' | 'error';
  lastError: string | null;
  bundleSource: 'local' | 'jsdelivr' | null;
}

let dbInstance: duckdb.AsyncDuckDB | null = null;
let dbInitPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let dbState: DuckDBStatus['state'] = 'idle';
let lastInitError: string | null = null;
let lastFailedAt = 0;
let activeBundleSource: DuckDBStatus['bundleSource'] = null;
let tableReady = false;
let latestDatasetSnapshot: { rows: RowData[]; schemas: ColumnSchema[] } | null = null;

export function getDuckDBStatus(): DuckDBStatus {
  return {
    state: dbState,
    lastError: lastInitError,
    bundleSource: activeBundleSource,
  };
}

export function resetDuckDBState(): void {
  dbInitPromise = null;
  lastInitError = null;
  lastFailedAt = 0;
  tableReady = false;
  if (!dbInstance) {
    dbState = 'idle';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function instantiateBundle(
  bundle: duckdb.DuckDBBundle,
  useBlobWorker: boolean,
  timeoutMs: number
): Promise<duckdb.AsyncDuckDB> {
  let workerUrl = bundle.mainWorker!;
  let createdBlobUrl: string | null = null;

  if (useBlobWorker) {
    createdBlobUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], {
        type: 'text/javascript',
      })
    );
    workerUrl = createdBlobUrl;
  }

  const worker = new Worker(workerUrl);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  try {
    await withTimeout(
      db.instantiate(bundle.mainModule, bundle.pthreadWorker),
      timeoutMs,
      'DuckDB WASM init'
    );
    if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    return db;
  } catch (err) {
    if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    try {
      worker.terminate();
    } catch {
      // Ignore worker cleanup errors
    }
    throw err;
  }
}

async function getDuckDB(forceRetry = false): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  // Avoid tight background retry loops within 15s of a failure unless explicitly forced
  if (!forceRetry && lastFailedAt > 0 && Date.now() - lastFailedAt < 15000 && lastInitError) {
    throw new Error(lastInitError);
  }

  dbState = 'initializing';
  lastInitError = null;

  dbInitPromise = (async () => {
    try {
      const localBundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      try {
        const db = await instantiateBundle(localBundle, false, 45000);
        dbInstance = db;
        dbState = 'ready';
        activeBundleSource = 'local';
        return db;
      } catch (localErr: any) {
        // Fallback: try CDN bundle via same-origin Blob worker if local WASM fetch failed/timed out
        try {
          const cdnBundles = duckdb.getJsDelivrBundles();
          const cdnBundle = await duckdb.selectBundle(cdnBundles);
          const db = await instantiateBundle(cdnBundle, true, 30000);
          dbInstance = db;
          dbState = 'ready';
          activeBundleSource = 'jsdelivr';
          return db;
        } catch {
          throw localErr;
        }
      }
    } catch (err: any) {
      dbState = 'error';
      lastInitError = err?.message || 'Failed to initialize DuckDB-WASM worker.';
      lastFailedAt = Date.now();
      dbInitPromise = null;
      throw new Error(lastInitError);
    }
  })();

  return dbInitPromise;
}

function escapeIdent(name: string): string {
  const safe = name && name.length > 0 ? name : 'column';
  return `"${safe.replace(/"/g, '""')}"`;
}

async function registerDatasetTable(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  rows: RowData[],
  schemas: ColumnSchema[]
): Promise<void> {
  const pureNumericCols = new Set<string>();
  for (const col of schemas) {
    let sawNumber = false;
    let allNumeric = true;
    for (const row of rows) {
      const val = row.data[col.name];
      if (val === null || val === undefined || String(val).trim() === '') continue;
      if (typeof val === 'number' && Number.isFinite(val)) {
        sawNumber = true;
      } else {
        allNumeric = false;
        break;
      }
    }
    if (sawNumber && allNumeric) {
      pureNumericCols.add(col.name);
    }
  }

  const normalizedRows = rows.map((row) => {
    const obj: Record<string, string | number | null> = {};
    for (const col of schemas) {
      const val = row.data[col.name];
      if (val === null || val === undefined) {
        obj[col.name] = null;
      } else if (pureNumericCols.has(col.name)) {
        obj[col.name] = typeof val === 'number' && Number.isFinite(val) ? val : null;
      } else {
        obj[col.name] = String(val);
      }
    }
    return obj;
  });

  await db.registerFileText('dataset.json', JSON.stringify(normalizedRows));
  await conn.query(`DROP TABLE IF EXISTS dataset;`);
  await conn.query(
    `CREATE TABLE dataset AS SELECT * FROM read_json_auto('dataset.json', sample_size=-1);`
  );
  tableReady = true;
}

/**
 * Registers the active dataset into DuckDB-WASM in-memory table `dataset`
 * and computes vectorized SQL statistical column profiles.
 */
export async function syncAndProfileWithDuckDB(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies?: Record<string, ColumnPolicy>,
  forceRetry = false
): Promise<{
  profiles: Record<string, DuckDBColumnProfile>;
  durationMs: number;
  usedWasm: boolean;
  error?: string;
}> {
  const start = performance.now();
  latestDatasetSnapshot = { rows, schemas };

  if (rows.length === 0 || schemas.length === 0) {
    return { profiles: {}, durationMs: 0, usedWasm: true };
  }

  try {
    const db = await getDuckDB(forceRetry);
    const conn = await db.connect();

    try {
      await registerDatasetTable(db, conn, rows, schemas);

      const profiles: Record<string, DuckDBColumnProfile> = {};

      for (const col of schemas) {
        const ident = escapeIdent(col.name);
        const enforced = policies?.[col.name]?.enforcedType;
        const isNumericLike =
          enforced === 'float' ||
          enforced === 'integer' ||
          (!enforced && col.type === 'numeric');

        const nullCheckExpr = `CASE WHEN ${ident} IS NULL OR LOWER(TRIM(CAST(${ident} AS VARCHAR))) IN ('', 'n/a', 'nan', 'null', 'undefined', '?', '-') THEN NULL ELSE ${ident} END`;

        if (isNumericLike) {
          const numExpr = `TRY_CAST(TRIM(CAST(${nullCheckExpr} AS VARCHAR)) AS DOUBLE)`;
          const sql = `
            SELECT
              COUNT(*) AS total_count,
              COUNT(*) - COUNT(${numExpr}) AS null_count,
              COUNT(DISTINCT ${nullCheckExpr}) AS distinct_count,
              AVG(${numExpr}) AS mean_val,
              APPROX_QUANTILE(${numExpr}, 0.5) AS median_val,
              APPROX_QUANTILE(${numExpr}, 0.25) AS q1_val,
              APPROX_QUANTILE(${numExpr}, 0.75) AS q3_val,
              STDDEV_SAMP(${numExpr}) AS stddev_val,
              MIN(${numExpr}) AS min_val,
              MAX(${numExpr}) AS max_val
            FROM dataset;
          `;
          const res = await conn.query(sql);
          const row = res.toArray()[0]?.toJSON() || {};

          profiles[col.name] = {
            columnName: col.name,
            totalCount: Number(row.total_count ?? rows.length),
            nullCount: Number(row.null_count ?? 0),
            distinctCount: Number(row.distinct_count ?? 0),
            mean: row.mean_val !== null && row.mean_val !== undefined ? Number(row.mean_val) : null,
            median: row.median_val !== null && row.median_val !== undefined ? Number(row.median_val) : null,
            q1: row.q1_val !== null && row.q1_val !== undefined ? Number(row.q1_val) : null,
            q3: row.q3_val !== null && row.q3_val !== undefined ? Number(row.q3_val) : null,
            stdDev: row.stddev_val !== null && row.stddev_val !== undefined ? Number(row.stddev_val) : null,
            minVal: row.min_val !== null && row.min_val !== undefined ? Number(row.min_val) : null,
            maxVal: row.max_val !== null && row.max_val !== undefined ? Number(row.max_val) : null,
          };
        } else {
          const sql = `
            SELECT
              COUNT(*) AS total_count,
              COUNT(*) - COUNT(${nullCheckExpr}) AS null_count,
              COUNT(DISTINCT ${nullCheckExpr}) AS distinct_count,
              MIN(CAST(${nullCheckExpr} AS VARCHAR)) AS min_val,
              MAX(CAST(${nullCheckExpr} AS VARCHAR)) AS max_val
            FROM dataset;
          `;
          const res = await conn.query(sql);
          const row = res.toArray()[0]?.toJSON() || {};

          profiles[col.name] = {
            columnName: col.name,
            totalCount: Number(row.total_count ?? rows.length),
            nullCount: Number(row.null_count ?? 0),
            distinctCount: Number(row.distinct_count ?? 0),
            mean: null,
            median: null,
            q1: null,
            q3: null,
            stdDev: null,
            minVal: row.min_val ?? null,
            maxVal: row.max_val ?? null,
          };
        }
      }

      const durationMs = Math.round((performance.now() - start) * 10) / 10;
      return { profiles, durationMs, usedWasm: true };
    } finally {
      await conn.close();
    }
  } catch (err: any) {
    const message = err?.message || 'DuckDB-WASM unavailable';
    console.warn('DuckDB-WASM unavailable, using fallback profiling:', err);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return { profiles: {}, durationMs, usedWasm: false, error: message };
  }
}

/**
 * Executes an arbitrary SQL query against the in-memory `dataset` table in DuckDB-WASM.
 * Automatically retries initialization and ensures the `dataset` table is registered.
 */
export async function executeDuckDBSQL(
  sql: string,
  fallbackRows?: RowData[],
  fallbackSchemas?: ColumnSchema[]
): Promise<SQLQueryResult> {
  const start = performance.now();
  const db = await getDuckDB(true);
  const conn = await db.connect();

  try {
    if (!tableReady) {
      const snapRows = fallbackRows ?? latestDatasetSnapshot?.rows ?? [];
      const snapSchemas = fallbackSchemas ?? latestDatasetSnapshot?.schemas ?? [];
      if (snapRows.length > 0 && snapSchemas.length > 0) {
        await registerDatasetTable(db, conn, snapRows, snapSchemas);
      }
    }

    const result = await conn.query(sql);
    const schemaFields = result.schema.fields.map((f) => f.name);
    const rawRows = result.toArray().map((r) => {
      const json = r.toJSON();
      const plain: Record<string, any> = {};
      for (const key of schemaFields) {
        const val = json[key];
        plain[key] = typeof val === 'bigint' ? Number(val) : val;
      }
      return plain;
    });

    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      columns: schemaFields,
      rows: rawRows.slice(0, 500),
      rowCount: rawRows.length,
      durationMs,
      sql,
    };
  } finally {
    await conn.close();
  }
}
