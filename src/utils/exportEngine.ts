import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  CleaningPipelineManifest,
  ColumnProfileReport,
  DatasetProfileReport,
  DatasetState,
} from '../types.ts';

function stripExtension(filename: string): string {
  return filename.replace(/\.(csv|tsv|txt|xlsx|xls|json)$/i, '');
}

function triggerBlobDownload(blob: Blob, downloadName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', downloadName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCleanedCSV(state: DatasetState): void {
  if (!state || state.currentRows.length === 0) return;
  const exportData = state.currentRows.map((r) => r.data);
  const csvStr = Papa.unparse(exportData);
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `cleaned_${stripExtension(state.filename)}.csv`);
}

export function exportCleanedJSON(state: DatasetState): void {
  if (!state || state.currentRows.length === 0) return;
  const exportData = state.currentRows.map((r) => r.data);
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  triggerBlobDownload(blob, `cleaned_${stripExtension(state.filename)}.json`);
}

export function exportCleanedExcel(state: DatasetState): void {
  if (!state || state.currentRows.length === 0) return;
  const exportData = state.currentRows.map((r) => r.data);
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Data');
  XLSX.writeFile(wb, `cleaned_${stripExtension(state.filename)}.xlsx`);
}

export function exportMultiSheetExcelReport(
  state: DatasetState,
  profile: DatasetProfileReport
): void {
  if (!state || state.currentRows.length === 0) return;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Cleaned Data
  const dataSheet = XLSX.utils.json_to_sheet(state.currentRows.map((r) => r.data));
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Cleaned Data');

  // Sheet 2: Column Quality & Stats
  const colProfiles: ColumnProfileReport[] = Object.values(profile.columnProfiles);
  const profileRows = colProfiles.map((cp) => ({
    Column: cp.columnName,
    Semantic_Role: cp.semanticRole,
    Detected_Type: cp.detectedType,
    Quality_Score: cp.qualityScore,
    Missing_Count: cp.missingCount,
    Missing_Pct: `${cp.missingPct}%`,
    Unique_Values: cp.uniqueCount,
    Mean: cp.mean ?? '',
    Median: cp.median ?? '',
    Mode: cp.mode ?? '',
    StdDev: cp.stdDev ?? '',
    MAD: cp.mad ?? '',
    Min: cp.min ?? '',
    Max: cp.max ?? '',
    Anomalies: cp.anomalyCount,
    Consistency_Issues: cp.consistencyIssues.join('; '),
  }));
  const profileSheet = XLSX.utils.json_to_sheet(profileRows);
  XLSX.utils.book_append_sheet(wb, profileSheet, 'Column Quality & Stats');

  // Sheet 3: Correlations & Insights
  const insightRows: Record<string, any>[] = [
    { Category: 'Overall Quality Score', Detail: `${profile.overallQualityScore}/100` },
    { Category: 'Completeness Score', Detail: `${profile.completenessScore}/100` },
    { Category: 'Validity Score', Detail: `${profile.validityScore}/100` },
    { Category: 'Uniqueness Score', Detail: `${profile.uniquenessScore}/100` },
    { Category: 'Consistency Score', Detail: `${profile.consistencyScore}/100` },
    { Category: 'Exact Duplicate Rows', Detail: profile.exactDuplicateRowCount },
    ...profile.businessInsights.map((ins, i) => ({
      Category: `Insight #${i + 1}`,
      Detail: ins,
    })),
    ...profile.correlations.strongPairs.map((pair) => ({
      Category: `Correlation (${pair.strength})`,
      Detail: `${pair.colA} vs ${pair.colB}: r = ${pair.r}`,
    })),
  ];
  const insightsSheet = XLSX.utils.json_to_sheet(insightRows);
  XLSX.utils.book_append_sheet(wb, insightsSheet, 'Correlations & Insights');

  // Sheet 4: Audit Log
  const auditRows = state.cleanHistoryLogs.slice(0, 5000).map((log) => ({
    Row_Index: log.rowIndex,
    Column: log.column,
    Type: log.type,
    Actor: log.actor,
    Original_Value: String(log.originalValue),
    Before_Value: String(log.beforeValue),
    After_Value: String(log.afterValue),
    Detection_Rule: log.detectionRule,
    Action_Taken: log.methodUsed,
    Confidence_Pct: log.confidenceScore,
    Timestamp: log.timestamp,
  }));
  const auditSheet = XLSX.utils.json_to_sheet(
    auditRows.length > 0 ? auditRows : [{ Note: 'No cell transformations logged yet.' }]
  );
  XLSX.utils.book_append_sheet(wb, auditSheet, 'Audit Log');

  XLSX.writeFile(wb, `datarefine_report_${stripExtension(state.filename)}.xlsx`);
}

export function exportPDFAnalyticalReport(
  state: DatasetState,
  profile: DatasetProfileReport,
  narrative: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('DataRefine Analytical & Data Quality Report', 40, 34);
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Dataset: ${state.filename}  |  Rows: ${profile.rowCount.toLocaleString()}  |  Cols: ${profile.columnCount}  |  Generated: ${new Date().toLocaleDateString()}`,
    40,
    54
  );

  // Executive Quality Summary
  let yPos = 96;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text('1. Executive Quality Summary', 40, yPos);
  yPos += 14;

  const base = state.baselineProfile;
  const summaryRows = [
    [
      'Overall Quality Score',
      base ? `${base.overallQualityScore}/100` : '-',
      `${profile.overallQualityScore}/100`,
      base ? `${profile.overallQualityScore - base.overallQualityScore >= 0 ? '+' : ''}${profile.overallQualityScore - base.overallQualityScore} pts` : '-',
    ],
    [
      'Completeness',
      base ? `${base.completenessScore}%` : '-',
      `${profile.completenessScore}%`,
      base ? `${profile.completenessScore - base.completenessScore >= 0 ? '+' : ''}${profile.completenessScore - base.completenessScore}%` : '-',
    ],
    [
      'Validity',
      base ? `${base.validityScore}%` : '-',
      `${profile.validityScore}%`,
      base ? `${profile.validityScore - base.validityScore >= 0 ? '+' : ''}${profile.validityScore - base.validityScore}%` : '-',
    ],
    [
      'Uniqueness',
      base ? `${base.uniquenessScore}%` : '-',
      `${profile.uniquenessScore}%`,
      base ? `${profile.uniquenessScore - base.uniquenessScore >= 0 ? '+' : ''}${profile.uniquenessScore - base.uniquenessScore}%` : '-',
    ],
    [
      'Exact Duplicate Rows',
      base ? String(base.exactDuplicateRowCount) : '-',
      String(profile.exactDuplicateRowCount),
      base ? String(profile.exactDuplicateRowCount - base.exactDuplicateRowCount) : '-',
    ],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Dimension', 'Baseline', 'Current', 'Net Delta']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 5 },
    margin: { left: 40, right: 40 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  // Cleaning Summary Narrative
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Transformation Summary', 40, yPos);
  yPos += 14;
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const splitNarrative = doc.splitTextToSize(narrative, pageWidth - 80);
  doc.text(splitNarrative, 40, yPos);
  yPos += splitNarrative.length * 13 + 14;

  // Column Profile Table
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Column-Level Statistics & Quality', 40, yPos);
  yPos += 10;

  const colProfiles: ColumnProfileReport[] = Object.values(profile.columnProfiles);
  const colTableRows = colProfiles.map((cp) => [
    cp.columnName,
    cp.detectedType,
    `${cp.qualityScore}/100`,
    `${cp.missingPct}% (${cp.missingCount})`,
    String(cp.uniqueCount),
    cp.mean !== null ? `${cp.mean} / ${cp.median}` : String(cp.mode ?? '-'),
    String(cp.anomalyCount),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Column', 'Type', 'Quality', 'Missing', 'Unique', 'Mean/Med or Mode', 'Anomalies']],
    body: colTableRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4 },
    margin: { left: 40, right: 40 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 22;
  if (yPos > 720) {
    doc.addPage();
    yPos = 45;
  }

  // Automated Business Insights
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Automated EDA & Business Insights', 40, yPos);
  yPos += 14;
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  profile.businessInsights.forEach((ins) => {
    const lines = doc.splitTextToSize(`• ${ins}`, pageWidth - 80);
    if (yPos + lines.length * 12 > 790) {
      doc.addPage();
      yPos = 45;
    }
    doc.text(lines, 40, yPos);
    yPos += lines.length * 12 + 4;
  });

  // Correlations if present
  if (profile.correlations.strongPairs.length > 0) {
    if (yPos > 700) {
      doc.addPage();
      yPos = 45;
    }
    yPos += 10;
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('5. Notable Numeric Correlations', 40, yPos);
    yPos += 10;
    autoTable(doc, {
      startY: yPos,
      head: [['Column A', 'Column B', 'Pearson r', 'Relationship']],
      body: profile.correlations.strongPairs.map((p) => [p.colA, p.colB, String(p.r), p.strength]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 4 },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(`datarefine_analytical_report_${stripExtension(state.filename)}.pdf`);
}

export function exportCleaningPipelineJSON(manifest: CleaningPipelineManifest): void {
  const json = JSON.stringify(manifest, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerBlobDownload(blob, `${manifest.pipelineName}-v${manifest.version}.pipeline.json`);
}

export function parseCleaningPipelineJSON(rawText: string): CleaningPipelineManifest {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object' || !parsed.policies || typeof parsed.policies !== 'object') {
    throw new Error('Invalid Cleaning Pipeline JSON: missing "policies" definition.');
  }
  return parsed as CleaningPipelineManifest;
}
