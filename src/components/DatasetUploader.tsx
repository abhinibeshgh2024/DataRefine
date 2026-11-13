import React, { useRef, useState } from 'react';
import { Upload, ArrowRight, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { SampleDataset } from '../types';
import { SAMPLE_DATASETS } from '../utils/sampleData';
import { parseAnyCSVFile, parseExcelSheetFromBuffer } from '../utils/csvLoader';

interface DatasetUploaderProps {
  onLoadDataset: (
    filename: string,
    rawRows: Record<string, any>[],
    fileFormat?: 'csv' | 'xlsx' | 'json' | 'sample'
  ) => Promise<void> | void;
  onSelectSample: (sample: SampleDataset) => void;
  externalError?: string | null;
}

export const DatasetUploader: React.FC<DatasetUploaderProps> = ({
  onLoadDataset,
  onSelectSample,
  externalError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<string>('');
  const [pendingExcel, setPendingExcel] = useState<{
    filename: string;
    sheetNames: string[];
    buffer: ArrayBuffer;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setPendingExcel(null);
    setIsParsing(true);
    setParseProgress(`Reading ${file.name}...`);

    try {
      const parsed = await parseAnyCSVFile(file);
      if (parsed.needsSheetSelection && parsed.sheetNames && parsed.rawBuffer) {
        setPendingExcel({
          filename: parsed.filename,
          sheetNames: parsed.sheetNames,
          buffer: parsed.rawBuffer,
        });
        setParseProgress('');
        setIsParsing(false);
        return;
      }
      setParseProgress(`Profiling ${parsed.rows.length.toLocaleString()} rows...`);
      await onLoadDataset(parsed.filename, parsed.rows, parsed.fileFormat);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse the uploaded data file.');
    } finally {
      setIsParsing(false);
      setParseProgress('');
    }
  };

  const handlePickSheet = async (sheetName: string) => {
    if (!pendingExcel) return;
    setErrorMsg(null);
    setIsParsing(true);
    setParseProgress(`Extracting worksheet "${sheetName}"...`);
    try {
      const parsed = parseExcelSheetFromBuffer(
        pendingExcel.buffer,
        pendingExcel.filename,
        sheetName
      );
      setPendingExcel(null);
      await onLoadDataset(`${parsed.filename} (${sheetName})`, parsed.rows, 'xlsx');
    } catch (err: any) {
      setErrorMsg(err?.message || `Failed to load sheet "${sheetName}".`);
    } finally {
      setIsParsing(false);
      setParseProgress('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const visibleError = errorMsg || externalError;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-medium text-blue-600 mb-2">
          100% Local &amp; Private Processing &middot; Zero External API Keys
        </p>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight text-balance">
          Profile, audit, and clean any CSV, Excel, or JSON dataset
        </h2>
        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
          Upload tabular files with automatic delimiter &amp; encoding detection, inspect column-level statistics and quality scores, query with natural language or SQL, and export audited reports.
        </p>
      </div>

      {visibleError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{visibleError}</span>
        </div>
      )}

      {/* Multi-Sheet Excel Picker */}
      {pendingExcel && (
        <div className="mb-6 p-5 rounded-xl bg-white border border-blue-200 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Select Worksheet from {pendingExcel.filename}</span>
          </div>
          <p className="text-xs text-slate-500">
            This Excel workbook contains {pendingExcel.sheetNames.length} worksheets. Choose the sheet you want to profile and clean:
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingExcel.sheetNames.map((sheet) => (
              <button
                key={sheet}
                type="button"
                onClick={() => handlePickSheet(sheet)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
              >
                {sheet}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload Drag & Drop Zone */}
      <div
        id="csv-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!isParsing) fileInputRef.current?.click();
        }}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50/60'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.json,text/csv,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              handleFile(file);
            }
          }}
        />

        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
          <Upload className="w-6 h-6" />
        </div>

        <h3 className="text-base font-semibold text-slate-900">
          {isParsing
            ? parseProgress || 'Reading & profiling dataset...'
            : 'Drop any CSV, Excel (.xlsx/.xls), or JSON file here'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          or <span className="text-blue-600 underline font-medium">browse from disk</span>
        </p>
        <p className="text-xs text-slate-400 mt-3 tabular-nums">
          UTF-8 &amp; Windows-1252 encoding fallback &middot; Multi-sheet Excel picker &middot; &lt; 5,000 rows: DuckDB-WASM &middot; &ge; 5,000 rows: Server Batch
        </p>
      </div>

      {/* Preset Clean Sample Datasets */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Reference &amp; Benchmark Datasets
          </h3>
          <span className="text-xs text-slate-500">Click any dataset to load</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              type="button"
              key={sample.id}
              id={`sample-dataset-${sample.id}`}
              disabled={isParsing}
              onClick={() => onSelectSample(sample)}
              className="group text-left p-5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 disabled:opacity-60 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5 tabular-nums">
                <span className="font-medium text-slate-700">{sample.category}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{sample.rowCount.toLocaleString()} rows</span>
                {sample.rowCount >= 5000 && (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <span className="text-blue-600 font-medium">Server Batch Route</span>
                  </>
                )}
              </div>

              <h4 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                {sample.name}
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {sample.description}
              </p>

              <div className="mt-4 flex items-center text-xs font-semibold text-blue-600">
                <span>Load Dataset</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
