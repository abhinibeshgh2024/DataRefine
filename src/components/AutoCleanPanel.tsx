import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  History,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Eye,
  Sliders,
} from 'lucide-react';
import { ColumnPolicy, ColumnSchema, TransformationLog } from '../types';

interface AutoCleanPanelProps {
  schemas: ColumnSchema[];
  policies: Record<string, ColumnPolicy>;
  onRunClean: () => void;
  onOpenPolicies: () => void;
  onInspectRowByIndex: (rowIndex: number) => void;
  onRevertCell: (rowIndex: number, colName: string) => void;
  logs: TransformationLog[];
  isCleaned: boolean;
  isProcessing: boolean;
  totalAnomaliesCount: number;
}

export const AutoCleanPanel: React.FC<AutoCleanPanelProps> = ({
  schemas,
  policies,
  onRunClean,
  onOpenPolicies,
  onInspectRowByIndex,
  onRevertCell,
  logs,
  isCleaned,
  isProcessing,
  totalAnomaliesCount,
}) => {
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
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

  const selectedLog = logs.find((l) => l.id === selectedLogId) || null;

  return (
    <div className="space-y-6">
      {/* Top Action Card */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Policy-Driven Auto-Clean &amp; Audit Trail
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Executes per-column type enforcement, null imputation, outlier winsorization, date normalization, and fuzzy typo correction while logging every cell transformation with statistical confidence and rollback lineage.
          </p>
          <div className="mt-2 text-xs text-slate-600 tabular-nums">
            <span>{totalAnomalousRowsText(totalAnomaliesCount)}</span>
            <span className="mx-2 text-slate-300">&middot;</span>
            <span>{schemas.length} column policies active</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenPolicies}
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Edit Column Policies</span>
          </button>

          <button
            id="run-auto-clean-btn"
            onClick={onRunClean}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isProcessing
                ? 'Cleaning Dataset...'
                : isCleaned
                ? 'Re-Run Policy Auto-Clean'
                : 'Run Auto-Clean Now'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact Active Policy Summary Strip */}
      <div className="p-5 rounded-xl bg-white border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Active Column Rules Summary</h3>
          <span className="text-xs text-slate-500">Configured in Column Policies</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {schemas.map((col) => {
            const p = policies[col.name];
            if (!p) return null;
            return (
              <div
                key={col.name}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1"
              >
                <div className="font-semibold text-slate-900 truncate">{col.name}</div>
                <div className="text-[11px] text-slate-600 font-mono">
                  {p.enforcedType} &middot; null: {p.nullStrategy}
                </div>
                <div className="text-[11px] text-slate-500">
                  {p.enforcedType === 'float' || p.enforcedType === 'integer'
                    ? `Outliers: ${p.outlierPolicy}`
                    : p.enforcedType === 'date'
                    ? `Format: ${p.dateTargetFormat}`
                    : p.typoNormalization
                    ? 'Fuzzy typo normalization'
                    : 'Exact preserve'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Cell Lineage Spotlight */}
      {selectedLog && (
        <div className="p-5 rounded-xl bg-white border border-blue-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <History className="w-4 h-4 text-blue-600" />
              <span>
                Lineage Trace &mdash; Row #{selectedLog.rowIndex}, Column{' '}
                <code className="font-mono text-blue-700">{selectedLog.column}</code>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onInspectRowByIndex(selectedLog.rowIndex - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Inspect Full Row</span>
              </button>
              {selectedLog.actor !== 'rollback' && selectedLog.afterValue !== 'ROW DROPPED' && (
                <button
                  type="button"
                  onClick={() => onRevertCell(selectedLog.rowIndex - 1, selectedLog.column)}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert Cell</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-100">
            <div>
              <div className="text-slate-400">Original Value</div>
              <div className="font-mono font-semibold text-slate-900 mt-0.5">
                {selectedLog.originalValue}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Detection Rule</div>
              <div className="font-medium text-slate-900 mt-0.5">{selectedLog.detectionRule}</div>
            </div>
            <div>
              <div className="text-slate-400">Action Taken</div>
              <div className="font-medium text-emerald-700 mt-0.5">{selectedLog.methodUsed}</div>
            </div>
            <div>
              <div className="text-slate-400">Confidence Score</div>
              <div className="font-mono font-bold text-blue-700 mt-0.5 tabular-nums">
                {selectedLog.confidenceScore}% (Statistical certainty)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Transformation Audit Trail */}
      <div className="p-6 rounded-xl bg-white border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Interactive Data Lineage &amp; Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Click any audit record to trace detection rule, confidence score, or revert a single cell
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
              className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All Events</option>
              <option value="missing">Missing Imputation</option>
              <option value="outlier">Outlier Policy</option>
              <option value="date_format">Date Format</option>
              <option value="typo">Typo &amp; Whitespace</option>
              <option value="manual_override">Manual Override</option>
              <option value="rollback">Rollbacks</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {logs.length > 0 ? (
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Row</th>
                  <th className="py-2.5 px-3">Column</th>
                  <th className="py-2.5 px-3">Detection Rule</th>
                  <th className="py-2.5 px-3">Before</th>
                  <th className="py-2.5 px-3">After</th>
                  <th className="py-2.5 px-3">Action Taken</th>
                  <th className="py-2.5 px-3 text-right">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.slice(0, 250).map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedLogId === log.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-500 tabular-nums">
                      #{log.rowIndex}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{log.column}</td>
                    <td className="py-2.5 px-3 text-slate-700">{log.detectionRule}</td>
                    <td className="py-2.5 px-3 font-mono text-red-600 line-through">
                      {log.beforeValue}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                      {log.afterValue}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{log.methodUsed}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700 tabular-nums">
                      {log.confidenceScore}%
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectRowByIndex(log.rowIndex - 1);
                          }}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title="Inspect row lineage"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {log.actor !== 'rollback' && log.afterValue !== 'ROW DROPPED' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevertCell(log.rowIndex - 1, log.column);
                            }}
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
          ) : (
            <div className="p-12 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No transformations logged yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                Run Auto-Clean or edit a cell manually to populate the interactive lineage audit trail.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function totalAnomalousRowsText(count: number): string {
  if (count === 0) return '0 anomalous rows flagged';
  if (count === 1) return '1 anomalous row flagged';
  return `${count.toLocaleString()} anomalous rows flagged`;
}
