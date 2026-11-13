import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { analyzeAnomalies } from './src/utils/anomalyDetector.ts';
import { runPolicyClean } from './src/utils/cleanEngine.ts';
import { corruptDataset } from './src/utils/corruptionEngine.ts';
import type { ColumnPolicy, ColumnSchema, CorruptionConfig, RowData } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const compressedAssetCache = new Map<
  string,
  { gzip: Buffer; br: Buffer; contentType: string }
>();

function resolveSafeAssetPath(reqPath: string): string | null {
  const cleanRel = reqPath.replace(/^\/+/, '');
  const roots =
    process.env.NODE_ENV === 'production'
      ? [path.resolve(__dirname, 'dist'), __dirname]
      : [__dirname];

  for (const root of roots) {
    const candidate = path.resolve(root, cleanRel);
    if (
      (candidate === root || candidate.startsWith(root + path.sep)) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  // Compress large DuckDB-WASM binaries & worker scripts so they stay well below Cloud Run's 32MB response cap
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const isWasm = req.path.endsWith('.wasm');
    const isDuckWorker = req.path.includes('duckdb') && req.path.endsWith('.js');
    if (!isWasm && !isDuckWorker) return next();

    const filePath = resolveSafeAssetPath(req.path);
    if (!filePath) return next();

    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const useBr = acceptEncoding.includes('br');
    const useGzip = acceptEncoding.includes('gzip');
    if (!useBr && !useGzip) return next();

    let entry = compressedAssetCache.get(filePath);
    if (!entry) {
      const raw = fs.readFileSync(filePath);
      entry = {
        gzip: zlib.gzipSync(raw, { level: 6 }),
        br: zlib.brotliCompressSync(raw, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
        }),
        contentType: isWasm
          ? 'application/wasm'
          : 'application/javascript; charset=utf-8',
      };
      compressedAssetCache.set(filePath, entry);
    }

    const payload = useBr ? entry.br : entry.gzip;
    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', payload.length);
    res.status(200).send(payload);
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'express-batch-worker',
      hybridThresholdRows: 5000,
    });
  });

  app.post('/api/pipeline/analyze', (req, res) => {
    const start = performance.now();
    const body = req.body as {
      rows: RowData[];
      schemas: ColumnSchema[];
      policies: Record<string, ColumnPolicy>;
    };

    if (!Array.isArray(body?.rows) || !Array.isArray(body?.schemas)) {
      res.status(400).json({ error: 'Invalid payload: rows and schemas arrays are required.' });
      return;
    }

    const analyzed = analyzeAnomalies(body.rows, body.schemas, body.policies);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    res.json({
      rows: analyzed,
      profiles: {},
      durationMs,
      engine: 'server_batch',
    });
  });

  app.post('/api/pipeline/clean', (req, res) => {
    const start = performance.now();
    const body = req.body as {
      rows: RowData[];
      schemas: ColumnSchema[];
      policies: Record<string, ColumnPolicy>;
    };

    if (!Array.isArray(body?.rows) || !Array.isArray(body?.schemas)) {
      res.status(400).json({ error: 'Invalid payload: rows and schemas arrays are required.' });
      return;
    }

    const { cleanedRows, logs, droppedRowCount } = runPolicyClean(body.rows, body.schemas, body.policies || {});
    const reAnalyzed = analyzeAnomalies(cleanedRows, body.schemas, body.policies);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    res.json({
      cleanedRows: reAnalyzed,
      logs: logs.slice(0, 2000),
      droppedRowCount,
      profiles: {},
      durationMs,
      engine: 'server_batch',
    });
  });

  app.post('/api/pipeline/corrupt', (req, res) => {
    const start = performance.now();
    const body = req.body as {
      originalRows: Record<string, any>[];
      schemas: ColumnSchema[];
      policies: Record<string, ColumnPolicy>;
      config: CorruptionConfig;
    };

    if (!Array.isArray(body?.originalRows) || !Array.isArray(body?.schemas) || !body?.config) {
      res.status(400).json({ error: 'Invalid payload: originalRows, schemas, and config are required.' });
      return;
    }

    const corrupted = corruptDataset(body.originalRows, body.schemas, body.config);
    const analyzed = analyzeAnomalies(corrupted, body.schemas, body.policies);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    res.json({
      rows: analyzed,
      profiles: {},
      durationMs,
      engine: 'server_batch',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DataRefine server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
