import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, Sparkles, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';
import { SampleDataset } from '../types';
import { SAMPLE_DATASETS } from '../utils/sampleData';

interface DatasetUploaderProps {
  onLoadDataset: (filename: string, rawRows: Record<string, any>[]) => void;
  onSelectSample: (sample: SampleDataset) => void;
}

export const DatasetUploader: React.FC<DatasetUploaderProps> = ({
  onLoadDataset,
  onSelectSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      setErrorMsg('Please upload a valid .csv file');
      return;
    }
    setErrorMsg(null);

    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setErrorMsg(`Error parsing CSV: ${results.errors[0].message}`);
          return;
        }
        if (results.data.length === 0) {
          setErrorMsg('The CSV file appears to be empty');
          return;
        }
        onLoadDataset(file.name, results.data);
      },
      error: (err) => {
        setErrorMsg(`Failed to read file: ${err.message}`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Interactive Data Hygiene Engine</span>
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight sm:text-4xl">
          Clean CSVs In, Synthetic Corruption & Auto-Clean Out
        </h2>
        <p className="mt-3 text-base text-slate-500 max-w-2xl mx-auto">
          Upload any clean dataset to inject controlled synthetic noise (missing values, numerical outliers, inconsistent dates, typos), visualize row anomaly scores, and perform statistical auto-cleaning.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center space-x-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload Drag & Drop Zone */}
      <div
        id="csv-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
            : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/50 shadow-sm'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
          <Upload className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-bold text-slate-800">
          Drop your clean CSV file here
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          or <span className="text-blue-600 underline font-medium">browse from your computer</span>
        </p>
        <p className="text-xs text-slate-400 mt-3">
          Supports standard comma-separated files (up to 5,000 rows recommended for instant real-time interaction).
        </p>
      </div>

      {/* Preset Clean Sample Datasets */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Or try one of our pre-built clean sample datasets
          </h3>
          <span className="text-xs text-slate-400">1-click instant load</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SAMPLE_DATASETS.map((sample) => (
            <div
              key={sample.id}
              id={`sample-dataset-${sample.id}`}
              onClick={() => onSelectSample(sample)}
              className="group p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md cursor-pointer transition-all relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  {sample.category}
                </span>
                <span className="text-xs text-slate-400">{sample.rowCount} Rows</span>
              </div>

              <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                {sample.name}
              </h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {sample.description}
              </p>

              <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 group-hover:translate-x-1 transition-transform">
                <span>Load Dataset</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
