import React, { useMemo, useRef, useState } from 'react';
import {
  Sliders,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  FileJson,
  BookmarkCheck,
  Eye,
  History,
  RotateCcw,
  Search,
  GitBranch,
  Layers,
  X,
} from 'lucide-react';
import {
  CleaningPipelineManifest,
  CleaningPreviewResult,
  ColumnPolicy,
  ColumnSchema,
  ContractValidationResult,
  DataContractSchema,
  DateFallbackStrategy,
  DuckDBColumnProfile,
  EnforcedColumnType,
  NullStrategy,
  OutlierPolicy,
  RowData,
  TextCaseMode,
  TransformationLog,
} from '../types';
import {
  buildCleaningPipelineManifest,
  buildDataContract,
  validateDatasetAgainstContract,
} from '../utils/policyEngine';
import { previewPolicyClean } from '../utils/cleanEngine';
import {
  exportCleaningPipelineJSON,
  parseCleaningPipelineJSON,
} from '../utils/exportEngine';

interface ColumnPolicyMatrixProps {
  schemas: ColumnSchema[];
  rows: RowData[];
  policies: Record<string, ColumnPolicy>;
  profiles?: Record<string, DuckDBColumnProfile>;
  currentQualityScore: number;
  activeContract?: DataContractSchema | null;
  logs: TransformationLog[];
  onUpdatePolicy: (colName: string, updates: Partial<ColumnPolicy>) => void;
  onBatchUpdatePolicies: (colNames: string[], updates: Partial<ColumnPolicy>) => void;
  onApplyContractPolicies: (contract: DataContractSchema) => void;
  onApplyPipelineManifest: (manifest: CleaningPipelineManifest, runImmediately: boolean) => void;
  onRunPolicyClean: () => void;
  onInspectRowByIndex: (rowIndex: number) => void;
  onRevertCell: (rowIndex: number, colName: string) => void;
  isProcessing: boolean;
}

const CONTRACT_STORAGE_KEY = 'datarefine_saved_contracts_v1';

export const ColumnPolicyMatrix: React.FC<ColumnPolicyMatrixProps> = ({
  schemas,
  rows,
  policies,
  profiles,
  currentQualityScore,
  activeContract,
  logs,
  onUpdatePolicy,
  onBatchUpdatePolicies,
  onApplyContractPolicies,
  onApplyPipelineManifest,
  onRunPolicyClean,
  onInspectRowByIndex,
  onRevertCell,
  isProcessing,
}) => {
  const [contractName, setContractName] = useState(
    activeContract?.contractName || 'production-batch-contract'
  );
  const [contractVersion, setContractVersion] = useState(activeContract?.version || '1.0.0');
  const [contractDesc, setContractDesc] = useState(
    activeContract?.description || 'Column-level type, null, and outlier enforcement standard'
  );
  const [validationResult, setValidationResult] = useState<ContractValidationResult | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [savedContracts, setSavedContracts] = useState<DataContractSchema[]>(() => {
    try {
      const raw = localStorage.getItem(CONTRACT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Batch Multi-Column Controls
  const [batchNull, setBatchNull] = useState<NullStrategy>('median');
  const [batchOutlier, setBatchOutlier] = useState<OutlierPolicy>('iqr_cap');
  const [batchTextCase, setBatchTextCase] = useState<TextCaseMode>('none');
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  // Before/After Cleaning Preview State
  const [previewResult, setPreviewResult] = useState<CleaningPreviewResult | null>(null);

  // Audit Trail Filtering
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pipelineInputRef = useRef<HTMLInputElement>(null);

  const selectedCols = useMemo(
    () => schemas.filter((s) => policies[s.name]?.selectedForBatch).map((s) => s.name),
    [schemas, policies]
  );

  const handleToggleAllBatch = (checked: boolean) => {
    onBatchUpdatePolicies(
      schemas.map((s) => s.name),
      { selectedForBatch: checked }
    );
  };

  const handleRunPreview = () => {
    const res = previewPolicyClean(rows, schemas, policies, currentQualityScore);
    setPreviewResult(res);
  };

  const handleExportContract = () => {
    const contract = buildDataContract(contractName, contractVersion, contractDesc, policies);
    const json = JSON.stringify(contract, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${contract.contractName}-v${contract.version}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPipeline = () => {
    const manifest = buildCleaningPipelineManifest(
      contractName,
      contractVersion,
      contractDesc,
      policies,
      { keyColumns: [], strategy: 'keep_first' }
    );
    exportCleaningPipelineJSON(manifest);
  };

  const handleImportPipelineFile = (file: File, runImmediately: boolean) => {
    setContractError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const manifest = parseCleaningPipelineJSON(String(e.target?.result || '{}'));
        onApplyPipelineManifest(manifest, runImmediately);
        setSavedToast(
          `Loaded pipeline "${manifest.pipelineName} v${manifest.version}"${runImmediately ? ' & executed' : ''}`
        );
        setTimeout(() => setSavedToast(null), 3500);
      } catch (err: any) {
        setContractError(err?.message || 'Failed to parse pipeline JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveToLibrary = () => {
    const contract = buildDataContract(contractName, contractVersion, contractDesc, policies);
    const next = [
      contract,
      ...savedContracts.filter(
        (c) => !(c.contractName === contract.contractName && c.version === contract.version)
      ),
    ].slice(0, 8);
    setSavedContracts(next);
    try {
      localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota error
    }
    const validation = validateDatasetAgainstContract(rows, schemas, contract);
    setValidationResult(validation);
    onApplyContractPolicies(contract);
    setSavedToast(`Saved & validated "${contract.contractName} v${contract.version}"`);
    setTimeout(() => setSavedToast(null), 3000);
  };

  const handleImportContractFile = (file: File) => {
    setContractError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || '{}')) as DataContractSchema;
        if (!parsed || !parsed.columns || typeof parsed.columns !== 'object') {
          setContractError('Invalid Data Contract JSON: missing "columns" policy map.');
          return;
        }
        setContractName(parsed.contractName || 'imported-contract');
        setContractVersion(parsed.version || '1.0.0');
        setContractDesc(parsed.description || '');
        const result = validateDatasetAgainstContract(rows, schemas, parsed);
        setValidationResult(result);
        onApplyContractPolicies(parsed);
      } catch (err: any) {
        setContractError(`Failed to parse contract JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logFilter !== 'all' && log.type !== logFilter && log.actor !== logFilter) return false;
      if (logSearch.trim() !== '') {
        const q = logSearch.toLowerCase();
        return (
          log.column.toLowerCase().includes(q) ||
          String(log.beforeValue).toLowerCase().includes(q) ||
          String(log.afterValue).toLowerCase().includes(q) ||
          log.detectionRule.toLowerCase().includes(q) ||
          log.methodUsed.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, logFilter, logSearch]);

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-slate-900">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold">Granular Policy Engine, Preview &amp; Auto-Clean</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Configure per-column imputation (7 strategies), outlier treatment (5+ methods), text normalization, fuzzy matching threshold, and custom validation rules. Preview exact diffs before committing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRunPreview}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>Preview Changes</span>
          </button>

          <button
            id="apply-policy-clean-btn"
            onClick={() => {
              setPreviewResult(null);
              onRunPolicyClean();
            }}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isProcessing ? 'Executing Pipeline...' : 'Apply Policies & Auto-Clean'}</span>
          </button>
        </div>
      </div>

      {/* Before / After Cleaning Preview Drawer */}
      {previewResult && (
        <div className="p-6 rounded-xl bg-white border border-blue-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Before &amp; After Cleaning Dry-Run Preview
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                <strong>{previewResult.totalImpactedCells.toLocaleString()}</strong> cell modification(s) &middot;{' '}
                <strong>{previewResult.droppedRowCount.toLocaleString()}</strong> row(s) removed &middot;{' '}
                Projected Quality: <strong>{previewResult.currentQualityScore}/100</strong> &rarr;{' '}
                <strong className="text-emerald-700">{previewResult.projectedQualityScore}/100</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewResult(null);
                  onRunPolicyClean();
                }}
                disabled={isProcessing || previewResult.totalImpactedCells === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Commit All {previewResult.totalImpactedCells.toLocaleString()} Changes
              </button>
              <button
                type="button"
                onClick={() => setPreviewResult(null)}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {previewResult.diffs.length > 0 ? (
            <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Row</th>
                    <th className="py-2 px-3">Column</th>
                    <th className="py-2 px-3">Before</th>
                    <th className="py-2 px-3">After</th>
                    <th className="py-2 px-3">Rule</th>
                    <th className="py-2 px-3">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {previewResult.diffs.slice(0, 150).map((d, i) => (
                    <tr key={`${d.rowId}-${d.column}-${i}`}>
                      <td className="py-1.5 px-3 text-slate-500">#{d.rowIndex}</td>
                      <td className="py-1.5 px-3 font-sans font-semibold text-slate-900">
                        {d.column}
                      </td>
                      <td className="py-1.5 px-3 text-red-600 line-through">{d.beforeValue}</td>
                      <td className="py-1.5 px-3 text-emerald-700 font-semibold">{d.afterValue}</td>
                      <td className="py-1.5 px-3 font-sans text-slate-600">{d.rule}</td>
                      <td className="py-1.5 px-3 font-sans text-slate-600">{d.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              Zero modifications would be made under the current column policies.
            </div>
          )}
        </div>
      )}

      {/* Batch Multi-Column Toolbar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-medium tabular-nums">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>
            Batch Multi-Column Actions ({selectedCols.length}/{schemas.length} selected)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={batchNull}
            onChange={(e) => setBatchNull(e.target.value as NullStrategy)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
          >
            <option value="median">Null: Median</option>
            <option value="mean">Null: Mean</option>
            <option value="mode">Null: Mode</option>
            <option value="constant">Null: Constant</option>
            <option value="zero_fill">Null: Zero-Fill</option>
            <option value="forward_fill">Null: Forward-Fill</option>
            <option value="backward_fill">Null: Backward-Fill</option>
            <option value="drop_row">Null: Drop Row</option>
          </select>
          <button
            type="button"
            disabled={selectedCols.length === 0}
            onClick={() => onBatchUpdatePolicies(selectedCols, { nullStrategy: batchNull })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-semibold cursor-pointer"
          >
            Apply Null
          </button>

          <select
            value={batchOutlier}
            onChange={(e) => setBatchOutlier(e.target.value as OutlierPolicy)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
          >
            <option value="iqr_cap">Outlier: IQR Cap</option>
            <option value="zscore_clip">Outlier: Z-Score Clip</option>
            <option value="modified_zscore_clip">Outlier: Modified Z (MAD)</option>
            <option value="percentile_cap">Outlier: Percentile Cap</option>
            <option value="median_replace">Outlier: Median Replace</option>
            <option value="remove_row">Outlier: Remove Row</option>
            <option value="flag_only">Outlier: Flag Only</option>
          </select>
          <button
            type="button"
            disabled={selectedCols.length === 0}
            onClick={() => onBatchUpdatePolicies(selectedCols, { outlierPolicy: batchOutlier })}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-semibold cursor-pointer"
          >
            Apply Outlier
          </button>

          <select
            value={batchTextCase}
            onChange={(e) => setBatchTextCase(e.target.value as TextCaseMode)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
          >
            <option value="none">Case: Preserve</option>
            <option value="title">Case: Title Case</option>
            <option value="lower">Case: lowercase</option>
            <option value="upper">Case: UPPERCASE</option>
          </select>
          <button
            type="button"
            disabled={selectedCols.length === 0}
            onClick={() =>
              onBatchUpdatePolicies(selectedCols, {
                textCase: batchTextCase,
                trimWhitespace: true,
              })
            }
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-semibold cursor-pointer"
          >
            Apply Text
          </button>
        </div>
      </div>

      {/* Column Configuration Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Column Policy Matrix</h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {schemas.length} columns configured &middot; {rows.length.toLocaleString()} active rows
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={selectedCols.length === schemas.length && schemas.length > 0}
                    onChange={(e) => handleToggleAllBatch(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                    title="Select all columns for batch actions"
                  />
                </th>
                <th className="py-3 px-4">Column &amp; Telemetry</th>
                <th className="py-3 px-4">Type Enforcement</th>
                <th className="py-3 px-4">Null Strategy</th>
                <th className="py-3 px-4">Outlier Policy</th>
                <th className="py-3 px-4">Normalization &amp; Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {schemas.map((col) => {
                const policy = policies[col.name];
                if (!policy) return null;

                const profile = profiles?.[col.name];
                const flaggedCount = rows.filter(
                  (r) => r.anomalyInfo?.cellAnomalies?.[col.name]?.isAnomaly
                ).length;
                const isNumeric =
                  policy.enforcedType === 'float' || policy.enforcedType === 'integer';
                const isDate = policy.enforcedType === 'date';
                const isExpanded = expandedCol === col.name;

                return (
                  <React.Fragment key={col.name}>
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-3 text-center align-top">
                        <input
                          type="checkbox"
                          checked={policy.selectedForBatch}
                          onChange={(e) =>
                            onUpdatePolicy(col.name, { selectedForBatch: e.target.checked })
                          }
                          className="rounded border-slate-300 text-blue-600 mt-1"
                        />
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-900 text-sm">{col.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          <span>{profile ? profile.distinctCount : col.distinctCount} distinct</span>
                          <span aria-hidden="true"> &middot; </span>
                          <span>{profile ? profile.nullCount : 0} nulls</span>
                          {flaggedCount > 0 && (
                            <>
                              <span aria-hidden="true"> &middot; </span>
                              <span className="text-red-600 font-semibold">
                                {flaggedCount} flagged
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedCol(isExpanded ? null : col.name)}
                          className="mt-1.5 text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
                        >
                          {isExpanded ? 'Hide validation rules' : 'Custom bounds & regex rules'}
                        </button>
                      </td>

                      {/* Type Enforcement */}
                      <td className="py-3.5 px-4 align-top">
                        <select
                          aria-label={`Type enforcement for ${col.name}`}
                          value={policy.enforcedType}
                          onChange={(e) =>
                            onUpdatePolicy(col.name, {
                              enforcedType: e.target.value as EnforcedColumnType,
                            })
                          }
                          className="w-full min-w-[130px] bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-500"
                        >
                          <option value="float">Float (Decimal)</option>
                          <option value="integer">Integer (Whole)</option>
                          <option value="date">ISO Date</option>
                          <option value="categorical">Categorical</option>
                          <option value="boolean">Boolean (True/False)</option>
                          <option value="text">String / Text</option>
                          <option value="id">Identifier (ID)</option>
                        </select>
                        <label className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={policy.required}
                            onChange={(e) =>
                              onUpdatePolicy(col.name, { required: e.target.checked })
                            }
                            className="rounded border-slate-300 text-blue-600"
                          />
                          <span>Required in contract</span>
                        </label>
                      </td>

                      {/* Null Strategy (all 7+ options) */}
                      <td className="py-3.5 px-4 align-top">
                        <select
                          aria-label={`Null strategy for ${col.name}`}
                          value={policy.nullStrategy}
                          onChange={(e) =>
                            onUpdatePolicy(col.name, {
                              nullStrategy: e.target.value as NullStrategy,
                            })
                          }
                          className="w-full min-w-[160px] bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-500"
                        >
                          <option value="median">Median Imputation</option>
                          <option value="mean">Mean Imputation</option>
                          <option value="mode">Mode (Most Frequent)</option>
                          <option value="forward_fill">Forward-Fill</option>
                          <option value="backward_fill">Backward-Fill</option>
                          <option value="constant">Constant / Custom</option>
                          <option value="zero_fill">Zero-Fill (0)</option>
                          <option value="drop_row">Drop Row</option>
                        </select>

                        {(policy.nullStrategy === 'constant' || policy.nullStrategy === 'custom') && (
                          <input
                            type="text"
                            value={policy.customDefaultValue}
                            onChange={(e) =>
                              onUpdatePolicy(col.name, { customDefaultValue: e.target.value })
                            }
                            placeholder="Constant fill value..."
                            className="mt-2 w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
                          />
                        )}
                      </td>

                      {/* Outlier Policy (5+ options) */}
                      <td className="py-3.5 px-4 align-top">
                        <select
                          aria-label={`Outlier policy for ${col.name}`}
                          value={policy.outlierPolicy}
                          disabled={!isNumeric}
                          onChange={(e) =>
                            onUpdatePolicy(col.name, {
                              outlierPolicy: e.target.value as OutlierPolicy,
                            })
                          }
                          className="w-full min-w-[175px] bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="iqr_cap">IQR Cap (Winsorize)</option>
                          <option value="zscore_clip">Z-Score Clipping</option>
                          <option value="modified_zscore_clip">Modified Z-Score (MAD)</option>
                          <option value="percentile_cap">Percentile Cap (P1-P99)</option>
                          <option value="median_replace">Median Replace</option>
                          <option value="remove_row">Remove Outlier Row</option>
                          <option value="flag_only">Flag-Only (No Mutate)</option>
                        </select>

                        {isNumeric && policy.outlierPolicy === 'iqr_cap' && (
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                            <span>IQR Factor:</span>
                            <select
                              value={policy.iqrMultiplier}
                              onChange={(e) =>
                                onUpdatePolicy(col.name, { iqrMultiplier: Number(e.target.value) })
                              }
                              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] text-slate-800"
                            >
                              <option value={1.5}>1.5x (Standard)</option>
                              <option value={3.0}>3.0x (Conservative)</option>
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Normalization / Fuzzy Threshold / Date Fallback */}
                      <td className="py-3.5 px-4 align-top space-y-2">
                        {isDate ? (
                          <div className="space-y-1.5">
                            <select
                              value={policy.dateTargetFormat}
                              onChange={(e) =>
                                onUpdatePolicy(col.name, {
                                  dateTargetFormat: e.target.value as any,
                                })
                              }
                              className="w-full min-w-[150px] bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                            >
                              <option value="YYYY-MM-DD">ISO (YYYY-MM-DD)</option>
                              <option value="MM/DD/YYYY">US (MM/DD/YYYY)</option>
                              <option value="DD-MM-YYYY">EU (DD-MM-YYYY)</option>
                            </select>
                            <select
                              value={policy.dateFallbackStrategy}
                              onChange={(e) =>
                                onUpdatePolicy(col.name, {
                                  dateFallbackStrategy: e.target.value as DateFallbackStrategy,
                                })
                              }
                              className="w-full bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            >
                              <option value="median">Missing Date: Inferred Median</option>
                              <option value="forward_fill">Missing Date: Forward Fill</option>
                              <option value="backward_fill">Missing Date: Backward Fill</option>
                              <option value="nearest">Missing Date: Nearest Valid</option>
                              <option value="custom">Missing Date: Custom Value</option>
                            </select>
                          </div>
                        ) : policy.enforcedType === 'categorical' || policy.enforcedType === 'text' ? (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={policy.typoNormalization}
                                onChange={(e) =>
                                  onUpdatePolicy(col.name, { typoNormalization: e.target.checked })
                                }
                                className="rounded border-slate-300 text-blue-600"
                              />
                              <span>Fuzzy typo correction</span>
                            </label>
                            {policy.typoNormalization && (
                              <div className="text-[11px] text-slate-500">
                                <div className="flex justify-between tabular-nums">
                                  <span>Match Threshold</span>
                                  <span className="font-mono font-semibold text-slate-800">
                                    {Math.round(policy.fuzzyThreshold * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0.50"
                                  max="0.98"
                                  step="0.02"
                                  value={policy.fuzzyThreshold}
                                  onChange={(e) =>
                                    onUpdatePolicy(col.name, {
                                      fuzzyThreshold: parseFloat(e.target.value),
                                    })
                                  }
                                  className="w-full h-1.5 bg-slate-200 rounded-lg accent-blue-600 cursor-pointer"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <select
                                value={policy.textCase}
                                onChange={(e) =>
                                  onUpdatePolicy(col.name, {
                                    textCase: e.target.value as TextCaseMode,
                                  })
                                }
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-800"
                              >
                                <option value="none">Preserve Case</option>
                                <option value="title">Title Case</option>
                                <option value="lower">lowercase</option>
                                <option value="upper">UPPERCASE</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {policy.enforcedType === 'boolean'
                              ? 'Normalizes yes/no/1/0 -> true/false'
                              : 'Type & range enforced'}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable Custom Validation Rules Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Min Numeric Bound
                              </label>
                              <input
                                type="number"
                                value={policy.minBound ?? ''}
                                onChange={(e) =>
                                  onUpdatePolicy(col.name, {
                                    minBound: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="No min"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Max Numeric Bound
                              </label>
                              <input
                                type="number"
                                value={policy.maxBound ?? ''}
                                onChange={(e) =>
                                  onUpdatePolicy(col.name, {
                                    maxBound: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="No max"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Regex Pattern Rule
                              </label>
                              <input
                                type="text"
                                value={policy.regexPattern}
                                onChange={(e) =>
                                  onUpdatePolicy(col.name, { regexPattern: e.target.value })
                                }
                                placeholder="e.g. ^[A-Z0-9-]+$"
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                              />
                            </div>
                            <div className="flex flex-col justify-end gap-2">
                              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={policy.nonNegative}
                                  onChange={(e) =>
                                    onUpdatePolicy(col.name, { nonNegative: e.target.checked })
                                  }
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Enforce Non-Negative (&ge; 0)</span>
                              </label>
                              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={policy.trimWhitespace}
                                  onChange={(e) =>
                                    onUpdatePolicy(col.name, { trimWhitespace: e.target.checked })
                                  }
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Trim Leading/Trailing Spaces</span>
                              </label>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reusable Cleaning Pipeline & Schema Contract Builder */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">
                Data Contract &amp; Reusable Cleaning Pipeline
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Export or replay your exact column cleaning rules as a versioned JSON Pipeline or Data Contract for recurring datasets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleImportContractFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
            <input
              ref={pipelineInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleImportPipelineFile(e.target.files[0], true);
                  e.target.value = '';
                }
              }}
            />

            <button
              type="button"
              onClick={() => pipelineInputRef.current?.click()}
              className="px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Replay Pipeline JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportPipeline}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Pipeline JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Validate Contract</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToLibrary}
              className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Save Preset</span>
            </button>

            <button
              type="button"
              onClick={handleExportContract}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Contract JSON</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Identifier</label>
            <input
              type="text"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Version</label>
            <input
              type="text"
              value={contractVersion}
              onChange={(e) => setContractVersion(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={contractDesc}
              onChange={(e) => setContractDesc(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
        </div>

        {savedToast && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedToast}</span>
          </div>
        )}

        {contractError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{contractError}</span>
          </div>
        )}

        {validationResult && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                Validation: {validationResult.contractName} v{validationResult.version}
              </span>
              <span className="text-slate-600 tabular-nums">
                {validationResult.isValid
                  ? 'All invariants satisfied'
                  : `${validationResult.totalViolations.toLocaleString()} violations`}
              </span>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Column</th>
                    <th className="py-2 px-3">Expected</th>
                    <th className="py-2 px-3">Observed</th>
                    <th className="py-2 px-3 text-right">Violations</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validationResult.columnResults.map((res) => (
                    <tr key={res.columnName}>
                      <td className="py-2 px-3 font-semibold">{res.columnName}</td>
                      <td className="py-2 px-3 font-mono">{res.expectedType}</td>
                      <td className="py-2 px-3 font-mono">{res.actualType}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {res.violationCount}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            res.status === 'pass'
                              ? 'text-emerald-700'
                              : res.status === 'warning'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }`}
                        >
                          {res.status === 'pass' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>{res.message}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Cell Transformation Audit Trail */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Interactive Cleaning Audit Trail &amp; Cell Rollback
              </h3>
              <p className="text-xs text-slate-500">
                Every changed cell records original value, detection rule, method applied, and confidence score
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search column, rule, value..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="bg-white border border-slate-300 text-slate-900 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-3 py-1.5"
            >
              <option value="all">All Events ({logs.length})</option>
              <option value="missing">Missing Imputation</option>
              <option value="outlier">Outlier Treatment</option>
              <option value="date_format">Date Standardization</option>
              <option value="typo">Typo &amp; Text</option>
              <option value="validation">Validation Rules</option>
              <option value="duplicate">Duplicates</option>
              <option value="manual_override">Manual Override</option>
              <option value="rollback">Rollbacks</option>
            </select>
          </div>
        </div>

        {logs.length > 0 ? (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Row</th>
                  <th className="py-2.5 px-3">Column</th>
                  <th className="py-2.5 px-3">Detection Rule</th>
                  <th className="py-2.5 px-3">Before</th>
                  <th className="py-2.5 px-3">After</th>
                  <th className="py-2.5 px-3">Action Taken</th>
                  <th className="py-2.5 px-3 text-right">Conf.</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.slice(0, 250).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-500 tabular-nums">
                      #{log.rowIndex}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{log.column}</td>
                    <td className="py-2 px-3 text-slate-700">{log.detectionRule}</td>
                    <td className="py-2 px-3 font-mono text-red-600 line-through">
                      {String(log.beforeValue)}
                    </td>
                    <td className="py-2 px-3 font-mono text-emerald-700 font-semibold">
                      {String(log.afterValue)}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{log.methodUsed}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700 tabular-nums">
                      {log.confidenceScore}%
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {log.afterValue !== 'ROW DROPPED' && log.afterValue !== 'ROW REMOVED' && (
                          <button
                            type="button"
                            onClick={() => onInspectRowByIndex(log.rowIndex - 1)}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                            title="Inspect row"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {log.actor !== 'rollback' &&
                          log.afterValue !== 'ROW DROPPED' &&
                          log.afterValue !== 'ROW REMOVED' && (
                            <button
                              type="button"
                              onClick={() => onRevertCell(log.rowIndex - 1, log.column)}
                              className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer"
                              title="Revert single cell"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            No transformations logged yet. Preview or run Auto-Clean to populate the audit trail.
          </div>
        )}
      </div>
    </div>
  );
};
