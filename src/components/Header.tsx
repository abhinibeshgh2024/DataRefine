import React from 'react';
import { Download, RefreshCw, Sparkles, Database, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { DatasetState, SampleDataset } from '../types';
import { SAMPLE_DATASETS } from '../utils/sampleData';

interface HeaderProps {
  datasetState: DatasetState | null;
  onSelectSample: (sample: SampleDataset) => void;
  onReset: () => void;
  onExportCSV: () => void;
  activeTab: 'dashboard' | 'table' | 'autoclean' | 'corrupt';
  setActiveTab: (tab: 'dashboard' | 'table' | 'autoclean' | 'corrupt') => void;
}

export const Header: React.FC<HeaderProps> = ({
  datasetState,
  onSelectSample,
  onReset,
  onExportCSV,
  activeTab,
  setActiveTab,
}) => {
  // Calculate health score
  let healthScore = 100;
  let totalAnomalousRows = 0;

  if (datasetState && datasetState.currentRows.length > 0) {
    const totalRows = datasetState.currentRows.length;
    totalAnomalousRows = datasetState.currentRows.filter(
      (r) => r.anomalyInfo && r.anomalyInfo.totalScore > 10
    ).length;

    const avgScore =
      datasetState.currentRows.reduce((acc, r) => acc + (r.anomalyInfo?.totalScore || 0), 0) /
      totalRows;
    healthScore = Math.max(0, Math.round(100 - avgScore));
  }

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Name */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-lg text-slate-800 tracking-tight">DataRefine</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                  AI & Statistical
                </span>
              </div>
              <p className="text-xs text-slate-500">Data Hygiene, Corruption Simulation & Auto-Clean</p>
            </div>
          </div>

          {/* Center Tabs */}
          {datasetState && (
            <nav className="hidden md:flex items-center space-x-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
              <button
                id="tab-dashboard-btn"
                onClick={() => setActiveTab('dashboard')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                Dashboard
              </button>
              <button
                id="tab-table-btn"
                onClick={() => setActiveTab('table')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center space-x-1.5 ${
                  activeTab === 'table'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>Data Grid</span>
                {totalAnomalousRows > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-orange-100 text-orange-700 font-bold">
                    {totalAnomalousRows}
                  </span>
                )}
              </button>
              <button
                id="tab-corrupt-btn"
                onClick={() => setActiveTab('corrupt')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'corrupt'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-slate-600 hover:text-red-600 hover:bg-slate-200/50'
                }`}
              >
                Corrupt Data
              </button>
              <button
                id="tab-autoclean-btn"
                onClick={() => setActiveTab('autoclean')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'autoclean'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-blue-600 hover:bg-slate-200/50'
                }`}
              >
                Auto-Clean
              </button>
            </nav>
          )}

          {/* Right Action Menu */}
          <div className="flex items-center space-x-3">
            {datasetState ? (
              <>
                {/* Health Badge */}
                <div
                  className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    healthScore >= 80
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : healthScore >= 50
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {healthScore >= 80 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4" />
                  )}
                  <span>Health: {healthScore}%</span>
                </div>

                {/* Reset Button */}
                <button
                  id="reset-dataset-btn"
                  onClick={onReset}
                  title="Reset to clean state"
                  className="p-2 text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-lg transition-colors border border-slate-200 shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Export Button */}
                <button
                  id="export-csv-btn"
                  onClick={onExportCSV}
                  className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">Select or Upload CSV to Start</span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav Bar */}
        {datasetState && (
          <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-200 text-xs font-medium bg-slate-50">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1 rounded-lg ${activeTab === 'dashboard' ? 'text-blue-600 bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1 rounded-lg ${activeTab === 'table' ? 'text-blue-600 bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setActiveTab('corrupt')}
              className={`px-3 py-1 rounded-lg ${activeTab === 'corrupt' ? 'text-red-600 bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
            >
              Corrupt
            </button>
            <button
              onClick={() => setActiveTab('autoclean')}
              className={`px-3 py-1 rounded-lg ${activeTab === 'autoclean' ? 'text-blue-600 bg-white font-semibold shadow-sm' : 'text-slate-600'}`}
            >
              Clean
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
