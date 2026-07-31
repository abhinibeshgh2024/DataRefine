import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Type,
  CheckCircle2,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import { CellAnomalyInfo, ColumnSchema, CorruptionType, RowData } from '../types';

interface DataTableProps {
  rows: RowData[];
  schemas: ColumnSchema[];
  onSelectRow: (row: RowData, rowIndex: number) => void;
}

export const DataTable: React.FC<DataTableProps> = ({ rows, schemas, onSelectRow }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'clean' | 'low' | 'medium' | 'high'>('all');
  const [typeFilter, setTypeFilter] = useState<CorruptionType | 'all'>('all');
  const [sortField, setSortField] = useState<string>('_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Filter & Search Logic
  const filteredRows = useMemo(() => {
    return rows.filter((row, idx) => {
      const score = row.anomalyInfo?.totalScore || 0;
      const risk = row.anomalyInfo?.riskLevel || 'clean';

      // Risk filter
      if (riskFilter !== 'all') {
        if (riskFilter === 'clean' && score > 10) return false;
        if (riskFilter === 'low' && (score <= 10 || score > 30)) return false;
        if (riskFilter === 'medium' && (score <= 30 || score > 60)) return false;
        if (riskFilter === 'high' && score <= 60) return false;
      }

      // Type filter
      if (typeFilter !== 'all') {
        const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};
        const hasType = Object.values(cellAnomalies).some((cell) =>
          (cell as CellAnomalyInfo).types.includes(typeFilter)
        );
        if (!hasType) return false;
      }

      // Search
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

  // Sort Logic
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortField === '_score') {
        const scoreA = a.anomalyInfo?.totalScore || 0;
        const scoreB = b.anomalyInfo?.totalScore || 0;
        return sortDirection === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      } else {
        const valA = a.data[sortField];
        const valB = b.data[sortField];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        return sortDirection === 'asc' ? 1 : -1;
      }
    });
  }, [filteredRows, sortField, sortDirection]);

  // Pagination
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

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Search & Filter Header Bar */}
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search rows by keyword, column, or value..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-white border border-slate-300 text-slate-800 text-xs rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500 placeholder-slate-400"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Risk Level Selector */}
          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 text-xs shadow-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <button
              onClick={() => {
                setRiskFilter('all');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                riskFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Rows
            </button>
            <button
              onClick={() => {
                setRiskFilter('high');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                riskFilter === 'high' ? 'bg-red-600 text-white' : 'text-slate-600 hover:text-red-600'
              }`}
            >
              High Risk
            </button>
            <button
              onClick={() => {
                setRiskFilter('medium');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                riskFilter === 'medium' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-amber-600'
              }`}
            >
              Medium
            </button>
            <button
              onClick={() => {
                setRiskFilter('clean');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                riskFilter === 'clean' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-emerald-600'
              }`}
            >
              Clean
            </button>
          </div>

          {/* Type Filter Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as any);
              setPage(1);
            }}
            className="bg-white border border-slate-300 text-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="all">All Anomaly Types</option>
            <option value="missing">Missing Values</option>
            <option value="outlier">Outliers</option>
            <option value="date_format">Date Formats</option>
            <option value="typo">Spelling Typos</option>
          </select>
        </div>
      </div>

      {/* Main Table View */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 border-collapse">
          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3 w-12 text-center">#</th>
              <th
                onClick={() => handleSort('_score')}
                className="p-3 cursor-pointer hover:text-slate-800 transition-colors"
              >
                <div className="flex items-center space-x-1">
                  <span>Anomaly Risk</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>

              {schemas.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="p-3 cursor-pointer hover:text-slate-800 transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center space-x-1">
                    <span>{col.name}</span>
                    <span className="text-[9px] text-slate-400 font-normal lowercase">({col.type})</span>
                  </div>
                </th>
              ))}

              <th className="p-3 text-center w-16">Inspect</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {paginatedRows.length > 0 ? (
              paginatedRows.map((row, idx) => {
                const globalIndex = rows.findIndex((r) => r._id === row._id) + 1;
                const score = row.anomalyInfo?.totalScore || 0;
                const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};

                return (
                  <tr
                    key={row._id}
                    onClick={() => onSelectRow(row, globalIndex - 1)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="p-3 font-mono text-slate-400 text-center">{globalIndex}</td>

                    {/* Row Anomaly Risk Score Badge */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-full text-[11px] border flex items-center space-x-1 ${
                            score > 60
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : score > 30
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : score > 10
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}
                        >
                          {score > 60 && <AlertTriangle className="w-3 h-3" />}
                          <span>{score}/100</span>
                        </span>
                      </div>
                    </td>

                    {/* Column Cells */}
                    {schemas.map((col) => {
                      const val = row.data[col.name];
                      const cellInfo = cellAnomalies[col.name];
                      const displayStr = val === null || val === undefined ? 'NULL' : String(val);

                      return (
                        <td key={col.name} className="p-3 whitespace-nowrap font-mono text-slate-800">
                          {cellInfo?.isAnomaly ? (
                            <div className="inline-flex items-center space-x-1.5 px-1 py-0.5 text-xs font-semibold">
                              {cellInfo.types.includes('outlier') && (
                                <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded flex items-center space-x-1" title={cellInfo.reason}>
                                  <AlertTriangle className="w-3 h-3 text-red-600" />
                                  <span>{displayStr}</span>
                                </span>
                              )}
                              {cellInfo.types.includes('missing') && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded flex items-center space-x-1" title={cellInfo.reason}>
                                  <HelpCircle className="w-3 h-3 text-amber-600" />
                                  <span>{displayStr || 'MISSING'}</span>
                                </span>
                              )}
                              {cellInfo.types.includes('date_format') && (
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center space-x-1" title={cellInfo.reason}>
                                  <Calendar className="w-3 h-3 text-blue-600" />
                                  <span>{displayStr}</span>
                                </span>
                              )}
                              {cellInfo.types.includes('typo') && (
                                <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded flex items-center space-x-1" title={cellInfo.reason}>
                                  <Type className="w-3 h-3 text-purple-600" />
                                  <span>{displayStr}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-700">{displayStr}</span>
                          )}
                        </td>
                      );
                    })}

                    {/* View Button */}
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRow(row, globalIndex - 1);
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                        title="View detailed row diff"
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
        <div>
          Showing <strong className="text-slate-800">{paginatedRows.length}</strong> of{' '}
          <strong className="text-slate-800">{filteredRows.length}</strong> filtered rows (Total: {rows.length})
        </div>

        <div className="flex items-center space-x-4">
          {/* Page Size */}
          <div className="flex items-center space-x-1.5">
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

          {/* Controls */}
          <div className="flex items-center space-x-1">
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
  );
};
