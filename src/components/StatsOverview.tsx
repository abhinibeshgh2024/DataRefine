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
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Type,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { CellAnomalyInfo, ColumnSchema, RowData } from '../types';

interface StatsOverviewProps {
  rows: RowData[];
  schemas: ColumnSchema[];
}

const COLOR_MISSING = '#f59e0b'; // Amber
const COLOR_OUTLIER = '#f43f5e'; // Rose
const COLOR_DATE = '#6366f1'; // Indigo
const COLOR_TYPO = '#a855f7'; // Purple
const COLOR_CLEAN = '#10b981'; // Emerald

export const StatsOverview: React.FC<StatsOverviewProps> = ({ rows, schemas }) => {
  if (!rows || rows.length === 0) return null;

  const totalRows = rows.length;
  const totalCols = schemas.length;
  const totalCells = totalRows * totalCols;

  let missingCount = 0;
  let outlierCount = 0;
  let dateErrCount = 0;
  let typoCount = 0;
  let flaggedCellsCount = 0;
  let highRiskRows = 0;
  let medRiskRows = 0;
  let lowRiskRows = 0;
  let cleanRows = 0;

  const columnFlagCounts: Record<string, number> = {};
  schemas.forEach((s) => (columnFlagCounts[s.name] = 0));

  const scoreBuckets = [
    { range: '0 - 10 (Clean)', count: 0, color: '#10b981' },
    { range: '11 - 30 (Low)', count: 0, color: '#3b82f6' },
    { range: '31 - 60 (Medium)', count: 0, color: '#f59e0b' },
    { range: '61 - 100 (High)', count: 0, color: '#f43f5e' },
  ];

  const rowScoresData: { index: number; score: number }[] = [];

  rows.forEach((row, idx) => {
    const score = row.anomalyInfo?.totalScore || 0;
    rowScoresData.push({ index: idx + 1, score });

    if (score <= 10) {
      cleanRows++;
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
    Object.entries(cellAnomalies).forEach(([colName, cellObj]) => {
      const cell = cellObj as CellAnomalyInfo;
      if (cell.isAnomaly) {
        flaggedCellsCount++;
        columnFlagCounts[colName] = (columnFlagCounts[colName] || 0) + 1;

        if (cell.types.includes('missing')) missingCount++;
        if (cell.types.includes('outlier')) outlierCount++;
        if (cell.types.includes('date_format')) dateErrCount++;
        if (cell.types.includes('typo')) typoCount++;
      }
    });
  });

  const totalAnomalousRows = lowRiskRows + medRiskRows + highRiskRows;
  const avgAnomalyScore = Math.round(
    rows.reduce((acc, r) => acc + (r.anomalyInfo?.totalScore || 0), 0) / totalRows
  );
  const healthScore = Math.max(0, 100 - avgAnomalyScore);

  const typePieData = [
    { name: 'Missing Values', value: missingCount, color: COLOR_MISSING },
    { name: 'Outlier Spikes', value: outlierCount, color: COLOR_OUTLIER },
    { name: 'Inconsistent Dates', value: dateErrCount, color: COLOR_DATE },
    { name: 'Spelling Typos', value: typoCount, color: COLOR_TYPO },
  ].filter((d) => d.value > 0);

  const columnHealthData = schemas.map((col) => {
    const flags = columnFlagCounts[col.name] || 0;
    const errorPct = Math.round((flags / totalRows) * 100);
    return {
      name: col.name,
      errorPct,
      cleanPct: 100 - errorPct,
      flags,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dataset Health Index */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Dataset Health Score
            </span>
            <div className="text-3xl font-extrabold text-slate-800 mt-1 flex items-baseline space-x-1">
              <span>{healthScore}%</span>
              <span className="text-xs text-slate-400 font-normal">/ 100</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {healthScore >= 80 ? 'Pristine Clean' : healthScore >= 50 ? 'Moderate Anomalies' : 'High Noise & Corruption'}
            </p>
          </div>
          <div
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center font-bold text-lg ${
              healthScore >= 80
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : healthScore >= 50
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {healthScore}%
          </div>
        </div>

        {/* Flagged Rows Ratio */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Corrupted Rows
            </span>
            <div className="text-3xl font-extrabold text-slate-800 mt-1">
              {totalAnomalousRows} <span className="text-xs font-normal text-slate-400">/ {totalRows}</span>
            </div>
            <p className="text-xs text-red-600 mt-1 font-medium">
              {Math.round((totalAnomalousRows / totalRows) * 100)}% of total rows affected
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Flagged Cells Total */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Total Corrupted Cells
            </span>
            <div className="text-3xl font-extrabold text-orange-600 mt-1">
              {flaggedCellsCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {Math.round((flaggedCellsCount / totalCells) * 100)}% of {totalCells} total cells
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* High Risk Rows */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Severe High-Risk Rows
            </span>
            <div className="text-3xl font-extrabold text-red-600 mt-1">
              {highRiskRows}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Anomaly Score &gt; 60/100
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Anomaly Score Histogram */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Row Anomaly Risk Distribution</h3>
              <p className="text-xs text-slate-500">Count of rows bucketed by anomaly severity</p>
            </div>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreBuckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
                <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
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

        {/* Chart 2: Anomaly Type Distribution Pie */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Anomaly Breakdown by Category</h3>
              <p className="text-xs text-slate-500">Proportion of specific data corruptions detected</p>
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
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                {typePieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-xs">
              Dataset is 100% clean. No anomalies detected!
            </div>
          )}
        </div>
      </div>

      {/* Row Index Anomaly Score Line Plot */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Row Anomaly Score Sequence</h3>
            <p className="text-xs text-slate-500">
              Anomaly score across row indices (0 = Perfectly Clean, 100 = Highly Corrupted)
            </p>
          </div>
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rowScoresData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
              <XAxis dataKey="index" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                formatter={(val: any) => [`${val} / 100`, 'Anomaly Score']}
                labelFormatter={(lbl) => `Row #${lbl}`}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
