import React, { useState } from 'react';
import { Zap, AlertTriangle, Flame, Sliders, Calendar, Type, HelpCircle, ArrowUpRight } from 'lucide-react';
import { CorruptionConfig } from '../types';

interface CorruptionPanelProps {
  onCorrupt: (config: CorruptionConfig) => void;
  rowCount: number;
  colCount: number;
}

export const CorruptionPanel: React.FC<CorruptionPanelProps> = ({
  onCorrupt,
  rowCount,
  colCount,
}) => {
  const [overallRate, setOverallRate] = useState<number>(0.2); // 20%
  const [enableMissing, setEnableMissing] = useState<boolean>(true);
  const [enableOutliers, setEnableOutliers] = useState<boolean>(true);
  const [enableDateFormats, setEnableDateFormats] = useState<boolean>(true);
  const [enableTypos, setEnableTypos] = useState<boolean>(true);
  const [outlierMultiplier, setOutlierMultiplier] = useState<number>(25);

  const totalCells = rowCount * colCount;
  const estimatedCorruptedCells = Math.round(totalCells * overallRate);

  const handleApply = () => {
    onCorrupt({
      overallRate,
      enableMissing,
      enableOutliers,
      enableDateFormats,
      enableTypos,
      outlierMultiplier,
    });
  };

  const setPreset = (rate: number) => {
    setOverallRate(rate);
    setEnableMissing(true);
    setEnableOutliers(true);
    setEnableDateFormats(true);
    setEnableTypos(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-200">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-800">Synthetic Data Corruption Generator</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Simulate dirty real-world data pipelines by introducing realistic synthetic anomalies into your dataset.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-500 font-medium">Presets:</span>
          <button
            onClick={() => setPreset(0.1)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              overallRate === 0.1
                ? 'bg-red-50 text-red-600 border-red-200 font-bold'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60'
            }`}
          >
            Mild (10%)
          </button>
          <button
            onClick={() => setPreset(0.25)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              overallRate === 0.25
                ? 'bg-red-50 text-red-600 border-red-200 font-bold'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60'
            }`}
          >
            Medium (25%)
          </button>
          <button
            onClick={() => setPreset(0.4)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              overallRate === 0.4
                ? 'bg-red-50 text-red-600 border-red-200 font-bold'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60'
            }`}
          >
            Extreme (40%)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Left Column: Intensity Controls */}
        <div className="space-y-5">
          <div>
            <div className="flex justify-between items-center text-sm font-semibold text-slate-700 mb-2">
              <label className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <span>Corruption Intensity Rate</span>
              </label>
              <span className="text-red-600 font-bold px-2 py-0.5 rounded bg-red-50 border border-red-200 text-xs">
                {Math.round(overallRate * 100)}% Cells
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.5"
              step="0.05"
              value={overallRate}
              onChange={(e) => setOverallRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>5% Light Noise</span>
              <span>Est. ~{estimatedCorruptedCells} bad cells ({rowCount} rows)</span>
              <span>50% Heavy Stress</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center text-sm font-semibold text-slate-700 mb-2">
              <label className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <span>Numeric Outlier Spike Severity</span>
              </label>
              <span className="text-orange-600 font-bold text-xs">{outlierMultiplier}x Spike</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={outlierMultiplier}
              onChange={(e) => setOutlierMultiplier(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Multiplies valid numeric metric values by up to {outlierMultiplier}x or injects negative & 6-digit spikes.
            </p>
          </div>
        </div>

        {/* Right Column: Toggleable Anomaly Types */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Active Anomaly Types
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {/* Missing Values */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${
                enableMissing
                  ? 'bg-amber-50/60 border-amber-300 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={enableMissing}
                onChange={(e) => setEnableMissing(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center space-x-1 text-slate-800">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Missing Values</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Replaces with NULL, empty, N/A, NaN
                </p>
              </div>
            </label>

            {/* Outlier Spikes */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${
                enableOutliers
                  ? 'bg-red-50/60 border-red-300 text-red-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={enableOutliers}
                onChange={(e) => setEnableOutliers(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center space-x-1 text-slate-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Outlier Spikes</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Extreme Z-scores, multipliers, negative values
                </p>
              </div>
            </label>

            {/* Inconsistent Dates */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${
                enableDateFormats
                  ? 'bg-blue-50/60 border-blue-300 text-blue-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={enableDateFormats}
                onChange={(e) => setEnableDateFormats(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center space-x-1 text-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Inconsistent Dates</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mixes MM/DD/YYYY, DD-MMM-YYYY, Timestamps
                </p>
              </div>
            </label>

            {/* Spelling Typos */}
            <label
              className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start space-x-2.5 ${
                enableTypos
                  ? 'bg-purple-50/60 border-purple-300 text-purple-900'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={enableTypos}
                onChange={(e) => setEnableTypos(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <div>
                <div className="text-xs font-bold flex items-center space-x-1 text-slate-800">
                  <Type className="w-3.5 h-3.5 text-purple-600" />
                  <span>Spelling Typos</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Letter swaps, drops, casing permutations
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Trigger Button */}
      <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Ready to inject synthetic corruption into <strong className="text-slate-800">{rowCount} rows</strong> ({colCount} columns)
        </div>

        <button
          id="corrupt-data-btn"
          onClick={handleApply}
          className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-200 flex items-center space-x-2 transition-all cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-white" />
          <span>Corrupt Data Now</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
