import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Header } from './components/Header';
import { DatasetUploader } from './components/DatasetUploader';
import { CorruptionPanel } from './components/CorruptionPanel';
import { StatsOverview } from './components/StatsOverview';
import { DataTable } from './components/DataTable';
import { AutoCleanPanel } from './components/AutoCleanPanel';
import { RowDetailModal } from './components/RowDetailModal';

import { AutoCleanConfig, CorruptionConfig, DatasetState, RowData, SampleDataset, TransformationLog } from './types';
import { SAMPLE_DATASETS } from './utils/sampleData';
import { corruptDataset, inferColumnSchemas } from './utils/corruptionEngine';
import { analyzeAnomalies } from './utils/anomalyDetector';
import { runAutoClean } from './utils/cleanEngine';

export default function App() {
  const [datasetState, setDatasetState] = useState<DatasetState | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'table' | 'autoclean' | 'corrupt'>('dashboard');
  const [selectedRowInfo, setSelectedRowInfo] = useState<{ row: RowData; index: number } | null>(null);

  // Load default sample dataset on first launch
  useEffect(() => {
    const defaultSample = SAMPLE_DATASETS[0];
    handleSelectSample(defaultSample);
  }, []);

  const handleLoadDataset = (filename: string, rawRows: Record<string, any>[]) => {
    const schemas = inferColumnSchemas(rawRows);
    const initialRows: RowData[] = rawRows.map((r, idx) => ({
      _id: `row-${idx}`,
      data: { ...r },
      corruptedMeta: {},
    }));

    const analyzedRows = analyzeAnomalies(initialRows, schemas);

    setDatasetState({
      filename,
      columns: schemas,
      originalRows: rawRows,
      currentRows: analyzedRows,
      isCorrupted: false,
      isCleaned: false,
      cleanHistoryLogs: [],
    });
    setActiveTab('dashboard');
  };

  const handleSelectSample = (sample: SampleDataset) => {
    Papa.parse<Record<string, any>>(sample.csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        handleLoadDataset(`${sample.name}.csv`, results.data);
      },
    });
  };

  const handleCorrupt = (config: CorruptionConfig) => {
    if (!datasetState) return;

    const corruptedRawRows = corruptDataset(datasetState.originalRows, datasetState.columns, config);
    const analyzedCorruptedRows = analyzeAnomalies(corruptedRawRows, datasetState.columns);

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: analyzedCorruptedRows,
            isCorrupted: true,
            isCleaned: false,
          }
        : null
    );
    setActiveTab('dashboard');
  };

  const handleRunClean = (config: AutoCleanConfig) => {
    if (!datasetState) return;

    const { cleanedRows, logs } = runAutoClean(datasetState.currentRows, datasetState.columns, config);
    const reAnalyzedRows = analyzeAnomalies(cleanedRows, datasetState.columns);

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: reAnalyzedRows,
            isCleaned: true,
            cleanHistoryLogs: [...logs, ...prev.cleanHistoryLogs],
          }
        : null
    );
  };

  const handleReset = () => {
    if (!datasetState) return;
    handleLoadDataset(datasetState.filename, datasetState.originalRows);
  };

  const handleExportCSV = () => {
    if (!datasetState || datasetState.currentRows.length === 0) return;

    const exportData = datasetState.currentRows.map((r) => r.data);
    const csvStr = Papa.unparse(exportData);

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cleaned_${datasetState.filename}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateCell = (rowIndex: number, colName: string, newValue: any) => {
    if (!datasetState) return;

    const updatedCurrentRows = [...datasetState.currentRows];
    const targetRow = { ...updatedCurrentRows[rowIndex] };
    targetRow.data = { ...targetRow.data, [colName]: newValue };

    updatedCurrentRows[rowIndex] = targetRow;

    const reAnalyzed = analyzeAnomalies(updatedCurrentRows, datasetState.columns);

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: reAnalyzed,
          }
        : null
    );

    if (selectedRowInfo) {
      setSelectedRowInfo({
        row: reAnalyzed[rowIndex],
        index: rowIndex,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      <Header
        datasetState={datasetState}
        onSelectSample={handleSelectSample}
        onReset={handleReset}
        onExportCSV={handleExportCSV}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {!datasetState ? (
          <DatasetUploader onLoadDataset={handleLoadDataset} onSelectSample={handleSelectSample} />
        ) : (
          <>
            {/* Top Bar Info Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 text-xs gap-4 shadow-sm">
              <div className="flex items-center space-x-3">
                <span className="font-bold text-slate-800 text-sm">{datasetState.filename}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{datasetState.currentRows.length} Rows</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{datasetState.columns.length} Columns</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setDatasetState(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                >
                  Upload Different CSV
                </button>
              </div>
            </div>

            {/* Render Active View Tab */}
            {activeTab === 'dashboard' && (
              <StatsOverview rows={datasetState.currentRows} schemas={datasetState.columns} />
            )}

            {activeTab === 'table' && (
              <DataTable
                rows={datasetState.currentRows}
                schemas={datasetState.columns}
                onSelectRow={(row, idx) => setSelectedRowInfo({ row, index: idx })}
              />
            )}

            {activeTab === 'corrupt' && (
              <CorruptionPanel
                onCorrupt={handleCorrupt}
                rowCount={datasetState.currentRows.length}
                colCount={datasetState.columns.length}
              />
            )}

            {activeTab === 'autoclean' && (
              <AutoCleanPanel
                onRunClean={handleRunClean}
                logs={datasetState.cleanHistoryLogs}
                isCleaned={datasetState.isCleaned}
                totalAnomaliesCount={
                  datasetState.currentRows.filter((r) => (r.anomalyInfo?.totalScore || 0) > 10).length
                }
              />
            )}
          </>
        )}
      </main>

      {/* Row Detail Inspector Modal */}
      {selectedRowInfo && datasetState && (
        <RowDetailModal
          row={selectedRowInfo.row}
          rowIndex={selectedRowInfo.index}
          schemas={datasetState.columns}
          originalRow={datasetState.originalRows[selectedRowInfo.index]}
          onClose={() => setSelectedRowInfo(null)}
          onUpdateCell={handleUpdateCell}
        />
      )}
    </div>
  );
}
