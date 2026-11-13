import {
  ColumnPolicy,
  ColumnSchema,
  CorruptionConfig,
  DuckDBColumnProfile,
  DuplicateResolutionStrategy,
  ExecutionMode,
  PipelineExecutionInfo,
  RowData,
  TransformationLog,
} from '../types';
import { analyzeAnomalies } from './anomalyDetector';
import { resolveDuplicates, runPolicyClean } from './cleanEngine';
import { corruptDataset } from './corruptionEngine';
import { syncAndProfileWithDuckDB } from './duckdbEngine';

export const HYBRID_THRESHOLD_ROWS = 5000;

function nowTimestamp(): string {
  return new Date().toLocaleTimeString();
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs anomaly detection immediately and routes >=5,000 rows to the server batch API.
 * DuckDB-WASM SQL profiling for <5,000 rows can be awaited or run in background via `runDuckDBProfile`.
 */
export async function runHybridAnalyze(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  operation: 'load' | 'analyze' = 'analyze',
  options?: { deferWasmProfile?: boolean }
): Promise<{
  analyzedRows: RowData[];
  profiles: Record<string, DuckDBColumnProfile>;
  execution: PipelineExecutionInfo;
}> {
  const start = performance.now();

  if (rows.length >= HYBRID_THRESHOLD_ROWS) {
    try {
      const compactRows = rows.map((r) => ({
        _id: r._id,
        data: r.data,
        corruptedMeta: r.corruptedMeta,
        cellLineage: r.cellLineage,
      }));
      const response = await fetchWithTimeout('/api/pipeline/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: compactRows, schemas, policies }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          analyzedRows: result.rows,
          profiles: result.profiles || {},
          execution: {
            mode: 'server_batch',
            rowCount: rows.length,
            durationMs: result.durationMs ?? Math.round((performance.now() - start) * 10) / 10,
            operation,
            sqlProfiled: false,
            timestamp: nowTimestamp(),
          },
        };
      }
    } catch (err) {
      console.warn('Server batch pipeline unavailable, falling back to local engine:', err);
    }

    const analyzedRows = analyzeAnomalies(rows, schemas, policies);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      analyzedRows,
      profiles: {},
      execution: {
        mode: 'local_fallback',
        rowCount: rows.length,
        durationMs,
        operation,
        sqlProfiled: false,
        timestamp: nowTimestamp(),
      },
    };
  }

  const analyzedRows = analyzeAnomalies(rows, schemas, policies);

  if (options?.deferWasmProfile) {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      analyzedRows,
      profiles: {},
      execution: {
        mode: 'local_fallback',
        rowCount: rows.length,
        durationMs,
        operation,
        sqlProfiled: false,
        timestamp: nowTimestamp(),
      },
    };
  }

  const { profiles, usedWasm } = await syncAndProfileWithDuckDB(analyzedRows, schemas, policies);
  const durationMs = Math.round((performance.now() - start) * 10) / 10;
  const mode: ExecutionMode = usedWasm ? 'duckdb_wasm' : 'local_fallback';

  return {
    analyzedRows,
    profiles,
    execution: {
      mode,
      rowCount: rows.length,
      durationMs,
      operation,
      sqlProfiled: usedWasm,
      timestamp: nowTimestamp(),
    },
  };
}

export async function runDuckDBProfile(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>
): Promise<{
  profiles: Record<string, DuckDBColumnProfile>;
  durationMs: number;
  usedWasm: boolean;
}> {
  if (rows.length >= HYBRID_THRESHOLD_ROWS) {
    return { profiles: {}, durationMs: 0, usedWasm: false };
  }
  return syncAndProfileWithDuckDB(rows, schemas, policies);
}

export async function runHybridClean(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>
): Promise<{
  cleanedRows: RowData[];
  logs: TransformationLog[];
  droppedRowCount: number;
  profiles: Record<string, DuckDBColumnProfile>;
  execution: PipelineExecutionInfo;
}> {
  const start = performance.now();

  if (rows.length >= HYBRID_THRESHOLD_ROWS) {
    try {
      const compactRows = rows.map((r) => ({
        _id: r._id,
        data: r.data,
        corruptedMeta: r.corruptedMeta,
        cellLineage: r.cellLineage,
      }));
      const response = await fetchWithTimeout('/api/pipeline/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: compactRows, schemas, policies }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          cleanedRows: result.cleanedRows,
          logs: result.logs,
          droppedRowCount: result.droppedRowCount || 0,
          profiles: result.profiles || {},
          execution: {
            mode: 'server_batch',
            rowCount: result.cleanedRows.length,
            durationMs: result.durationMs ?? Math.round((performance.now() - start) * 10) / 10,
            operation: 'clean',
            sqlProfiled: false,
            timestamp: nowTimestamp(),
          },
        };
      }
    } catch (err) {
      console.warn('Server clean pipeline unreachable, falling back locally:', err);
    }
  }

  const { cleanedRows, logs, droppedRowCount } = runPolicyClean(rows, schemas, policies);
  const reAnalyzed = analyzeAnomalies(cleanedRows, schemas, policies);
  const { profiles, usedWasm } =
    reAnalyzed.length < HYBRID_THRESHOLD_ROWS
      ? await syncAndProfileWithDuckDB(reAnalyzed, schemas, policies)
      : { profiles: {}, usedWasm: false };

  const durationMs = Math.round((performance.now() - start) * 10) / 10;

  return {
    cleanedRows: reAnalyzed,
    logs,
    droppedRowCount,
    profiles,
    execution: {
      mode: usedWasm ? 'duckdb_wasm' : 'local_fallback',
      rowCount: reAnalyzed.length,
      durationMs,
      operation: 'clean',
      sqlProfiled: usedWasm,
      timestamp: nowTimestamp(),
    },
  };
}

export async function runHybridCorrupt(
  originalRows: Record<string, any>[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  config: CorruptionConfig
): Promise<{
  corruptedRows: RowData[];
  profiles: Record<string, DuckDBColumnProfile>;
  execution: PipelineExecutionInfo;
}> {
  const start = performance.now();

  if (originalRows.length >= HYBRID_THRESHOLD_ROWS) {
    try {
      const response = await fetchWithTimeout('/api/pipeline/corrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalRows, schemas, policies, config }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          corruptedRows: result.rows,
          profiles: result.profiles || {},
          execution: {
            mode: 'server_batch',
            rowCount: result.rows.length,
            durationMs: result.durationMs ?? Math.round((performance.now() - start) * 10) / 10,
            operation: 'corrupt',
            sqlProfiled: false,
            timestamp: nowTimestamp(),
          },
        };
      }
    } catch (err) {
      console.warn('Server corrupt pipeline unreachable, falling back locally:', err);
    }
  }

  const corruptedRaw = corruptDataset(originalRows, schemas, config);
  const analyzed = analyzeAnomalies(corruptedRaw, schemas, policies);
  const { profiles, usedWasm } =
    analyzed.length < HYBRID_THRESHOLD_ROWS
      ? await syncAndProfileWithDuckDB(analyzed, schemas, policies)
      : { profiles: {}, usedWasm: false };

  const durationMs = Math.round((performance.now() - start) * 10) / 10;

  return {
    corruptedRows: analyzed,
    profiles,
    execution: {
      mode: usedWasm ? 'duckdb_wasm' : 'local_fallback',
      rowCount: analyzed.length,
      durationMs,
      operation: 'corrupt',
      sqlProfiled: usedWasm,
      timestamp: nowTimestamp(),
    },
  };
}

export async function runHybridDedupe(
  rows: RowData[],
  schemas: ColumnSchema[],
  policies: Record<string, ColumnPolicy>,
  keyColumns: string[],
  strategy: DuplicateResolutionStrategy
): Promise<{
  dedupedRows: RowData[];
  removedCount: number;
  logs: TransformationLog[];
  profiles: Record<string, DuckDBColumnProfile>;
  execution: PipelineExecutionInfo;
}> {
  const start = performance.now();
  const { dedupedRows, removedCount, logs } = resolveDuplicates(rows, schemas, keyColumns, strategy);
  const analyzed = analyzeAnomalies(dedupedRows, schemas, policies);
  const { profiles, usedWasm } =
    analyzed.length < HYBRID_THRESHOLD_ROWS
      ? await syncAndProfileWithDuckDB(analyzed, schemas, policies)
      : { profiles: {}, usedWasm: false };

  const durationMs = Math.round((performance.now() - start) * 10) / 10;
  return {
    dedupedRows: analyzed,
    removedCount,
    logs,
    profiles,
    execution: {
      mode: usedWasm ? 'duckdb_wasm' : 'local_fallback',
      rowCount: analyzed.length,
      durationMs,
      operation: 'dedupe',
      sqlProfiled: usedWasm,
      timestamp: nowTimestamp(),
    },
  };
}
