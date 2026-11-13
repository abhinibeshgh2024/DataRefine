import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import {
  BarChart3,
  CopyCheck,
  FileSpreadsheet,
  FileText,
  GitCompare,
  Layers,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import {
  ColumnPolicy,
  ColumnProfileReport,
  ColumnSchema,
  DatasetProfileReport,
  DuplicateResolutionStrategy,
  RowData,
} from '../types';
import { computeGroupAnalysis, detectDuplicates } from '../utils/profilerEngine';

interface ProfilingEDAPanelProps {
  rows: RowData[];
  schemas: ColumnSchema[];
  policies: Record<string, ColumnPolicy>;
  profile: DatasetProfileReport;
  onResolveDuplicates: (keyColumns: string[], strategy: DuplicateResolutionStrategy) => void;
  onExportPDF: () => void;
  onExportExcelWorkbook: () => void;
  isProcessing: boolean;
}

export const ProfilingEDAPanel: React.FC<ProfilingEDAPanelProps> = ({
  rows,
  schemas,
  profile,
  onResolveDuplicates,
  onExportPDF,
  onExportExcelWorkbook,
  isProcessing,
}) => {
  const colProfileList: ColumnProfileReport[] = useMemo(
    () => Object.values(profile.columnProfiles),
    [profile]
  );

  const [selectedCol, setSelectedCol] = useState<string>(schemas[0]?.name || '');
  const activeColProfile =
    profile.columnProfiles[selectedCol] || colProfileList[0] || null;

  // Group-By / Segmentation Explorer state
  const categoricalCols = useMemo(
    () =>
      colProfileList.filter(
        (c) =>
          c.detectedType === 'categorical' ||
          c.detectedType === 'boolean' ||
          c.detectedType === 'text'
      ),
    [colProfileList]
  );
  const numericCols = useMemo(
    () =>
      colProfileList.filter(
        (c) => c.detectedType === 'float' || c.detectedType === 'integer'
      ),
    [colProfileList]
  );

  const [groupCol, setGroupCol] = useState<string>(categoricalCols[0]?.columnName || '');
  const [metricCol, setMetricCol] = useState<string>(numericCols[0]?.columnName || '');

  const effectiveGroupCol =
    categoricalCols.some((c) => c.columnName === groupCol)
      ? groupCol
      : categoricalCols[0]?.columnName || '';
  const effectiveMetricCol =
    numericCols.some((c) => c.columnName === metricCol)
      ? metricCol
      : numericCols[0]?.columnName || '';

  const groupAnalysisRows = useMemo(() => {
    if (!effectiveGroupCol || !effectiveMetricCol) return [];
    return computeGroupAnalysis(rows, effectiveGroupCol, effectiveMetricCol);
  }, [rows, effectiveGroupCol, effectiveMetricCol]);

  // Duplicate Management state
  const [dupKeyCols, setDupKeyCols] = useState<string[]>([]);
  const [dupStrategy, setDupStrategy] = useState<DuplicateResolutionStrategy>('keep_first');

  const liveDupScan = useMemo(
    () => detectDuplicates(rows, schemas, dupKeyCols.length > 0 ? dupKeyCols : undefined),
    [rows, schemas, dupKeyCols]
  );

  const toggleDupKeyCol = (colName: string) => {
    setDupKeyCols((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner + Report Exports */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Automated Data Profiling &amp; Exploratory Analytics (EDA)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Complete statistical breakdown, distribution histograms, Pearson correlation matrix, time-series trends, group segmentation, and duplicate cluster management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onExportExcelWorkbook}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel Audit Workbook</span>
          </button>
          <button
            type="button"
            onClick={onExportPDF}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download PDF Report</span>
          </button>
        </div>
      </div>

      {/* Business Insights & Consistency Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span>Automated Business &amp; Statistical Insights</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            {profile.businessInsights.map((ins, i) => (
              <li
                key={i}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 leading-relaxed"
              >
                {ins}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Data Consistency &amp; Schema Alerts</span>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
              Consistency: {profile.consistencyScore}/100
            </span>
          </div>

          {profile.consistencyAlerts.length > 0 ? (
            <ul className="space-y-2 text-xs text-slate-700 max-h-56 overflow-y-auto">
              {profile.consistencyAlerts.map((alert, i) => (
                <li
                  key={i}
                  className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 leading-relaxed"
                >
                  {alert}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-800 text-xs">
              All columns passed casing, whitespace, date format, and numeric boundary consistency checks.
            </div>
          )}
        </div>
      </div>

      {/* Auto-Identified KPIs */}
      {profile.kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {profile.kpis.map((kpi) => (
            <div
              key={kpi.column}
              className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 tabular-nums"
            >
              <div className="text-xs font-medium text-slate-500 truncate">
                KPI: {kpi.label}
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {kpi.total.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-600 font-mono">
                Avg {kpi.average.toLocaleString()} &middot; Med {kpi.median.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400">{kpi.spreadNote}</div>
            </div>
          ))}
        </div>
      )}

      {/* Column-Level Full Statistical Profile Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Column-Level Intelligence &amp; Statistical Profile
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any row to inspect its distribution histogram, quartiles, or category frequencies below
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Column &amp; Semantic Role</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Quality</th>
                <th className="py-2.5 px-3 text-right">Missing</th>
                <th className="py-2.5 px-3 text-right">Unique</th>
                <th className="py-2.5 px-3 text-right">Mean</th>
                <th className="py-2.5 px-3 text-right">Median</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3 text-right">StdDev / MAD</th>
                <th className="py-2.5 px-3 text-right">Min &ndash; Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {colProfileList.map((cp) => {
                const isSelected = activeColProfile?.columnName === cp.columnName;
                return (
                  <tr
                    key={cp.columnName}
                    onClick={() => setSelectedCol(cp.columnName)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{cp.columnName}</div>
                      <div className="text-[11px] text-slate-500">{cp.semanticRole}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{cp.detectedType}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                      <span
                        className={
                          cp.qualityScore >= 85
                            ? 'text-emerald-700'
                            : cp.qualityScore >= 60
                            ? 'text-amber-700'
                            : 'text-red-600'
                        }
                      >
                        {cp.qualityScore}/100
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className={cp.missingCount > 0 ? 'text-amber-700 font-semibold' : ''}>
                        {cp.missingPct}% ({cp.missingCount})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {cp.uniqueCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {cp.mean !== null ? cp.mean.toFixed(2) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {cp.median !== null ? cp.median.toFixed(2) : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 max-w-[140px] truncate">
                      {cp.mode !== null ? String(cp.mode) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {cp.stdDev !== null
                        ? `${cp.stdDev.toFixed(2)} / ${(cp.mad ?? 0).toFixed(2)}`
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {cp.min !== null && cp.max !== null ? `${cp.min} – ${cp.max}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution Analysis (Histogram / Box Plot / Frequency Bar Chart) */}
      {activeColProfile && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Distribution &amp; Spread Analysis: {activeColProfile.columnName}
              </h3>
              <p className="text-xs text-slate-500">
                {activeColProfile.semanticRole} &middot; {activeColProfile.validCount.toLocaleString()} valid values
              </p>
            </div>

            <select
              value={activeColProfile.columnName}
              onChange={(e) => setSelectedCol(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
            >
              {colProfileList.map((cp) => (
                <option key={cp.columnName} value={cp.columnName}>
                  {cp.columnName} ({cp.detectedType})
                </option>
              ))}
            </select>
          </div>

          {activeColProfile.histogram.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeColProfile.histogram}
                    margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="bin" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" fill="#2563eb" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Box-Plot Five-Number Summary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs tabular-nums">
                <div className="font-semibold text-slate-900">Box-Plot Quartile Summary</div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">Min</div>
                    <div className="font-semibold text-slate-900">{activeColProfile.min}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">Q1 (25th)</div>
                    <div className="font-semibold text-slate-900">{activeColProfile.q1}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">Median (Q2)</div>
                    <div className="font-bold text-blue-700">{activeColProfile.median}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">Q3 (75th)</div>
                    <div className="font-semibold text-slate-900">{activeColProfile.q3}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">Max</div>
                    <div className="font-semibold text-slate-900">{activeColProfile.max}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-[10px] text-slate-400">IQR / Skew</div>
                    <div className="font-semibold text-slate-900">
                      {activeColProfile.iqr} / {activeColProfile.skewness ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeColProfile.topCategories.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={activeColProfile.topCategories}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="value"
                      width={110}
                      tick={{ fill: '#334155', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {activeColProfile.topCategories.map((cat) => (
                  <div
                    key={cat.value}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 tabular-nums"
                  >
                    <span className="font-mono font-medium text-slate-800 truncate">{cat.value}</span>
                    <span className="font-mono text-slate-600">
                      {cat.count.toLocaleString()} ({cat.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No distribution data available for this column.
            </div>
          )}
        </div>
      )}

      {/* Correlation Matrix & Time-Series Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Correlation Heatmap */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Numeric Correlation Matrix (Pearson r)
              </h3>
              <p className="text-xs text-slate-500">
                Pairwise linear relationships across numeric dimensions
              </p>
            </div>
          </div>

          {profile.correlations.columns.length >= 2 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-center text-[11px] font-mono border-collapse tabular-nums">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-slate-500">Col</th>
                    {profile.correlations.columns.map((c) => (
                      <th key={c} className="p-2 text-slate-700 font-semibold truncate max-w-[90px]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.correlations.columns.map((rowCol, rIdx) => (
                    <tr key={rowCol}>
                      <td className="p-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                        {rowCol}
                      </td>
                      {profile.correlations.matrix[rIdx].map((val, cIdx) => {
                        const abs = Math.abs(val);
                        const bg =
                          rIdx === cIdx
                            ? 'bg-slate-100 text-slate-500'
                            : val > 0.5
                            ? 'bg-blue-600 text-white font-semibold'
                            : val > 0.25
                            ? 'bg-blue-100 text-blue-900'
                            : val < -0.5
                            ? 'bg-red-600 text-white font-semibold'
                            : val < -0.25
                            ? 'bg-red-100 text-red-900'
                            : 'bg-slate-50 text-slate-600';
                        return (
                          <td
                            key={`${rIdx}-${cIdx}`}
                            className={`p-2 border border-white rounded-xs ${bg}`}
                            title={`${rowCol} vs ${profile.correlations.columns[cIdx]}: r = ${val} (strength ${abs.toFixed(2)})`}
                          >
                            {val.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              At least 2 numeric columns are required to compute a correlation matrix.
            </div>
          )}
        </div>

        {/* Time-Series Trend Detection */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Time-Series Trend Detection</h3>
              <p className="text-xs text-slate-500">
                Temporal trajectory across detected date and numeric metrics
              </p>
            </div>
          </div>

          {profile.trends.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-700 flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 tabular-nums">
                <span>
                  <strong>{profile.trends[0].metricColumn}</strong> over{' '}
                  <strong>{profile.trends[0].dateColumn}</strong>
                </span>
                <span
                  className={`font-semibold ${
                    profile.trends[0].direction === 'increasing'
                      ? 'text-emerald-700'
                      : profile.trends[0].direction === 'decreasing'
                      ? 'text-red-600'
                      : 'text-slate-600'
                  }`}
                >
                  {profile.trends[0].direction.toUpperCase()} ({profile.trends[0].slopePct > 0 ? '+' : ''}
                  {profile.trends[0].slopePct}%)
                </span>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={profile.trends[0].points}
                    margin={{ top: 6, right: 10, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No valid date + numeric column pairing found for time-series trend analysis.
            </div>
          )}
        </div>
      </div>

      {/* Group-Based Dimension Comparison & Data Segmentation */}
      {categoricalCols.length > 0 && numericCols.length > 0 && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Group-Based Comparison &amp; Data Segmentation
                </h3>
                <p className="text-xs text-slate-500">
                  Compare segment totals, averages, and min/max across any categorical dimension
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={effectiveGroupCol}
                onChange={(e) => setGroupCol(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800"
              >
                {categoricalCols.map((c) => (
                  <option key={c.columnName} value={c.columnName}>
                    Group by: {c.columnName}
                  </option>
                ))}
              </select>
              <select
                value={effectiveMetricCol}
                onChange={(e) => setMetricCol(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800"
              >
                {numericCols.map((c) => (
                  <option key={c.columnName} value={c.columnName}>
                    Metric: {c.columnName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={groupAnalysisRows.slice(0, 10)}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="group" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="avg" name={`Avg ${effectiveMetricCol}`} fill="#2563eb" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto max-h-56 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Segment</th>
                    <th className="py-2 px-3 text-right">Rows</th>
                    <th className="py-2 px-3 text-right">Avg</th>
                    <th className="py-2 px-3 text-right">Sum</th>
                    <th className="py-2 px-3 text-right">Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                  {groupAnalysisRows.map((row) => (
                    <tr key={row.group}>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                        {row.group}
                      </td>
                      <td className="py-2 px-3 text-right">{row.count}</td>
                      <td className="py-2 px-3 text-right font-semibold text-blue-700">
                        {row.avg.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right">{row.sum.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-slate-500">
                        {row.min} – {row.max}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Detection & Resolution Engine */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CopyCheck className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Duplicate Record Detection &amp; Resolution
              </h3>
              <p className="text-xs text-slate-500">
                Detect exact full-row duplicates or potential key-subset duplicates and resolve them safely
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dupStrategy}
              onChange={(e) => setDupStrategy(e.target.value as DuplicateResolutionStrategy)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="keep_first">Keep First Occurrence</option>
              <option value="keep_last">Keep Latest Occurrence</option>
              <option value="drop_all">Drop All Duplicate Copies</option>
              <option value="flag_only">Flag-Only (Inspect)</option>
            </select>

            <button
              type="button"
              disabled={isProcessing || liveDupScan.clusters.length === 0 || dupStrategy === 'flag_only'}
              onClick={() => onResolveDuplicates(dupKeyCols, dupStrategy)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Resolve Duplicates</span>
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-600 mb-2 flex items-center justify-between">
            <span>
              Subset Key Columns (leave empty to match exact full rows):
            </span>
            {dupKeyCols.length > 0 && (
              <button
                type="button"
                onClick={() => setDupKeyCols([])}
                className="text-blue-600 hover:underline cursor-pointer"
              >
                Reset to exact full-row match
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {schemas.map((col) => {
              const active = dupKeyCols.includes(col.name);
              return (
                <button
                  type="button"
                  key={col.name}
                  onClick={() => toggleDupKeyCol(col.name)}
                  className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {col.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-slate-700 tabular-nums">
          Found <strong>{liveDupScan.clusters.length}</strong> duplicate cluster(s) across{' '}
          <strong>
            {liveDupScan.clusters.reduce((acc, c) => acc + (c.count - 1), 0)}
          </strong>{' '}
          redundant record(s).
        </div>

        {liveDupScan.clusters.length > 0 && (
          <div className="overflow-x-auto max-h-48 border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3">Match Scope</th>
                  <th className="py-2 px-3">Key Columns</th>
                  <th className="py-2 px-3 text-right">Occurrences</th>
                  <th className="py-2 px-3">Row Indices</th>
                  <th className="py-2 px-3">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {liveDupScan.clusters.slice(0, 30).map((cl) => (
                  <tr key={cl.id}>
                    <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                      {cl.type === 'exact' ? 'Exact Row' : 'Key Subset'}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {cl.keyColumns.length === schemas.length
                        ? 'All columns'
                        : cl.keyColumns.join(', ')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-amber-700">{cl.count}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {cl.rowIndices.slice(0, 6).map((i) => `#${i + 1}`).join(', ')}
                      {cl.rowIndices.length > 6 ? '...' : ''}
                    </td>
                    <td className="py-2 px-3 text-slate-500 max-w-[200px] truncate">
                      {cl.preview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
