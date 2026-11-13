import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Edit3, Save, RotateCcw, History } from 'lucide-react';
import { ColumnSchema, RowData } from '../types';

interface RowDetailModalProps {
  row: RowData;
  rowIndex: number;
  schemas: ColumnSchema[];
  originalRow?: Record<string, any>;
  onClose: () => void;
  onUpdateCell: (rowIndex: number, colName: string, newValue: any) => void;
  onRevertCell: (rowIndex: number, colName: string) => void;
}

export const RowDetailModal: React.FC<RowDetailModalProps> = ({
  row,
  rowIndex,
  schemas,
  originalRow,
  onClose,
  onUpdateCell,
  onRevertCell,
}) => {
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const score = row.anomalyInfo?.totalScore || 0;
  const cellAnomalies = row.anomalyInfo?.cellAnomalies || {};

  const handleStartEdit = (colName: string, currentVal: any) => {
    setEditingCol(colName);
    setEditValue(currentVal === null || currentVal === undefined ? '' : String(currentVal));
  };

  const handleSaveEdit = (colName: string) => {
    onUpdateCell(rowIndex, colName, editValue);
    setEditingCol(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-5xl w-full shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-blue-700 tabular-nums">
              Row #{rowIndex + 1}
            </span>
            <span className="text-slate-300">&middot;</span>
            <h3 className="font-bold text-slate-900 text-base">Cell Lineage &amp; Anomaly Inspector</h3>
            <span className="text-slate-300">&middot;</span>
            <span
              className={`text-xs font-semibold tabular-nums ${
                score > 60 ? 'text-red-700' : score > 30 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              Anomaly Score: {score}/100
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-500">
            Inspect ground-truth baseline, statistical detection rule, confidence score, and full transformation lineage per cell. Revert any auto-cleaned cell or manually override its value.
          </p>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">Column</th>
                  <th className="p-3">Original Value</th>
                  <th className="p-3">Current Value</th>
                  <th className="p-3">Rule / Lineage</th>
                  <th className="p-3 text-right">Confidence</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {schemas.map((col) => {
                  const currentVal = row.data[col.name];
                  const origVal = originalRow ? originalRow[col.name] : undefined;
                  const cellInfo = cellAnomalies[col.name];
                  const lineage = row.cellLineage?.[col.name] || [];
                  const latestLineage = lineage[lineage.length - 1];
                  const isEditing = editingCol === col.name;

                  return (
                    <tr key={col.name} className="hover:bg-slate-50/70">
                      <td className="p-3 align-top">
                        <div className="font-semibold text-slate-900">{col.name}</div>
                        <div className="text-[11px] text-slate-400">{col.type}</div>
                      </td>

                      <td className="p-3 font-mono text-emerald-700 bg-slate-50/40 align-top">
                        {origVal !== undefined ? String(origVal) : 'N/A'}
                      </td>

                      <td className="p-3 font-mono text-slate-900 align-top">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="bg-white border border-blue-500 text-slate-900 rounded px-2 py-1 text-xs font-mono focus:outline-none w-32"
                            />
                            <button
                              onClick={() => handleSaveEdit(col.name)}
                              className="p-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={
                              cellInfo?.isAnomaly
                                ? 'text-amber-700 font-bold'
                                : latestLineage
                                ? 'text-blue-700 font-semibold'
                                : 'text-slate-800'
                            }
                          >
                            {currentVal === null || currentVal === undefined || currentVal === ''
                              ? 'NULL'
                              : String(currentVal)}
                          </span>
                        )}
                      </td>

                      <td className="p-3 align-top space-y-1">
                        {cellInfo?.isAnomaly ? (
                          <div className="flex items-start gap-1.5 font-medium text-red-600">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <div>
                              <div>{cellInfo.detectionRule || 'Anomaly Detected'}</div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                {cellInfo.reason}
                              </div>
                              {cellInfo.aiExplanation && (
                                <div className="text-[11px] text-slate-600 font-normal mt-0.5">
                                  {cellInfo.aiExplanation}
                                </div>
                              )}
                              {cellInfo.suggestedFix !== undefined && (
                                <div className="text-[11px] font-mono text-blue-700 mt-0.5">
                                  Suggested: {String(cellInfo.suggestedFix)}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : latestLineage ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 font-medium text-emerald-700">
                              <History className="w-3.5 h-3.5 shrink-0" />
                              <span>{latestLineage.actionTaken}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Rule: {latestLineage.detectionRule} &middot; Before:{' '}
                              <span className="font-mono">{latestLineage.beforeValue}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Valid / Clean</span>
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right font-mono tabular-nums align-top">
                        {latestLineage ? (
                          <span className="font-semibold text-blue-700">
                            {latestLineage.confidenceScore}%
                          </span>
                        ) : cellInfo?.isAnomaly && cellInfo.confidenceScore ? (
                          <span className="text-slate-600">{cellInfo.confidenceScore}%</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center align-top">
                        {!isEditing && (
                          <div className="inline-flex items-center gap-1">
                            {(lineage.length > 0 || row.corruptedMeta?.[col.name]) && (
                              <button
                                onClick={() => onRevertCell(rowIndex, col.name)}
                                className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                                title="Revert cell to pre-clean / original value"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStartEdit(col.name, currentVal)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
                              title="Manually override value"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
