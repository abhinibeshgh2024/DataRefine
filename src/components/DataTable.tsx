import React, { useMemo, useState } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Type,
  ArrowUpDown,
  RotateCcw,
  Edit3,
  Terminal,
  Play,
  History,
  X,
} from 'lucide-react';
import {
  CellAnomalyInfo,
  CellLineageEntry,
  ColumnSchema,
  CorruptionType,
  ExecutionMode,
  RowData,
  SQLQueryResult,
} from '../types';
import { executeDuckDBSQL, resetDuckDBState } from '../utils/duckdbEngine';

interface DataTableProps {
  rows: RowData[];
  schemas: ColumnSchema[];
  executionMode?: ExecutionMode;
  onSelectRow: (row: RowData, rowIndex: number) => void;
  onRevertCell: (rowIndex: number, colName: string) => void;
  onOverrideCell: (rowIndex: number, colName: string, newValue: any) => void;
}

export const DataTable: React.FC<DataTableProps> = ({
  rows,
  schemas,
  executionMode,
  onSelectRow,
  onRevertCell,
  onOverrideCell,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'clean' | 'low' | 'medium' | 'high'>('all');
  const [typeFilter, setTypeFilter] = useState<CorruptionType | 'all'>('all');
  const [sortField, setSortField] = useState<string>('_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Interactive Cell Lineage Popover State
  const [activeCellPopover, setActiveCellPopover] = useState<{
    rowIndex: number;
    colName: string;
  } | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>('');
  const [isEditingOverride, setIsEditingOverride] = useState(false);

  // DuckDB-WASM SQL Workbench State
  const [showSQLWorkbench, setShowSQLWorkbench] = useState(false);
  const [sqlText, setSqlText] = useState('SELECT * FROM dataset LIMIT 20;');
  const [sqlResult, setSqlResult] = useState<SQLQueryResult | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [isRunningSQL, setIsRunningSQL] = useState(false);

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, idx) => map.set(r._id, idx));
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const score = row.anomalyInfo?.totalScore || 0;

      if (riskFilter !== 'all') {
        if (riskFilter === 'clean' && score > 10) return false;
        if (riskFilter === 'low' && (score <= 10 || score > 30)) return false;
        if (riskFilter === 'medium' && (score <= 30 || score > 60)) return false;
        if (riskFilter === 'high' && score <= 60) return false;
      }

      if (typeFilter !== 'all') {
        const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};
        const hasType = Object.values(cellAnomalies).some((cell) =>
          (cell as CellAnomalyInfo).types.includes(typeFilter)
        );
        if (!hasType) return false;
      }

      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchesVal = Object.values(row.data).some((val) =>
          String(val ?? '').toLowerCase().includes(term)
        );
        const matchesCol = Object.keys(row.data).some((col) => col.toLowerCase().includes(term));
        if (!matchesVal && !matchesCol) return false;
      }

      return true;
    });
  }, [rows, searchTerm, riskFilter, typeFilter]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortField === '_score') {
        const scoreA = a.anomalyInfo?.totalScore || 0;
        const scoreB = b.anomalyInfo?.totalScore || 0;
        return sortDirection === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      }
      const valA = a.data[sortField];
      const valB = b.data[sortField];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      return sortDirection === 'asc' ? 1 : -1;
    });
  }, [filteredRows, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleRunSQL = async (customQuery?: string, forceReset = false) => {
    const queryToRun = (customQuery ?? sqlText).trim();
    if (!queryToRun) return;
    if (forceReset) {
      resetDuckDBState();
    }
    setSqlError(null);
    setIsRunningSQL(true);
    try {
      const res = await executeDuckDBSQL(queryToRun, rows, schemas);
      setSqlResult(res);
    } catch (err: any) {
      setSqlError(err?.message || 'SQL execution failed.');
    } finally {
      setIsRunningSQL(false);
    }
  };

  const presetQueries = useMemo(() => {
    const firstCat = schemas.find((s) => s.type === 'categorical');
    const firstNum = schemas.find((s) => s.type === 'numeric');
    const list = [{ label: 'Top 20 Rows', sql: 'SELECT * FROM dataset LIMIT 20;' }];
    if (firstCat && firstNum) {
      list.push({
        label: `Group by ${firstCat.name}`,
        sql: `SELECT "${firstCat.name}", COUNT(*) AS row_count, ROUND(AVG(TRY_CAST("${firstNum.name}" AS DOUBLE)), 2) AS avg_${firstNum.name} FROM dataset GROUP BY "${firstCat.name}" ORDER BY row_count DESC;`,
      });
    }
    if (firstNum) {
      list.push({
        label: `Top ${firstNum.name} Spikes`,
        sql: `SELECT * FROM dataset ORDER BY TRY_CAST("${firstNum.name}" AS DOUBLE) DESC NULLS LAST LIMIT 15;`,
      });
    }
    return list;
  }, [schemas]);

  const activePopoverData = useMemo(() => {
    if (!activeCellPopover) return null;
    const row = rows[activeCellPopover.rowIndex];
    if (!row) return null;
    const colName = activeCellPopover.colName;
    const lineageList: CellLineageEntry[] = row.cellLineage?.[colName] || [];
    const latestLineage = lineageList[lineageList.length - 1];
    const cellInfo = row.anomalyInfo?.cellAnomalies?.[colName];
    const currentVal = row.data[colName];

    return {
      row,
      rowIndex: activeCellPopover.rowIndex,
      colName,
      currentVal,
      latestLineage,
      lineageList,
      cellInfo,
    };
  }, [activeCellPopover, rows]);

  return (
    <div className="space-y-4">
      {/* DuckDB-WASM Vectorized SQL Workbench Toggle & Panel */}
      {executionMode !== 'server_batch' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2 text-xs">
              <Terminal className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-900">DuckDB-WASM SQL Workbench</span>
              <span className="text-slate-400">&middot;</span>
              <span className="text-slate-500">
                Query the live in-memory <code className="font-mono text-slate-700">dataset</code> table
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSQLWorkbench((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition-colors"
            >
              {showSQLWorkbench ? 'Hide SQL Console' : 'Open SQL Console'}
            </button>
          </div>

          {showSQLWorkbench && (
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Presets:</span>
                {presetQueries.map((q) => (
                  <button
                    type="button"
                    key={q.label}
                    onClick={() => {
                      setSqlText(q.sql);
                      handleRunSQL(q.sql);
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs text-slate-700 font-medium cursor-pointer transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={sqlText}
                  onChange={(e) => setSqlText(e.target.value)}
                  className="flex-1 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg p-3 border border-slate-700 focus:outline-none focus:border-blue-500"
                  placeholder="SELECT * FROM dataset LIMIT 20;"
                />
                <button
                  type="button"
                  onClick={() => handleRunSQL()}
                  disabled={isRunningSQL}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isRunningSQL ? 'Running...' : 'Run SQL'}</span>
                </button>
              </div>

              {sqlError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-center justify-between gap-3">
                  <span>{sqlError}</span>
                  <button
                    type="button"
                    onClick={() => handleRunSQL(undefined, true)}
                    disabled={isRunningSQL}
                    className="px-2.5 py-1 rounded bg-white border border-red-300 text-red-800 font-sans font-semibold hover:bg-red-100 cursor-pointer shrink-0"
                  >
                    Retry Engine
                  </button>
                </div>
              )}

              {sqlResult && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex items-center justify-between tabular-nums">
                    <span>
                      Returned <strong>{sqlResult.rowCount.toLocaleString()}</strong> rows (showing up to 500)
                    </span>
                    <span className="font-mono text-slate-500">{sqlResult.durationMs} ms</span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                        <tr>
                          {sqlResult.columns.map((c) => (
                            <th key={c} className="py-2 px-3 whitespace-nowrap">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sqlResult.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {sqlResult.columns.map((c) => (
                              <td key={c} className="py-1.5 px-3 whitespace-nowrap text-slate-800">
                                {r[c] === null || r[c] === undefined ? 'NULL' : String(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Single-Cell Lineage & Human-in-the-Loop Override Drawer */}
      {activePopoverData && (
        <div className="p-4 rounded-xl bg-white border border-blue-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <History className="w-4 h-4 text-blue-600" />
              <span>
                Cell Lineage &mdash; Row #{activePopoverData.rowIndex + 1}, Column{' '}
                <code className="font-mono text-blue-700">{activePopoverData.colName}</code>
              </span>
            </div>

            {activePopoverData.latestLineage ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-slate-600 pt-1">
                <div>
                  <span className="text-slate-400">Original Value: </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {activePopoverData.latestLineage.originalValue}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Detection Rule: </span>
                  <span className="font-medium text-slate-900">
                    {activePopoverData.latestLineage.detectionRule}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Action Taken: </span>
                  <span className="font-medium text-emerald-700">
                    {activePopoverData.latestLineage.actionTaken}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Confidence Score: </span>
                  <span className="font-mono font-bold text-blue-700 tabular-nums">
                    {activePopoverData.latestLineage.confidenceScore}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-slate-600 space-y-1">
                <div>
                  <span>Current value: </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {String(activePopoverData.currentVal ?? 'NULL')}
                  </span>
                  {activePopoverData.cellInfo?.isAnomaly && (
                    <>
                      <span className="mx-2 text-slate-300">&middot;</span>
                      <span className="text-red-600 font-medium">
                        {activePopoverData.cellInfo.reason}
                      </span>
                    </>
                  )}
                </div>
                {activePopoverData.cellInfo?.aiExplanation && (
                  <div className="text-[11px] text-slate-500">
                    {activePopoverData.cellInfo.aiExplanation}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isEditingOverride ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                  className="bg-white border border-blue-500 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none"
                  placeholder="Enter override value..."
                />
                <button
                  type="button"
                  onClick={() => {
                    onOverrideCell(
                      activePopoverData.rowIndex,
                      activePopoverData.colName,
                      overrideInput
                    );
                    setIsEditingOverride(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingOverride(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {(activePopoverData.lineageList.length > 0 ||
                  activePopoverData.row.corruptedMeta?.[activePopoverData.colName]) && (
                  <button
                    type="button"
                    onClick={() => {
                      onRevertCell(activePopoverData.rowIndex, activePopoverData.colName);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert to Original</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOverrideInput(
                      activePopoverData.currentVal === null ||
                        activePopoverData.currentVal === undefined
                        ? ''
                        : String(activePopoverData.currentVal)
                    );
                    setIsEditingOverride(true);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Manual Override</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveCellPopover(null);
                setIsEditingOverride(false);
              }}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer"
              aria-label="Close cell lineage inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Data Grid Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Search & Filter Header Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search rows by keyword, column, or value..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500 placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              <button
                onClick={() => {
                  setRiskFilter('all');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer whitespace-nowrap ${
                  riskFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Rows
              </button>
              <button
                onClick={() => {
                  setRiskFilter('high');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer whitespace-nowrap ${
                  riskFilter === 'high'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-slate-600 hover:text-red-700'
                }`}
              >
                High Risk
              </button>
              <button
                onClick={() => {
                  setRiskFilter('medium');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer whitespace-nowrap ${
                  riskFilter === 'medium'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                Medium
              </button>
              <button
                onClick={() => {
                  setRiskFilter('clean');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer whitespace-nowrap ${
                  riskFilter === 'clean'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                Clean
              </button>
            </div>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setPage(1);
              }}
              className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="all">All Anomaly Types</option>
              <option value="missing">Missing Values</option>
              <option value="outlier">Outliers</option>
              <option value="date_format">Date Formats</option>
              <option value="typo">Typos &amp; Whitespace</option>
              <option value="validation">Validation Rules</option>
            </select>
          </div>
        </div>

        {/* Main Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th
                  onClick={() => handleSort('_score')}
                  className="py-2.5 px-3 cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Risk Score</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>

                {schemas.map((col) => (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className={`py-2.5 px-3 cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap ${
                      col.type === 'numeric' ? 'text-right' : 'text-left'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1 ${
                        col.type === 'numeric' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{col.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({col.type})</span>
                    </div>
                  </th>
                ))}

                <th className="py-2.5 px-3 text-center w-16">Row</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row) => {
                  const globalIdx = rowIndexMap.get(row._id) ?? 0;
                  const score = row.anomalyInfo?.totalScore || 0;
                  const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};

                  return (
                    <tr
                      key={row._id}
                      onClick={() => onSelectRow(row, globalIdx)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-center tabular-nums">
                        {globalIdx + 1}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums">
                        <span
                          className={`font-semibold text-xs inline-flex items-center gap-1 ${
                            score > 60
                              ? 'text-red-700'
                              : score > 30
                              ? 'text-amber-700'
                              : score > 10
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {score > 60 && <AlertTriangle className="w-3 h-3" />}
                          <span>{score}/100</span>
                        </span>
                      </td>

                      {schemas.map((col) => {
                        const val = row.data[col.name];
                        const cellInfo = cellAnomalies[col.name];
                        const lineage = row.cellLineage?.[col.name];
                        const hasLineage = lineage && lineage.length > 0;
                        const latestLin = hasLineage ? lineage[lineage.length - 1] : null;
                        const displayStr =
                          val === null || val === undefined || val === '' ? 'NULL' : String(val);

                        const isSelectedCell =
                          activeCellPopover?.rowIndex === globalIdx &&
                          activeCellPopover?.colName === col.name;

                        return (
                          <td
                            key={col.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCellPopover({ rowIndex: globalIdx, colName: col.name });
                              setIsEditingOverride(false);
                            }}
                            title={
                              latestLin
                                ? `${latestLin.actionTaken} (Confidence: ${latestLin.confidenceScore}%) — Click to inspect or revert`
                                : cellInfo?.isAnomaly
                                ? `${cellInfo.reason} — Click to inspect or override`
                                : 'Click to inspect or override cell'
                            }
                            className={`py-2.5 px-3 whitespace-nowrap font-mono tabular-nums ${
                              col.type === 'numeric' ? 'text-right' : 'text-left'
                            } ${isSelectedCell ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : ''}`}
                          >
                            {cellInfo?.isAnomaly ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                                {cellInfo.types.includes('outlier') && (
                                  <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-red-600" />
                                    <span>{displayStr}</span>
                                  </span>
                                )}
                                {cellInfo.types.includes('missing') && (
                                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3 text-amber-600" />
                                    <span>{displayStr}</span>
                                  </span>
                                )}
                                {cellInfo.types.includes('date_format') && (
                                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-blue-600" />
                                    <span>{displayStr}</span>
                                  </span>
                                )}
                                {cellInfo.types.includes('typo') && (
                                  <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    <Type className="w-3 h-3 text-purple-600" />
                                    <span>{displayStr}</span>
                                  </span>
                                )}
                                {cellInfo.types.includes('validation') && (
                                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-emerald-600" />
                                    <span>{displayStr}</span>
                                  </span>
                                )}
                              </span>
                            ) : hasLineage ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                                <History className="w-3 h-3 text-emerald-600" />
                                <span>{displayStr}</span>
                              </span>
                            ) : (
                              <span className="text-slate-800">{displayStr}</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRow(row, globalIdx);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                          title="Open detailed row inspector"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={schemas.length + 3} className="p-8 text-center text-slate-400">
                    No matching rows found. Try adjusting your search query or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="tabular-nums">
            Showing <strong className="text-slate-900">{paginatedRows.length}</strong> of{' '}
            <strong className="text-slate-900">{filteredRows.length.toLocaleString()}</strong> filtered rows (Total:{' '}
            {rows.length.toLocaleString()})
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white border border-slate-300 text-slate-700 text-xs rounded-lg px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1 tabular-nums">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
