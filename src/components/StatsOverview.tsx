import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import {
  ShieldAlert,
  TrendingUp,
  Activity,
  Layers,
  Database,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';
import {
  CellAnomalyInfo,
  ColumnProfileReport,
  ColumnSchema,
  DatasetProfileReport,
  DuckDBColumnProfile,
  RowData,
} from '../types';

interface StatsOverviewProps {
  rows: RowData[];
  schemas: ColumnSchema[];
  profiles?: Record<string, DuckDBColumnProfile>;
  baselineProfile?: DatasetProfileReport;
  currentProfile?: DatasetProfileReport;
}

const COLOR_MISSING = '#d97706';
const COLOR_OUTLIER = '#dc2626';
const COLOR_DATE = '#2563eb';
const COLOR_TYPO = '#7c3aed';
const COLOR_VALID = '#059669';

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  rows,
  schemas,
  profiles,
  baselineProfile,
  currentProfile,
}) => {
  if (!rows || rows.length === 0) return null;

  const totalRows = rows.length;
  const totalCols = schemas.length;
  const totalCells = totalRows * totalCols;

  let missingCount = 0;
  let outlierCount = 0;
  let dateErrCount = 0;
  let typoCount = 0;
  let validationCount = 0;
  let flaggedCellsCount = 0;
  let highRiskRows = 0;
  let medRiskRows = 0;
  let lowRiskRows = 0;

  const scoreBuckets = [
    { range: '0-10 Clean', count: 0, color: '#16a34a' },
    { range: '11-30 Low', count: 0, color: '#2563eb' },
    { range: '31-60 Med', count: 0, color: '#d97706' },
    { range: '61-100 High', count: 0, color: '#dc2626' },
  ];

  const sampleStep = Math.max(1, Math.floor(totalRows / 150));
  const rowScoresData: { index: number; score: number }[] = [];

  rows.forEach((row, idx) => {
    const score = row.anomalyInfo?.totalScore || 0;
    if (idx % sampleStep === 0 || idx === totalRows - 1) {
      rowScoresData.push({ index: idx + 1, score });
    }

    if (score <= 10) {
      scoreBuckets[0].count++;
    } else if (score <= 30) {
      lowRiskRows++;
      scoreBuckets[1].count++;
    } else if (score <= 60) {
      medRiskRows++;
      scoreBuckets[2].count++;
    } else {
      highRiskRows++;
      scoreBuckets[3].count++;
    }

    const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};
    Object.values(cellAnomalies).forEach((cellObj) => {
      const cell = cellObj as CellAnomalyInfo;
      if (cell.isAnomaly) {
        flaggedCellsCount++;
        if (cell.types.includes('missing')) missingCount++;
        if (cell.types.includes('outlier')) outlierCount++;
        if (cell.types.includes('date_format')) dateErrCount++;
        if (cell.types.includes('typo')) typoCount++;
        if (cell.types.includes('validation')) validationCount++;
      }
    });
  });

  const totalAnomalousRows = lowRiskRows + medRiskRows + highRiskRows;
  const qualityScore = currentProfile?.overallQualityScore ?? Math.max(
    0,
    100 - Math.round(rows.reduce((acc, r) => acc + (r.anomalyInfo?.totalScore || 0), 0) / totalRows)
  );

  const typePieData = [
    { name: 'Missing Values', value: missingCount, color: COLOR_MISSING },
    { name: 'Outlier Spikes', value: outlierCount, color: COLOR_OUTLIER },
    { name: 'Date Format Drift', value: dateErrCount, color: COLOR_DATE },
    { name: 'Typos & Whitespace', value: typoCount, color: COLOR_TYPO },
    { name: 'Validation Rules', value: validationCount, color: COLOR_VALID },
  ].filter((d) => d.value > 0);

  const profileList: DuckDBColumnProfile[] = profiles ? Object.values(profiles) : [];
  const colProfileList: ColumnProfileReport[] = currentProfile
    ? Object.values(currentProfile.columnProfiles)
    : [];

  const hasBaselineDelta =
    baselineProfile &&
    currentProfile &&
    (baselineProfile.overallQualityScore !== currentProfile.overallQualityScore ||
      baselineProfile.rowCount !== currentProfile.rowCount ||
      baselineProfile.completenessScore !== currentProfile.completenessScore);

  return (
    <div className="space-y-6">
      {/* Top KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Overall Quality Score</span>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
              {qualityScore} <span className="text-xs text-slate-400 font-normal">/ 100</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {currentProfile
                ? `Comp ${currentProfile.completenessScore}% · Valid ${currentProfile.validityScore}%`
                : 'Live anomaly telemetry'}
            </p>
          </div>
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center font-bold text-sm tabular-nums ${
              qualityScore >= 85
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : qualityScore >= 60
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {qualityScore}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Flagged Rows</span>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
              {totalAnomalousRows.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {totalRows.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-red-600 mt-1 font-medium tabular-nums">
              {Math.round((totalAnomalousRows / totalRows) * 100)}% of rows affected
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Flagged Cells</span>
            <div className="text-3xl font-bold text-amber-600 mt-1 tabular-nums">
              {flaggedCellsCount.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {Math.round((flaggedCellsCount / Math.max(1, totalCells)) * 100)}% of{' '}
              {totalCells.toLocaleString()} cells
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Uniqueness &amp; Duplicates</span>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
              {currentProfile ? `${currentProfile.uniquenessScore}%` : '100%'}
            </div>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {currentProfile
                ? `${currentProfile.exactDuplicateRowCount.toLocaleString()} exact duplicates · ${highRiskRows} high-risk`
                : `High-risk rows: ${highRiskRows.toLocaleString()}`}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Before vs After Quality Comparison (when baseline differs from current) */}
      {hasBaselineDelta && baselineProfile && currentProfile && (
        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">
                Before vs. After Quality &amp; Statistical Comparison
              </h3>
              <p className="text-xs text-slate-500">
                Measured delta against pre-cleaning dataset state
              </p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {[
              {
                label: 'Overall Score',
                before: baselineProfile.overallQualityScore,
                after: currentProfile.overallQualityScore,
                suffix: '/100',
              },
              {
                label: 'Completeness',
                before: baselineProfile.completenessScore,
                after: currentProfile.completenessScore,
                suffix: '%',
              },
              {
                label: 'Validity',
                before: baselineProfile.validityScore,
                after: currentProfile.validityScore,
                suffix: '%',
              },
              {
                label: 'Uniqueness',
                before: baselineProfile.uniquenessScore,
                after: currentProfile.uniquenessScore,
                suffix: '%',
              },
              {
                label: 'Consistency',
                before: baselineProfile.consistencyScore,
                after: currentProfile.consistencyScore,
                suffix: '%',
              },
            ].map((dim) => {
              const delta = dim.after - dim.before;
              return (
                <div
                  key={dim.label}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1 tabular-nums"
                >
                  <div className="text-slate-500 font-medium">{dim.label}</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-slate-400 line-through font-mono">
                      {dim.before}
                      {dim.suffix}
                    </span>
                    <span className="text-slate-900 font-bold text-sm font-mono">
                      {dim.after}
                      {dim.suffix}
                    </span>
                  </div>
                  <div
                    className={`font-semibold text-[11px] ${
                      delta > 0
                        ? 'text-emerald-700'
                        : delta < 0
                        ? 'text-red-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta} pts
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Row Anomaly Risk Distribution</h3>
              <p className="text-xs text-slate-500">Row count grouped by anomaly severity</p>
            </div>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreBuckets} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreBuckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Anomaly Breakdown by Category</h3>
              <p className="text-xs text-slate-500">Proportion of detected cell violations</p>
            </div>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          {typePieData.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center h-56">
              <div className="w-full sm:w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {typePieData.map((entry, index) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full sm:w-1/2 space-y-2.5 text-xs">
                {typePieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-slate-600 font-medium">{item.name}</span>
                    </div>
                    <span className="font-semibold text-slate-900 font-mono tabular-nums">
                      {item.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-500 text-xs">
              Dataset is 100% clean. Zero anomalies detected.
            </div>
          )}
        </div>
      </div>

      {/* Row Sequence Chart */}
      <div className="p-5 rounded-xl bg-white border border-slate-200">
        <div className="mb-3">
          <h3 className="font-semibold text-slate-900 text-sm">Row Anomaly Score Sequence</h3>
          <p className="text-xs text-slate-500">
            Anomaly score progression across row indices (0 = Clean, 100 = Severely Corrupted)
          </p>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rowScoresData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
              <XAxis dataKey="index" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#e2e8f0',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
                formatter={(val: any) => [`${val} / 100`, 'Anomaly Score']}
                labelFormatter={(lbl) => `Row #${lbl}`}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#2563eb"
                strokeWidth={2}
                dot={totalRows <= 100 ? { fill: '#dc2626', r: 2.5 } : false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Column Quality & Telemetry Table */}
      {(colProfileList.length > 0 || profileList.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Column Quality &amp; Statistical Telemetry
                </h3>
                <p className="text-xs text-slate-500">
                  Per-column quality scores, missing rates, distinct cardinalities, and central tendency
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Column</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4 text-right">Quality</th>
                  <th className="py-2.5 px-4 text-right">Missing</th>
                  <th className="py-2.5 px-4 text-right">Unique</th>
                  <th className="py-2.5 px-4 text-right">Mean</th>
                  <th className="py-2.5 px-4 text-right">Median</th>
                  <th className="py-2.5 px-4 text-right">StdDev</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {colProfileList.length > 0
                  ? colProfileList.map((cp) => (
                      <tr key={cp.columnName} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{cp.columnName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{cp.detectedType}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">
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
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          <span className={cp.missingCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-600'}>
                            {cp.missingPct}% ({cp.missingCount})
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {cp.uniqueCount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {cp.mean !== null ? cp.mean.toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {cp.median !== null ? cp.median.toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {cp.stdDev !== null ? cp.stdDev.toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))
                  : profileList.map((p) => (
                      <tr key={p.columnName} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{p.columnName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">-</td>
                        <td className="py-2.5 px-4 text-right font-mono">-</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.nullCount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.distinctCount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.mean !== null ? p.mean.toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.median !== null ? p.median.toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.stdDev !== null ? p.stdDev.toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
