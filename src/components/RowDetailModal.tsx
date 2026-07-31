import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Edit3, Save, Sparkles, HelpCircle, Calendar, Type } from 'lucide-react';
import { ColumnSchema, RowData } from '../types';

interface RowDetailModalProps {
  row: RowData;
  rowIndex: number;
  schemas: ColumnSchema[];
  originalRow?: Record<string, any>;
  onClose: () => void;
  onUpdateCell: (rowIndex: number, colName: string, newValue: any) => void;
}

export const RowDetailModal: React.FC<RowDetailModalProps> = ({
  row,
  rowIndex,
  schemas,
  originalRow,
  onClose,
  onUpdateCell,
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
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-sm px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-200">
              Row #{rowIndex + 1}
            </span>

            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-800 text-base">Detailed Cell Anomaly Inspector</h3>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  score > 60
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : score > 30
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                Anomaly Score: {score}/100
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Cell Comparison Matrix */}
        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-500">
            Compare values cell-by-cell between original ground truth, corrupted state, statistical anomaly reason, and suggested auto-clean fix.
          </p>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Column</th>
                  <th className="p-3">Original Clean Value</th>
                  <th className="p-3">Current Cell Value</th>
                  <th className="p-3">Detected Anomaly & Reason</th>
                  <th className="p-3">Suggested Imputation</th>
                  <th className="p-3 text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {schemas.map((col) => {
                  const currentVal = row.data[col.name];
                  const origVal = originalRow ? originalRow[col.name] : undefined;
                  const cellInfo = cellAnomalies[col.name];
                  const isEditing = editingCol === col.name;

                  return (
                    <tr key={col.name} className="hover:bg-slate-50">
                      {/* Col Name & Type */}
                      <td className="p-3 font-bold text-slate-800">
                        <div>{col.name}</div>
                        <div className="text-[10px] text-slate-400 font-normal uppercase">{col.type}</div>
                      </td>

                      {/* Original Clean Ground Truth */}
                      <td className="p-3 font-mono text-emerald-700 bg-slate-50/50">
                        {origVal !== undefined ? String(origVal) : 'N/A'}
                      </td>

                      {/* Current Corrupted Value */}
                      <td className="p-3 font-mono text-slate-800">
                        {isEditing ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="bg-white border border-blue-500 text-slate-800 rounded px-2 py-1 text-xs font-mono focus:outline-none"
                            />
                            <button
                              onClick={() => handleSaveEdit(col.name)}
                              className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className={cellInfo?.isAnomaly ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                            {currentVal === null || currentVal === undefined ? 'NULL' : String(currentVal)}
                          </span>
                        )}
                      </td>

                      {/* Detected Anomaly Reason */}
                      <td className="p-3 text-slate-700">
                        {cellInfo?.isAnomaly ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1 font-semibold text-red-600">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{cellInfo.reason}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 flex items-center space-x-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Valid / Clean</span>
                          </span>
                        )}
                      </td>

                      {/* Suggested Fix */}
                      <td className="p-3 font-mono text-blue-700">
                        {cellInfo?.suggestedFix !== undefined ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-bold">
                            {String(cellInfo.suggestedFix)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Edit Button */}
                      <td className="p-3 text-center">
                        {!isEditing && (
                          <button
                            onClick={() => handleStartEdit(col.name, currentVal)}
                            className="p-1.5 rounded bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Manually override value"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
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
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
