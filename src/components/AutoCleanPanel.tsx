import React, { useState } from 'react';
import { Sparkles, Sliders, CheckCircle, FileSpreadsheet, Search, RefreshCw, History, ShieldCheck, ArrowRight } from 'lucide-react';
import { AutoCleanConfig, TransformationLog } from '../types';

interface AutoCleanPanelProps {
  onRunClean: (config: AutoCleanConfig) => void;
  logs: TransformationLog[];
  isCleaned: boolean;
  totalAnomaliesCount: number;
}

export const AutoCleanPanel: React.FC<AutoCleanPanelProps> = ({
  onRunClean,
  logs,
  isCleaned,
  totalAnomaliesCount,
}) => {
  const [numericMethod, setNumericMethod] = useState<'median' | 'mean'>('median');
  const [outlierStrategy, setOutlierStrategy] = useState<'iqr_cap' | 'median_replace' | 'keep'>('iqr_cap');
  const [iqrMultiplier, setIqrMultiplier] = useState<number>(1.5);
  const [dateTargetFormat, setDateTargetFormat] = useState<'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY'>('YYYY-MM-DD');
  const [typoMatching, setTypoMatching] = useState<boolean>(true);

  const [logFilter, setLogFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');

  const handleClean = () => {
    onRunClean({
      numericMethod,
      outlierStrategy,
      iqrMultiplier,
      dateTargetFormat,
      typoMatching,
      fuzzyThreshold: 0.8,
    });
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter !== 'all' && log.type !== logFilter) return false;
    if (logSearch.trim() !== '') {
      const q = logSearch.toLowerCase();
      return (
        log.column.toLowerCase().includes(q) ||
        String(log.beforeValue).toLowerCase().includes(q) ||
        String(log.afterValue).toLowerCase().includes(q) ||
        log.methodUsed.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Trigger Button */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-800">Statistical Auto-Clean Engine</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Automatically imputes missing numeric values using statistical medians/means, caps outlier spikes via IQR Winsorization, normalizes messy date formats to standard ISO 8601, and fixes spelling typos using Levenshtein distance.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            id="run-auto-clean-btn"
            onClick={handleClean}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-100 flex items-center justify-center space-x-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
          >
            <Sparkles className="w-4 h-4 fill-white" />
            <span>{isCleaned ? 'Re-Run Auto-Clean' : 'Run Auto-Clean Now'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Auto-Clean Strategy Settings */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-2 pb-4 border-b border-slate-200">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-slate-800 text-sm">Auto-Cleaning & Imputation Rules</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 text-xs">
          {/* Rule 1: Missing Numeric */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="font-bold text-slate-800 block">Numeric Imputation</label>
            <p className="text-[11px] text-slate-500">Strategy for missing numerical cells</p>
            <select
              value={numericMethod}
              onChange={(e) => setNumericMethod(e.target.value as any)}
              className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="median">Column Median (Recommended)</option>
              <option value="mean">Column Mean</option>
            </select>
          </div>

          {/* Rule 2: Outliers */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="font-bold text-slate-800 block">Outlier Capping</label>
            <p className="text-[11px] text-slate-500">Winsorization or replacement for spikes</p>
            <select
              value={outlierStrategy}
              onChange={(e) => setOutlierStrategy(e.target.value as any)}
              className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="iqr_cap">Winsorize IQR Cap (Recommended)</option>
              <option value="median_replace">Replace with Median</option>
              <option value="keep">Keep Outliers</option>
            </select>
          </div>

          {/* Rule 3: Date Standard */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="font-bold text-slate-800 block">Date Standardization</label>
            <p className="text-[11px] text-slate-500">Target unified date format</p>
            <select
              value={dateTargetFormat}
              onChange={(e) => setDateTargetFormat(e.target.value as any)}
              className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="YYYY-MM-DD">ISO Standard (YYYY-MM-DD)</option>
              <option value="MM/DD/YYYY">US Format (MM/DD/YYYY)</option>
              <option value="DD-MM-YYYY">EU Format (DD-MM-YYYY)</option>
            </select>
          </div>

          {/* Rule 4: Typo Fuzzy Match */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="font-bold text-slate-800 block">Fuzzy Typo Correction</label>
            <p className="text-[11px] text-slate-500">Levenshtein distance mode matching</p>
            <label className="flex items-center space-x-2 mt-2 cursor-pointer text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={typoMatching}
                onChange={(e) => setTypoMatching(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Enable String Distance Fix</span>
            </label>
          </div>
        </div>
      </div>

      {/* Transformation Audit Log Section */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">Transformation Audit Log</h3>
              <p className="text-xs text-slate-500">
                Detailed change history of every cell modified by the Auto-Clean engine
              </p>
            </div>
          </div>

          {/* Log Filters */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search logs..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All Audit Types</option>
              <option value="missing">Missing</option>
              <option value="outlier">Outlier</option>
              <option value="date_format">Date Format</option>
              <option value="typo">Typo</option>
            </select>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="mt-4 overflow-x-auto">
          {logs.length > 0 ? (
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="p-3 w-12">Row</th>
                  <th className="p-3">Column</th>
                  <th className="p-3">Issue Type</th>
                  <th className="p-3">Before Value</th>
                  <th className="p-3">Cleaned Value</th>
                  <th className="p-3">Method Applied</th>
                  <th className="p-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-500">#{log.rowIndex}</td>
                    <td className="p-3 font-bold text-slate-800">{log.column}</td>
                    <td className="p-3 uppercase text-[10px] font-bold">
                      <span
                        className={`px-2 py-0.5 rounded-full border ${
                          log.type === 'missing'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : log.type === 'outlier'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : log.type === 'date_format'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {log.type}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-red-600 line-through">{log.beforeValue}</td>
                    <td className="p-3 font-mono text-emerald-700 font-bold">{log.afterValue}</td>
                    <td className="p-3 text-slate-500">{log.methodUsed}</td>
                    <td className="p-3 text-right font-mono text-slate-400 text-[11px]">{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No transformations logged yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Run Auto-Clean Now" above to trigger statistical cleaning on corrupted rows.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
