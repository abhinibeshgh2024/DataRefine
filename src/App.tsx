import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  Cpu,
  Redo2,
  RefreshCw,
  Server,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { ExportFormatOption, Header, WorkspaceTab } from './components/Header';
import { DatasetUploader } from './components/DatasetUploader';
import { CorruptionPanel } from './components/CorruptionPanel';
import { StatsOverview } from './components/StatsOverview';
import { DataTable } from './components/DataTable';
import { ColumnPolicyMatrix } from './components/ColumnPolicyMatrix';
import { RowDetailModal } from './components/RowDetailModal';
import { ProfilingEDAPanel } from './components/ProfilingEDAPanel';
import { AiAnalystPanel } from './components/AiAnalystPanel';

import {
  CleaningPipelineManifest,
  ColumnPolicy,
  CorruptionConfig,
  DataContractSchema,
  DatasetProfileReport,
  DatasetState,
  DuplicateResolutionStrategy,
  RowData,
  SampleDataset,
  SessionSnapshot,
} from './types';
import { SAMPLE_DATASETS } from './utils/sampleData';
import { inferColumnSchemas } from './utils/corruptionEngine';
import { buildCleaningPipelineManifest, createDefaultPolicies } from './utils/policyEngine';
import { overrideSingleCell, revertSingleCell } from './utils/cleanEngine';
import {
  HYBRID_THRESHOLD_ROWS,
  runDuckDBProfile,
  runHybridAnalyze,
  runHybridClean,
  runHybridCorrupt,
  runHybridDedupe,
} from './utils/pipelineRouter';
import {
  normalizeParsedRows,
  parseAnyCSVFile,
  parseExcelSheetFromBuffer,
} from './utils/csvLoader';
import { generateDatasetProfile } from './utils/profilerEngine';
import {
  generateCleaningRecommendations,
  generateCleaningSummaryNarrative,
} from './utils/localAiAnalyst';
import {
  exportCleanedCSV,
  exportCleanedExcel,
  exportCleanedJSON,
  exportCleaningPipelineJSON,
  exportMultiSheetExcelReport,
  exportPDFAnalyticalReport,
} from './utils/exportEngine';
import {
  clearWorkspaceSession,
  loadPreferredTab,
  loadWorkspaceSession,
  savePreferredTab,
  saveWorkspaceSession,
} from './utils/sessionStorage';

const MAX_UNDO_STEPS = 20;

export default function App() {
  const [datasetState, setDatasetState] = useState<DatasetState | null>(null);
  const [activeTab, setActiveTabState] = useState<WorkspaceTab>(() => {
    const saved = loadPreferredTab();
    const valid: WorkspaceTab[] = [
      'dashboard',
      'table',
      'profiling',
      'analyst',
      'policies',
      'corrupt',
    ];
    return valid.includes(saved as WorkspaceTab) ? (saved as WorkspaceTab) : 'dashboard';
  });
  const [undoStack, setUndoStack] = useState<SessionSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SessionSnapshot[]>([]);
  const [selectedRowInfo, setSelectedRowInfo] = useState<{ row: RowData; index: number } | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingExcel, setPendingExcel] = useState<{
    filename: string;
    sheetNames: string[];
    buffer: ArrayBuffer;
  } | null>(null);

  const quickUploadInputRef = useRef<HTMLInputElement>(null);
  const loadGenRef = useRef(0);
  const hydratedRef = useRef(false);

  const setActiveTab = useCallback((tab: WorkspaceTab) => {
    setActiveTabState(tab);
    savePreferredTab(tab);
  }, []);

  const pushSnapshot = useCallback((state: DatasetState, label: string) => {
    const snapshot: SessionSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: new Date().toLocaleTimeString(),
      currentRows: state.currentRows,
      policies: state.policies,
      cleanHistoryLogs: state.cleanHistoryLogs,
      isCleaned: state.isCleaned,
      isCorrupted: state.isCorrupted,
    };
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_STEPS - 1)), snapshot]);
    setRedoStack([]);
  }, []);

  const handleLoadDataset = useCallback(
    async (
      filename: string,
      rawRows: Record<string, any>[],
      fileFormat: 'csv' | 'xlsx' | 'json' | 'sample' = 'csv'
    ) => {
      const loadId = ++loadGenRef.current;
      setLoadError(null);
      setIsProcessing(true);
      setProcessingLabel(`Profiling ${filename}...`);

      try {
        const { rows: cleanRows } = normalizeParsedRows(rawRows);
        if (cleanRows.length === 0) {
          throw new Error('The uploaded file contains no non-empty rows.');
        }

        const schemas = inferColumnSchemas(cleanRows);
        if (schemas.length === 0) {
          throw new Error('No columns could be inferred from the uploaded file.');
        }

        const policies = createDefaultPolicies(schemas);
        const initialRows: RowData[] = cleanRows.map((r, idx) => ({
          _id: `row-${idx}`,
          data: { ...r },
          corruptedMeta: {},
          cellLineage: {},
        }));

        const { analyzedRows, profiles, execution } = await runHybridAnalyze(
          initialRows,
          schemas,
          policies,
          'load',
          { deferWasmProfile: true }
        );

        if (loadId !== loadGenRef.current) return;

        const profileReport = generateDatasetProfile(analyzedRows, schemas, policies);
        const recommendations = generateCleaningRecommendations(
          analyzedRows,
          schemas,
          policies,
          profileReport
        );

        setUndoStack([]);
        setRedoStack([]);
        setSelectedRowInfo(null);

        setDatasetState({
          filename,
          fileFormat,
          columns: schemas,
          policies,
          originalRows: cleanRows,
          currentRows: analyzedRows,
          isCorrupted: false,
          isCleaned: false,
          cleanHistoryLogs: [],
          duckdbProfiles: profiles,
          baselineProfile: profileReport,
          currentProfile: profileReport,
          recommendations,
          lastExecution: execution,
          activeContract: null,
        });
        setActiveTab('dashboard');

        if (analyzedRows.length < HYBRID_THRESHOLD_ROWS) {
          runDuckDBProfile(analyzedRows, schemas, policies)
            .then((res) => {
              if (loadId !== loadGenRef.current) return;
              if (res.usedWasm) {
                setDatasetState((prev) =>
                  prev
                    ? {
                        ...prev,
                        duckdbProfiles: res.profiles,
                        lastExecution: {
                          mode: 'duckdb_wasm',
                          rowCount: analyzedRows.length,
                          durationMs: res.durationMs,
                          operation: 'load',
                          sqlProfiled: true,
                          timestamp: new Date().toLocaleTimeString(),
                        },
                      }
                    : null
                );
              }
            })
            .catch(() => {
              // Silent fallback
            });
        }
      } catch (err: any) {
        setLoadError(err?.message || 'Unable to load the selected dataset.');
      } finally {
        if (loadId === loadGenRef.current) {
          setIsProcessing(false);
          setProcessingLabel('');
        }
      }
    },
    [setActiveTab]
  );

  const handleSelectSample = useCallback(
    (sample: SampleDataset) => {
      if (sample.generator) {
        const rows = sample.generator();
        handleLoadDataset(`${sample.id}.csv`, rows, 'sample');
        return;
      }

      if (sample.csvContent) {
        Papa.parse<Record<string, any>>(sample.csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
          complete: (results) => {
            handleLoadDataset(`${sample.name}.csv`, results.data, 'sample');
          },
        });
      }
    },
    [handleLoadDataset]
  );

  // Restore IndexedDB session on mount; otherwise load default sample
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadWorkspaceSession();
      if (cancelled) return;
      if (saved && saved.datasetState && saved.datasetState.currentRows?.length > 0) {
        setDatasetState(saved.datasetState);
        setUndoStack(saved.undoStack || []);
        setRedoStack(saved.redoStack || []);
        hydratedRef.current = true;
        if (saved.datasetState.currentRows.length < HYBRID_THRESHOLD_ROWS) {
          runDuckDBProfile(
            saved.datasetState.currentRows,
            saved.datasetState.columns,
            saved.datasetState.policies
          ).catch(() => {});
        }
      } else {
        hydratedRef.current = true;
        handleSelectSample(SAMPLE_DATASETS[0]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleSelectSample]);

  // Persist workspace session automatically whenever state/history updates
  useEffect(() => {
    if (!hydratedRef.current || !datasetState) return;
    const timer = setTimeout(() => {
      saveWorkspaceSession({
        datasetState,
        undoStack,
        redoStack,
        savedAt: new Date().toISOString(),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [datasetState, undoStack, redoStack]);

  const recomputeProfileAndRecs = useCallback(
    (
      rows: RowData[],
      schemas: DatasetState['columns'],
      policies: Record<string, ColumnPolicy>,
      preserveAppliedIds?: Set<string>
    ) => {
      const currentProfile = generateDatasetProfile(rows, schemas, policies);
      const recs = generateCleaningRecommendations(rows, schemas, policies, currentProfile).map(
        (r) =>
          preserveAppliedIds?.has(r.id) ? { ...r, status: 'applied' as const } : r
      );
      return { currentProfile, recs };
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (!datasetState || undoStack.length === 0) return;
    const lastSnap = undoStack[undoStack.length - 1];
    const currentSnap: SessionSnapshot = {
      id: `redo-${Date.now()}`,
      label: 'Redo State',
      timestamp: new Date().toLocaleTimeString(),
      currentRows: datasetState.currentRows,
      policies: datasetState.policies,
      cleanHistoryLogs: datasetState.cleanHistoryLogs,
      isCleaned: datasetState.isCleaned,
      isCorrupted: datasetState.isCorrupted,
    };

    const { currentProfile, recs } = recomputeProfileAndRecs(
      lastSnap.currentRows,
      datasetState.columns,
      lastSnap.policies
    );

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentSnap]);
    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: lastSnap.currentRows,
            policies: lastSnap.policies,
            cleanHistoryLogs: lastSnap.cleanHistoryLogs,
            isCleaned: lastSnap.isCleaned,
            isCorrupted: lastSnap.isCorrupted,
            currentProfile,
            recommendations: recs,
          }
        : null
    );
  }, [datasetState, undoStack, recomputeProfileAndRecs]);

  const handleRedo = useCallback(() => {
    if (!datasetState || redoStack.length === 0) return;
    const nextSnap = redoStack[redoStack.length - 1];
    const currentSnap: SessionSnapshot = {
      id: `undo-${Date.now()}`,
      label: 'Undo State',
      timestamp: new Date().toLocaleTimeString(),
      currentRows: datasetState.currentRows,
      policies: datasetState.policies,
      cleanHistoryLogs: datasetState.cleanHistoryLogs,
      isCleaned: datasetState.isCleaned,
      isCorrupted: datasetState.isCorrupted,
    };

    const { currentProfile, recs } = recomputeProfileAndRecs(
      nextSnap.currentRows,
      datasetState.columns,
      nextSnap.policies
    );

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentSnap]);
    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: nextSnap.currentRows,
            policies: nextSnap.policies,
            cleanHistoryLogs: nextSnap.cleanHistoryLogs,
            isCleaned: nextSnap.isCleaned,
            isCorrupted: nextSnap.isCorrupted,
            currentProfile,
            recommendations: recs,
          }
        : null
    );
  }, [datasetState, redoStack, recomputeProfileAndRecs]);

  // Keyboard shortcuts for Undo / Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleQuickFileUpload = async (file: File) => {
    setLoadError(null);
    setPendingExcel(null);
    setIsProcessing(true);
    setProcessingLabel(`Parsing ${file.name}...`);
    try {
      const parsed = await parseAnyCSVFile(file);
      if (parsed.needsSheetSelection && parsed.sheetNames && parsed.rawBuffer) {
        setPendingExcel({
          filename: parsed.filename,
          sheetNames: parsed.sheetNames,
          buffer: parsed.rawBuffer,
        });
        setIsProcessing(false);
        setProcessingLabel('');
        return;
      }
      await handleLoadDataset(parsed.filename, parsed.rows, parsed.fileFormat);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to parse uploaded file.');
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handlePickQuickExcelSheet = async (sheetName: string) => {
    if (!pendingExcel) return;
    setIsProcessing(true);
    setProcessingLabel(`Loading worksheet ${sheetName}...`);
    try {
      const parsed = parseExcelSheetFromBuffer(
        pendingExcel.buffer,
        pendingExcel.filename,
        sheetName
      );
      setPendingExcel(null);
      await handleLoadDataset(`${parsed.filename} (${sheetName})`, parsed.rows, 'xlsx');
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load worksheet.');
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handleCorrupt = async (config: CorruptionConfig) => {
    if (!datasetState) return;
    pushSnapshot(datasetState, 'Before Stress Test');
    setIsProcessing(true);
    setProcessingLabel('Injecting controlled noise...');
    try {
      const { corruptedRows, profiles, execution } = await runHybridCorrupt(
        datasetState.originalRows,
        datasetState.columns,
        datasetState.policies,
        config
      );

      const { currentProfile, recs } = recomputeProfileAndRecs(
        corruptedRows,
        datasetState.columns,
        datasetState.policies
      );

      setDatasetState((prev) =>
        prev
          ? {
              ...prev,
              currentRows: corruptedRows,
              isCorrupted: true,
              isCleaned: false,
              duckdbProfiles: profiles,
              baselineProfile: currentProfile,
              currentProfile,
              recommendations: recs,
              lastExecution: execution,
            }
          : null
      );
      setActiveTab('dashboard');
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handleRunPolicyClean = async (
    overridePolicies?: Record<string, ColumnPolicy>,
    appliedIds?: Set<string>
  ) => {
    if (!datasetState) return;
    const activePolicies = overridePolicies || datasetState.policies;
    pushSnapshot(datasetState, 'Before Policy Auto-Clean');
    setIsProcessing(true);
    setProcessingLabel('Running statistical cleaning pipeline...');
    try {
      const { cleanedRows, logs, profiles, execution } = await runHybridClean(
        datasetState.currentRows,
        datasetState.columns,
        activePolicies
      );

      const { currentProfile, recs } = recomputeProfileAndRecs(
        cleanedRows,
        datasetState.columns,
        activePolicies,
        appliedIds
      );

      setDatasetState((prev) =>
        prev
          ? {
              ...prev,
              policies: activePolicies,
              currentRows: cleanedRows,
              isCleaned: true,
              cleanHistoryLogs: [...logs, ...prev.cleanHistoryLogs],
              duckdbProfiles: profiles,
              currentProfile,
              recommendations: recs,
              lastExecution: execution,
            }
          : null
      );
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handleResolveDuplicates = async (
    keyColumns: string[],
    strategy: DuplicateResolutionStrategy
  ) => {
    if (!datasetState) return;
    pushSnapshot(datasetState, 'Before Deduplication');
    setIsProcessing(true);
    setProcessingLabel('Resolving duplicate records...');
    try {
      const { dedupedRows, logs, profiles, execution } = await runHybridDedupe(
        datasetState.currentRows,
        datasetState.columns,
        datasetState.policies,
        keyColumns,
        strategy
      );

      const { currentProfile, recs } = recomputeProfileAndRecs(
        dedupedRows,
        datasetState.columns,
        datasetState.policies
      );

      setDatasetState((prev) =>
        prev
          ? {
              ...prev,
              currentRows: dedupedRows,
              isCleaned: true,
              cleanHistoryLogs: [...logs, ...prev.cleanHistoryLogs],
              duckdbProfiles: profiles,
              currentProfile,
              recommendations: recs,
              lastExecution: execution,
            }
          : null
      );
    } finally {
      setIsProcessing(false);
      setProcessingLabel('');
    }
  };

  const handleUpdatePolicy = async (colName: string, updates: Partial<ColumnPolicy>) => {
    if (!datasetState) return;
    const nextPolicies: Record<string, ColumnPolicy> = {
      ...datasetState.policies,
      [colName]: {
        ...datasetState.policies[colName],
        ...updates,
      },
    };

    const { analyzedRows, profiles, execution } = await runHybridAnalyze(
      datasetState.currentRows,
      datasetState.columns,
      nextPolicies,
      'analyze',
      { deferWasmProfile: true }
    );

    const { currentProfile, recs } = recomputeProfileAndRecs(
      analyzedRows,
      datasetState.columns,
      nextPolicies
    );

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            policies: nextPolicies,
            currentRows: analyzedRows,
            duckdbProfiles: Object.keys(profiles).length > 0 ? profiles : prev.duckdbProfiles,
            currentProfile,
            recommendations: recs,
            lastExecution: execution,
          }
        : null
    );
  };

  const handleBatchUpdatePolicies = async (
    colNames: string[],
    updates: Partial<ColumnPolicy>
  ) => {
    if (!datasetState || colNames.length === 0) return;
    const nextPolicies: Record<string, ColumnPolicy> = { ...datasetState.policies };
    colNames.forEach((c) => {
      if (nextPolicies[c]) {
        nextPolicies[c] = { ...nextPolicies[c], ...updates };
      }
    });

    const { analyzedRows, profiles, execution } = await runHybridAnalyze(
      datasetState.currentRows,
      datasetState.columns,
      nextPolicies,
      'analyze',
      { deferWasmProfile: true }
    );

    const { currentProfile, recs } = recomputeProfileAndRecs(
      analyzedRows,
      datasetState.columns,
      nextPolicies
    );

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            policies: nextPolicies,
            currentRows: analyzedRows,
            duckdbProfiles: Object.keys(profiles).length > 0 ? profiles : prev.duckdbProfiles,
            currentProfile,
            recommendations: recs,
            lastExecution: execution,
          }
        : null
    );
  };

  const handleApplyContractPolicies = async (contract: DataContractSchema) => {
    if (!datasetState) return;
    const mergedPolicies: Record<string, ColumnPolicy> = { ...datasetState.policies };
    Object.entries(contract.columns).forEach(([colName, rule]) => {
      if (mergedPolicies[colName]) {
        mergedPolicies[colName] = { ...mergedPolicies[colName], ...rule };
      }
    });

    const { analyzedRows, profiles, execution } = await runHybridAnalyze(
      datasetState.currentRows,
      datasetState.columns,
      mergedPolicies,
      'analyze',
      { deferWasmProfile: true }
    );

    const { currentProfile, recs } = recomputeProfileAndRecs(
      analyzedRows,
      datasetState.columns,
      mergedPolicies
    );

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            policies: mergedPolicies,
            activeContract: contract,
            currentRows: analyzedRows,
            duckdbProfiles: Object.keys(profiles).length > 0 ? profiles : prev.duckdbProfiles,
            currentProfile,
            recommendations: recs,
            lastExecution: execution,
          }
        : null
    );
  };

  const handleApplyPipelineManifest = async (
    manifest: CleaningPipelineManifest,
    runImmediately: boolean
  ) => {
    if (!datasetState) return;
    const mergedPolicies: Record<string, ColumnPolicy> = { ...datasetState.policies };
    Object.entries(manifest.policies).forEach(([colName, rule]) => {
      if (mergedPolicies[colName]) {
        mergedPolicies[colName] = { ...mergedPolicies[colName], ...rule };
      }
    });

    if (runImmediately) {
      await handleRunPolicyClean(mergedPolicies);
    } else {
      await handleBatchUpdatePolicies(Object.keys(mergedPolicies), {});
    }
  };

  const handleApproveRecommendation = (recId: string) => {
    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            recommendations: prev.recommendations.map((r) =>
              r.id === recId
                ? { ...r, status: r.status === 'approved' ? 'pending' : 'approved' }
                : r
            ),
          }
        : null
    );
  };

  const handleRejectRecommendation = (recId: string) => {
    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            recommendations: prev.recommendations.map((r) =>
              r.id === recId
                ? { ...r, status: r.status === 'rejected' ? 'pending' : 'rejected' }
                : r
            ),
          }
        : null
    );
  };

  const handleApproveAllPending = () => {
    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            recommendations: prev.recommendations.map((r) =>
              r.status === 'pending' ? { ...r, status: 'approved' } : r
            ),
          }
        : null
    );
  };

  const handleApplyApprovedRecommendations = async () => {
    if (!datasetState) return;
    const approved = datasetState.recommendations.filter((r) => r.status === 'approved');
    if (approved.length === 0) return;

    const nextPolicies: Record<string, ColumnPolicy> = { ...datasetState.policies };
    let needsDedupe = false;
    let dedupeStrategy: DuplicateResolutionStrategy = 'keep_first';
    const appliedIds = new Set<string>();

    approved.forEach((rec) => {
      appliedIds.add(rec.id);
      if (rec.category === 'duplicate' && rec.duplicateStrategy) {
        needsDedupe = true;
        dedupeStrategy = rec.duplicateStrategy;
      } else if (rec.patchPolicy && nextPolicies[rec.columnName]) {
        nextPolicies[rec.columnName] = {
          ...nextPolicies[rec.columnName],
          ...rec.patchPolicy,
        };
      }
    });

    if (needsDedupe) {
      await handleResolveDuplicates([], dedupeStrategy);
    }
    await handleRunPolicyClean(nextPolicies, appliedIds);
  };

  const handleReset = () => {
    if (!datasetState) return;
    handleLoadDataset(datasetState.filename, datasetState.originalRows, datasetState.fileFormat);
  };

  const handleClearLocalSession = async () => {
    await clearWorkspaceSession();
    setUndoStack([]);
    setRedoStack([]);
    setLoadError(null);
    setDatasetState(null);
  };

  const activeProfile: DatasetProfileReport | null = useMemo(() => {
    if (!datasetState) return null;
    if (datasetState.currentProfile) return datasetState.currentProfile;
    return generateDatasetProfile(
      datasetState.currentRows,
      datasetState.columns,
      datasetState.policies
    );
  }, [datasetState]);

  const handleExport = (format: ExportFormatOption) => {
    if (!datasetState || !activeProfile) return;
    if (format === 'csv') {
      exportCleanedCSV(datasetState);
    } else if (format === 'xlsx') {
      exportCleanedExcel(datasetState);
    } else if (format === 'json') {
      exportCleanedJSON(datasetState);
    } else if (format === 'excel_report') {
      exportMultiSheetExcelReport(datasetState, activeProfile);
    } else if (format === 'pdf_report') {
      const narrative = generateCleaningSummaryNarrative(
        datasetState.baselineProfile,
        activeProfile,
        datasetState.cleanHistoryLogs
      );
      exportPDFAnalyticalReport(datasetState, activeProfile, narrative);
    } else if (format === 'pipeline_json') {
      const manifest = buildCleaningPipelineManifest(
        datasetState.filename.replace(/\.[^.]+$/, ''),
        '1.0.0',
        `Cleaning pipeline exported from ${datasetState.filename}`,
        datasetState.policies,
        { keyColumns: [], strategy: 'keep_first' }
      );
      exportCleaningPipelineJSON(manifest);
    }
  };

  const handleOverrideCell = (rowIndex: number, colName: string, newValue: any) => {
    if (!datasetState || rowIndex < 0 || rowIndex >= datasetState.currentRows.length) return;
    pushSnapshot(datasetState, `Manual Edit (${colName})`);

    const { updatedRows, logEntry } = overrideSingleCell(
      datasetState.currentRows,
      rowIndex,
      colName,
      newValue,
      datasetState.originalRows[rowIndex],
      datasetState.columns,
      datasetState.policies
    );

    const { currentProfile, recs } = recomputeProfileAndRecs(
      updatedRows,
      datasetState.columns,
      datasetState.policies
    );

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: updatedRows,
            cleanHistoryLogs: [logEntry, ...prev.cleanHistoryLogs],
            currentProfile,
            recommendations: recs,
          }
        : null
    );

    if (selectedRowInfo && selectedRowInfo.index === rowIndex) {
      setSelectedRowInfo({ row: updatedRows[rowIndex], index: rowIndex });
    }
  };

  const handleRevertCell = (rowIndex: number, colName: string) => {
    if (!datasetState || rowIndex < 0 || rowIndex >= datasetState.currentRows.length) return;
    pushSnapshot(datasetState, `Cell Rollback (${colName})`);

    const { updatedRows, logEntry } = revertSingleCell(
      datasetState.currentRows,
      rowIndex,
      colName,
      datasetState.originalRows[rowIndex],
      datasetState.columns,
      datasetState.policies
    );

    const { currentProfile, recs } = recomputeProfileAndRecs(
      updatedRows,
      datasetState.columns,
      datasetState.policies
    );

    setDatasetState((prev) =>
      prev
        ? {
            ...prev,
            currentRows: updatedRows,
            cleanHistoryLogs: [logEntry, ...prev.cleanHistoryLogs],
            currentProfile,
            recommendations: recs,
          }
        : null
    );

    if (selectedRowInfo && selectedRowInfo.index === rowIndex) {
      setSelectedRowInfo({ row: updatedRows[rowIndex], index: rowIndex });
    }
  };

  const handleInspectRowByIndex = (rowIndex: number) => {
    if (!datasetState) return;
    if (rowIndex >= 0 && rowIndex < datasetState.currentRows.length) {
      setSelectedRowInfo({
        row: datasetState.currentRows[rowIndex],
        index: rowIndex,
      });
    }
  };

  const exec = datasetState?.lastExecution;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <Header
        datasetState={datasetState}
        onExport={handleExport}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loadError && datasetState && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-red-700 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="p-1 hover:bg-red-100 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick-Upload Multi-Sheet Excel Picker */}
        {pendingExcel && datasetState && (
          <div className="p-4 rounded-xl bg-white border border-blue-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-900">
              Select worksheet from {pendingExcel.filename}:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {pendingExcel.sheetNames.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handlePickQuickExcelSheet(s)}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-semibold cursor-pointer"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPendingExcel(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!datasetState ? (
          <DatasetUploader
            onLoadDataset={handleLoadDataset}
            onSelectSample={handleSelectSample}
            externalError={loadError}
          />
        ) : (
          <>
            {/* Workspace Context & History Toolbar */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs gap-3">
              <div className="flex flex-wrap items-center gap-2 text-slate-600 tabular-nums">
                <span className="font-semibold text-slate-900 text-sm">{datasetState.filename}</span>
                <span aria-hidden="true" className="text-slate-300">&middot;</span>
                <span>{datasetState.currentRows.length.toLocaleString()} rows</span>
                <span aria-hidden="true" className="text-slate-300">&middot;</span>
                <span>{datasetState.columns.length} columns</span>
                {activeProfile && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">&middot;</span>
                    <span className="font-semibold text-blue-700">
                      Quality {activeProfile.overallQualityScore}/100
                    </span>
                  </>
                )}
                {exec && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">&middot;</span>
                    <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                      {exec.mode === 'server_batch' ? (
                        <Server className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      <span>
                        {exec.mode === 'duckdb_wasm'
                          ? 'DuckDB-WASM'
                          : exec.mode === 'server_batch'
                          ? 'Server Batch'
                          : 'Local Engine'}
                      </span>
                      <span className="text-slate-400 font-mono">({exec.durationMs} ms)</span>
                    </span>
                  </>
                )}
                {isProcessing && processingLabel && (
                  <span className="text-blue-600 font-medium">{processingLabel}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  ref={quickUploadInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.json,text/csv,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleQuickFileUpload(file);
                  }}
                />

                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || isProcessing}
                  title="Undo last cleaning/edit step (Ctrl+Z)"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0 || isProcessing}
                  title="Redo step (Ctrl+Y)"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>Redo</span>
                </button>

                <button
                  id="reset-dataset-btn"
                  type="button"
                  onClick={handleReset}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={() => quickUploadInputRef.current?.click()}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Working...' : 'Upload File'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLoadError(null);
                    setDatasetState(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium cursor-pointer whitespace-nowrap"
                >
                  All Datasets
                </button>

                <button
                  type="button"
                  onClick={handleClearLocalSession}
                  title="Clear browser-local IndexedDB session & return to upload screen"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Session</span>
                </button>
              </div>
            </div>

            {activeTab === 'dashboard' && (
              <StatsOverview
                rows={datasetState.currentRows}
                schemas={datasetState.columns}
                profiles={datasetState.duckdbProfiles}
                baselineProfile={datasetState.baselineProfile}
                currentProfile={activeProfile ?? undefined}
              />
            )}

            {activeTab === 'table' && (
              <DataTable
                rows={datasetState.currentRows}
                schemas={datasetState.columns}
                executionMode={datasetState.lastExecution?.mode}
                onSelectRow={(row, idx) => setSelectedRowInfo({ row, index: idx })}
                onRevertCell={handleRevertCell}
                onOverrideCell={handleOverrideCell}
              />
            )}

            {activeTab === 'profiling' && activeProfile && (
              <ProfilingEDAPanel
                rows={datasetState.currentRows}
                schemas={datasetState.columns}
                policies={datasetState.policies}
                profile={activeProfile}
                onResolveDuplicates={handleResolveDuplicates}
                onExportPDF={() => handleExport('pdf_report')}
                onExportExcelWorkbook={() => handleExport('excel_report')}
                isProcessing={isProcessing}
              />
            )}

            {activeTab === 'analyst' && activeProfile && (
              <AiAnalystPanel
                rows={datasetState.currentRows}
                schemas={datasetState.columns}
                policies={datasetState.policies}
                baselineProfile={datasetState.baselineProfile}
                currentProfile={activeProfile}
                recommendations={datasetState.recommendations}
                logs={datasetState.cleanHistoryLogs}
                executionMode={datasetState.lastExecution?.mode}
                onApproveRecommendation={handleApproveRecommendation}
                onRejectRecommendation={handleRejectRecommendation}
                onApproveAllPending={handleApproveAllPending}
                onApplyApprovedRecommendations={handleApplyApprovedRecommendations}
                isProcessing={isProcessing}
              />
            )}

            {activeTab === 'policies' && (
              <ColumnPolicyMatrix
                schemas={datasetState.columns}
                rows={datasetState.currentRows}
                policies={datasetState.policies}
                profiles={datasetState.duckdbProfiles}
                currentQualityScore={activeProfile?.overallQualityScore ?? 100}
                activeContract={datasetState.activeContract}
                logs={datasetState.cleanHistoryLogs}
                onUpdatePolicy={handleUpdatePolicy}
                onBatchUpdatePolicies={handleBatchUpdatePolicies}
                onApplyContractPolicies={handleApplyContractPolicies}
                onApplyPipelineManifest={handleApplyPipelineManifest}
                onRunPolicyClean={() => handleRunPolicyClean()}
                onInspectRowByIndex={handleInspectRowByIndex}
                onRevertCell={handleRevertCell}
                isProcessing={isProcessing}
              />
            )}

            {activeTab === 'corrupt' && (
              <CorruptionPanel
                onCorrupt={handleCorrupt}
                onExport={handleExport}
                schemas={datasetState.columns}
                rowCount={datasetState.currentRows.length}
                colCount={datasetState.columns.length}
                isProcessing={isProcessing}
              />
            )}
          </>
        )}
      </main>

      {selectedRowInfo && datasetState && (
        <RowDetailModal
          row={selectedRowInfo.row}
          rowIndex={selectedRowInfo.index}
          schemas={datasetState.columns}
          originalRow={datasetState.originalRows[selectedRowInfo.index]}
          onClose={() => setSelectedRowInfo(null)}
          onUpdateCell={handleOverrideCell}
          onRevertCell={handleRevertCell}
        />
      )}
    </div>
  );
}
