import React, { useState } from 'react';
import {
  Zap,
  AlertTriangle,
  Flame,
  Calendar,
  Type,
  HelpCircle,
  ArrowUpRight,
  Target,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  GitBranch,
} from 'lucide-react';
import { ColumnSchema, CorruptionConfig, NoiseProfileId } from '../types';
import type { ExportFormatOption } from './Header';

interface CorruptionPanelProps {
  onCorrupt: (config: CorruptionConfig) => void;
  onExport?: (format: ExportFormatOption) => void;
  schemas: ColumnSchema[];
  rowCount: number;
  colCount: number;
  isProcessing: boolean;
}

const NOISE_PROFILES: {
  id: Exclude<NoiseProfileId, 'custom'>;
  name: string;
  description: string;
  config: Partial<CorruptionConfig>;
}[] = [
  {
    id: 'iot_drift',
    name: 'IoT Sensor Drift',
    description: 'MAR dropout clusters paired with high-magnitude telemetry spikes.',
    config: {
      enableMissing: true,
      missingnessAlgorithm: 'mar',
      missingRate: 0.18,
      enableOutliers: true,
      outlierRate: 0.15,
      outlierMultiplier: 40,
      injectNegativeShocks: true,
      enableDateFormats: true,
      dateMixRate: 0.1,
      enableTypos: false,
      typoRate: 0,
    },
  },
  {
    id: 'manual_entry',
    name: 'Manual Entry Pollution',
    description: 'QWERTY keyboard typos, stray whitespace, and mixed EU/US dates.',
    config: {
      enableMissing: true,
      missingnessAlgorithm: 'mcar',
      missingRate: 0.1,
      enableOutliers: false,
      outlierRate: 0,
      outlierMultiplier: 15,
      injectNegativeShocks: false,
      enableDateFormats: true,
      dateMixRate: 0.45,
      enableTypos: true,
      typoRate: 0.35,
      injectKeyboardTypos: true,
      injectWhitespace: true,
    },
  },
  {
    id: 'financial_shock',
    name: 'Financial Black Swan',
    description: 'Severe 60x economic spikes, negative reversals, and MCAR drops.',
    config: {
      enableMissing: true,
      missingnessAlgorithm: 'mcar',
      missingRate: 0.12,
      enableOutliers: true,
      outlierRate: 0.22,
      outlierMultiplier: 65,
      injectNegativeShocks: true,
      enableDateFormats: true,
      dateMixRate: 0.2,
      enableTypos: true,
      typoRate: 0.12,
    },
  },
  {
    id: 'schema_break',
    name: 'Pipeline Schema Break',
    description: 'Heavy multi-vector corruption across 40% of incoming batch cells.',
    config: {
      enableMissing: true,
      missingnessAlgorithm: 'mar',
      missingRate: 0.3,
      enableOutliers: true,
      outlierRate: 0.25,
      outlierMultiplier: 50,
      injectNegativeShocks: true,
      enableDateFormats: true,
      dateMixRate: 0.6,
      enableTypos: true,
      typoRate: 0.35,
      injectKeyboardTypos: true,
      injectWhitespace: true,
    },
  },
];

export const CorruptionPanel: React.FC<CorruptionPanelProps> = ({
  onCorrupt,
  onExport,
  schemas,
  rowCount,
  colCount,
  isProcessing,
}) => {
  const [profileName, setProfileName] = useState<NoiseProfileId>('manual_entry');
  const [enableMissing, setEnableMissing] = useState<boolean>(true);
  const [missingnessAlgorithm, setMissingnessAlgorithm] = useState<'mcar' | 'mar'>('mcar');
  const [missingRate, setMissingRate] = useState<number>(0.15);
  const [missingPlaceholders, setMissingPlaceholders] = useState<string[]>([
    '',
    'N/A',
    'NaN',
    'NULL',
  ]);

  const [enableOutliers, setEnableOutliers] = useState<boolean>(true);
  const [outlierRate, setOutlierRate] = useState<number>(0.15);
  const [outlierMultiplier, setOutlierMultiplier] = useState<number>(25);
  const [injectNegativeShocks, setInjectNegativeShocks] = useState<boolean>(true);

  const [enableDateFormats, setEnableDateFormats] = useState<boolean>(true);
  const [dateMixRate, setDateMixRate] = useState<number>(0.35);

  const [enableTypos, setEnableTypos] = useState<boolean>(true);
  const [typoRate, setTypoRate] = useState<number>(0.25);
  const [injectKeyboardTypos, setInjectKeyboardTypos] = useState<boolean>(true);
  const [injectWhitespace, setInjectWhitespace] = useState<boolean>(true);

  const [targetColumns, setTargetColumns] = useState<string[]>([]);

  const applyProfile = (profile: (typeof NOISE_PROFILES)[number]) => {
    setProfileName(profile.id);
    const c = profile.config;
    if (c.enableMissing !== undefined) setEnableMissing(c.enableMissing);
    if (c.missingnessAlgorithm) setMissingnessAlgorithm(c.missingnessAlgorithm);
    if (c.missingRate !== undefined) setMissingRate(c.missingRate);
    if (c.enableOutliers !== undefined) setEnableOutliers(c.enableOutliers);
    if (c.outlierRate !== undefined) setOutlierRate(c.outlierRate);
    if (c.outlierMultiplier !== undefined) setOutlierMultiplier(c.outlierMultiplier);
    if (c.injectNegativeShocks !== undefined) setInjectNegativeShocks(c.injectNegativeShocks);
    if (c.enableDateFormats !== undefined) setEnableDateFormats(c.enableDateFormats);
    if (c.dateMixRate !== undefined) setDateMixRate(c.dateMixRate);
    if (c.enableTypos !== undefined) setEnableTypos(c.enableTypos);
    if (c.typoRate !== undefined) setTypoRate(c.typoRate);
    if (c.injectKeyboardTypos !== undefined) setInjectKeyboardTypos(c.injectKeyboardTypos);
    if (c.injectWhitespace !== undefined) setInjectWhitespace(c.injectWhitespace);
  };

  const togglePlaceholder = (token: string) => {
    setProfileName('custom');
    setMissingPlaceholders((prev) =>
      prev.includes(token)
        ? prev.length > 1
          ? prev.filter((t) => t !== token)
          : prev
        : [...prev, token]
    );
  };

  const toggleTargetColumn = (colName: string) => {
    setTargetColumns((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  const effectiveRate =
    ((enableMissing ? missingRate : 0) +
      (enableOutliers ? outlierRate * 0.4 : 0) +
      (enableDateFormats ? dateMixRate * 0.25 : 0) +
      (enableTypos ? typoRate * 0.35 : 0)) /
    Math.max(1, 1);

  const activeColCount = targetColumns.length > 0 ? targetColumns.length : colCount;
  const estimatedCells = Math.round(rowCount * activeColCount * Math.min(0.65, effectiveRate));

  const handleApply = () => {
    onCorrupt({
      profileName,
      overallRate: Math.min(0.5, effectiveRate),
      enableMissing,
      missingnessAlgorithm,
      missingRate,
      missingPlaceholders,
      enableOutliers,
      outlierRate,
      outlierMultiplier,
      injectNegativeShocks,
      enableDateFormats,
      dateMixRate,
      enableTypos,
      typoRate,
      injectWhitespace,
      injectKeyboardTypos,
      targetColumns,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Noise Injection Profiles */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Controlled Noise &amp; Stress-Testing Suite
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Simulate MLOps data drift and pipeline failures using MCAR/MAR missingness, QWERTY keyboard typos, mixed date formats, and outlier shocks.
            </p>
          </div>
        </div>

        {/* Stress-Test Profiles */}
        <div>
          <div className="text-xs font-semibold text-slate-700 mb-2.5">
            Controlled Noise Injection Profiles
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {NOISE_PROFILES.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => applyProfile(p)}
                className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  profileName === p.id
                    ? 'border-red-400 bg-red-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-900">{p.name}</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{p.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Vector Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vector 1: Missingness Injection */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={enableMissing}
                onChange={(e) => {
                  setEnableMissing(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Missingness Injection</span>
            </label>
            <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
              {Math.round(missingRate * 100)}% rate
            </span>
          </div>

          <input
            type="range"
            min="0.02"
            max="0.5"
            step="0.02"
            disabled={!enableMissing}
            value={missingRate}
            onChange={(e) => {
              setMissingRate(parseFloat(e.target.value));
              setProfileName('custom');
            }}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 disabled:opacity-40"
          />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="block text-slate-500 mb-1">Sampling Algorithm</span>
              <select
                value={missingnessAlgorithm}
                disabled={!enableMissing}
                onChange={(e) => {
                  setMissingnessAlgorithm(e.target.value as 'mcar' | 'mar');
                  setProfileName('custom');
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
              >
                <option value="mcar">MCAR (Uniform Random)</option>
                <option value="mar">MAR (Clustered Dropout)</option>
              </select>
            </div>
            <div>
              <span className="block text-slate-500 mb-1">Injected Null Tokens</span>
              <div className="flex flex-wrap gap-1.5">
                {['NULL', 'NaN', 'N/A', ''].map((tok) => {
                  const label = tok === '' ? 'Empty' : tok;
                  const active = missingPlaceholders.includes(tok);
                  return (
                    <button
                      type="button"
                      key={label}
                      disabled={!enableMissing}
                      onClick={() => togglePlaceholder(tok)}
                      className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                        active
                          ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Vector 2: Outlier Spikes */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={enableOutliers}
                onChange={(e) => {
                  setEnableOutliers(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Outlier Spikes &amp; Shocks</span>
            </label>
            <span className="font-mono text-xs font-semibold text-red-700 tabular-nums">
              {Math.round(outlierRate * 100)}% rate &middot; {outlierMultiplier}x
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                <span>Spike Frequency</span>
                <span className="tabular-nums">{Math.round(outlierRate * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.5"
                step="0.02"
                disabled={!enableOutliers}
                value={outlierRate}
                onChange={(e) => {
                  setOutlierRate(parseFloat(e.target.value));
                  setProfileName('custom');
                }}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 disabled:opacity-40"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                <span className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span>Magnitude Multiplier</span>
                </span>
                <span className="tabular-nums">{outlierMultiplier}x</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                disabled={!enableOutliers}
                value={outlierMultiplier}
                onChange={(e) => {
                  setOutlierMultiplier(parseInt(e.target.value));
                  setProfileName('custom');
                }}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-40"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!enableOutliers}
              checked={injectNegativeShocks}
              onChange={(e) => {
                setInjectNegativeShocks(e.target.checked);
                setProfileName('custom');
              }}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span>Inject negative sign reversals &amp; sensor underflows</span>
          </label>
        </div>

        {/* Vector 3: Typo & Formatting Pollution */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTypos}
                onChange={(e) => {
                  setEnableTypos(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <Type className="w-4 h-4 text-purple-600" />
              <span>Typo &amp; Whitespace Pollution</span>
            </label>
            <span className="font-mono text-xs font-semibold text-purple-700 tabular-nums">
              {Math.round(typoRate * 100)}% rate
            </span>
          </div>

          <input
            type="range"
            min="0.02"
            max="0.5"
            step="0.02"
            disabled={!enableTypos}
            value={typoRate}
            onChange={(e) => {
              setTypoRate(parseFloat(e.target.value));
              setProfileName('custom');
            }}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 disabled:opacity-40"
          />

          <div className="flex flex-col gap-2 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!enableTypos}
                checked={injectKeyboardTypos}
                onChange={(e) => {
                  setInjectKeyboardTypos(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span>QWERTY keyboard-adjacency character swaps</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!enableTypos}
                checked={injectWhitespace}
                onChange={(e) => {
                  setInjectWhitespace(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span>Stray leading, trailing, and double whitespace</span>
            </label>
          </div>
        </div>

        {/* Vector 4: Date Format Drift & Target Column Scope */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-sm text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={enableDateFormats}
                onChange={(e) => {
                  setEnableDateFormats(e.target.checked);
                  setProfileName('custom');
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Mixed Date Format Drift</span>
            </label>
            <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
              {Math.round(dateMixRate * 100)}% rate
            </span>
          </div>

          <input
            type="range"
            min="0.05"
            max="0.8"
            step="0.05"
            disabled={!enableDateFormats}
            value={dateMixRate}
            onChange={(e) => {
              setDateMixRate(parseFloat(e.target.value));
              setProfileName('custom');
            }}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-40"
          />

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-slate-500" />
                <span>Target Columns Scope</span>
              </span>
              <button
                type="button"
                onClick={() => setTargetColumns([])}
                className="text-[11px] text-blue-600 hover:underline cursor-pointer"
              >
                {targetColumns.length === 0 ? 'All columns selected' : 'Reset to all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {schemas.map((col) => {
                const selected = targetColumns.includes(col.name);
                return (
                  <button
                    type="button"
                    key={col.name}
                    onClick={() => toggleTargetColumn(col.name)}
                    className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer transition-colors ${
                      selected
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {col.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Trigger Footer */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-slate-600 tabular-nums">
          Estimated impact: ~<strong className="text-slate-900">{estimatedCells.toLocaleString()}</strong>{' '}
          cells perturbed across <strong className="text-slate-900">{rowCount.toLocaleString()}</strong>{' '}
          rows ({activeColCount} target columns)
        </div>

        <button
          id="corrupt-data-btn"
          onClick={handleApply}
          disabled={isProcessing}
          className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <Zap className="w-4 h-4" />
          <span>{isProcessing ? 'Injecting Noise...' : 'Run Stress Test'}</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* Export & Reporting Hub */}
      {onExport && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Export Cleaned Data, Analytical Reports &amp; Pipelines
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Download sanitized datasets, comprehensive PDF quality reports, multi-sheet Excel audit workbooks, or reusable JSON cleaning pipelines.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <button
              type="button"
              onClick={() => onExport('csv')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">Cleaned CSV (.csv)</div>
                <div className="text-[11px] text-slate-500">Standard UTF-8 tabular export</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onExport('xlsx')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">Cleaned Excel (.xlsx)</div>
                <div className="text-[11px] text-slate-500">Ready-to-open spreadsheet</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onExport('json')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <FileJson className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">Structured JSON (.json)</div>
                <div className="text-[11px] text-slate-500">Array of record objects</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onExport('pdf_report')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-red-400 bg-slate-50/50 hover:bg-red-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <FileText className="w-4 h-4 text-red-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">PDF Quality Report (.pdf)</div>
                <div className="text-[11px] text-slate-500">Executive scores, stats &amp; insights</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onExport('excel_report')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">Excel Audit Workbook</div>
                <div className="text-[11px] text-slate-500">Data, Stats, Insights &amp; Audit tabs</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onExport('pipeline_json')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-purple-400 bg-slate-50/50 hover:bg-purple-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors"
            >
              <GitBranch className="w-4 h-4 text-purple-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-900">Cleaning Pipeline (.json)</div>
                <div className="text-[11px] text-slate-500">Replayable rule manifest</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
