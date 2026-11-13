import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  GitBranch,
  Table as TableIcon,
} from 'lucide-react';
import { DatasetState } from '../types';

export type WorkspaceTab =
  | 'dashboard'
  | 'table'
  | 'profiling'
  | 'analyst'
  | 'policies'
  | 'corrupt';

export type ExportFormatOption =
  | 'csv'
  | 'xlsx'
  | 'json'
  | 'pdf_report'
  | 'excel_report'
  | 'pipeline_json';

interface HeaderProps {
  datasetState: DatasetState | null;
  onExport: (format: ExportFormatOption) => void;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  datasetState,
  onExport,
  activeTab,
  setActiveTab,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const totalAnomalousRows = datasetState
    ? datasetState.currentRows.filter((r) => r.anomalyInfo && r.anomalyInfo.totalScore > 10).length
    : 0;

  const pendingRecsCount = datasetState
    ? datasetState.recommendations.filter((r) => r.status === 'pending').length
    : 0;

  const navItems: { id: WorkspaceTab; label: string; isStress?: boolean }[] = [
    { id: 'dashboard', label: 'Overview' },
    {
      id: 'table',
      label: totalAnomalousRows > 0 ? `Data Grid (${totalAnomalousRows})` : 'Data Grid',
    },
    { id: 'profiling', label: 'Profiling & EDA' },
    {
      id: 'analyst',
      label: pendingRecsCount > 0 ? `AI Analyst (${pendingRecsCount})` : 'AI Analyst',
    },
    { id: 'policies', label: 'Policies & Clean' },
    { id: 'corrupt', label: 'Stress Test & Export', isStress: true },
  ];

  const triggerExport = (fmt: ExportFormatOption) => {
    setMenuOpen(false);
    onExport(fmt);
  };

  return (
    <header className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer hover:text-blue-600 transition-colors"
          >
            DataRefine
          </button>

          {/* Zone 2: 6 Concise single-line workspace nav links */}
          {datasetState ? (
            <nav className="hidden lg:flex items-center gap-5 text-sm font-medium">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`tab-${item.id}-btn`}
                    onClick={() => setActiveTab(item.id)}
                    className={`py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors border-b-2 tabular-nums ${
                      isActive
                        ? item.isStress
                          ? 'text-red-600 border-red-600 font-semibold'
                          : 'text-blue-600 border-blue-600 font-semibold'
                        : item.isStress
                        ? 'text-slate-600 border-transparent hover:text-red-600'
                        : 'text-slate-600 border-transparent hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="hidden md:block text-sm text-slate-500 whitespace-nowrap">
              Data Hygiene, Profiling &amp; Analytics Workbench
            </div>
          )}

          {/* Zone 3: Single Export Dropdown Action */}
          <div className="flex items-center shrink-0 relative" ref={menuRef}>
            {datasetState ? (
              <>
                <button
                  id="export-menu-btn"
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-xs">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400">
                      Cleaned Dataset
                    </div>
                    <button
                      type="button"
                      onClick={() => triggerExport('csv')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <TableIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export Cleaned CSV (.csv)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerExport('xlsx')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerExport('json')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileJson className="w-3.5 h-3.5 text-blue-600" />
                      <span>Export Structured JSON (.json)</span>
                    </button>

                    <div className="my-1 border-t border-slate-100" />
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400">
                      Reports &amp; Automation
                    </div>
                    <button
                      type="button"
                      onClick={() => triggerExport('pdf_report')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-red-600" />
                      <span>Download PDF Quality Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerExport('excel_report')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                      <span>Download Excel Audit Workbook</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerExport('pipeline_json')}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <GitBranch className="w-3.5 h-3.5 text-purple-600" />
                      <span>Export Cleaning Pipeline (.json)</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                Upload CSV, Excel, or JSON
              </span>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Nav Bar */}
        {datasetState && (
          <div className="flex lg:hidden items-center gap-1.5 py-2 border-t border-slate-200 text-xs font-medium overflow-x-auto">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? item.isStress
                        ? 'text-red-600 bg-red-50 font-semibold'
                        : 'text-blue-600 bg-blue-50 font-semibold'
                      : 'text-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
};
