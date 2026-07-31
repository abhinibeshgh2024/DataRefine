export type ColumnType = 'numeric' | 'date' | 'categorical' | 'text' | 'id';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  sampleValues: (string | number)[];
  distinctCount: number;
}

export type CorruptionType = 'missing' | 'outlier' | 'date_format' | 'typo';

export interface CorruptionConfig {
  overallRate: number; // 0.0 to 0.5 (e.g., 0.15 = 15% cells corrupted)
  enableMissing: boolean;
  enableOutliers: boolean;
  enableDateFormats: boolean;
  enableTypos: boolean;
  outlierMultiplier: number; // e.g. 10x to 100x
}

export interface CellCorruptionMeta {
  isCorrupted: boolean;
  types: CorruptionType[];
  originalValue: any;
}

export interface CellAnomalyInfo {
  isAnomaly: boolean;
  types: CorruptionType[];
  score: number; // 0 to 100 for cell
  reason?: string;
  suggestedFix?: any;
}

export interface RowData {
  _id: string; // unique row id
  data: Record<string, any>; // column key -> value
  corruptedMeta?: Record<string, CellCorruptionMeta>; // column key -> meta
  anomalyInfo?: {
    totalScore: number; // 0 to 100
    riskLevel: 'clean' | 'low' | 'medium' | 'high';
    flaggedColumns: string[];
    cellAnomalies: Record<string, CellAnomalyInfo>;
  };
}

export interface DatasetState {
  filename: string;
  columns: ColumnSchema[];
  originalRows: Record<string, any>[]; // Original clean rows
  currentRows: RowData[]; // Rows currently displayed (clean, corrupted, or cleaned)
  isCorrupted: boolean;
  isCleaned: boolean;
  cleanHistoryLogs: TransformationLog[];
}

export interface TransformationLog {
  id: string;
  rowIndex: number;
  rowId: string;
  column: string;
  type: CorruptionType | 'imputation' | 'normalization';
  beforeValue: any;
  afterValue: any;
  methodUsed: string;
  timestamp: string;
}

export interface AutoCleanConfig {
  numericMethod: 'median' | 'mean' | 'forward_fill';
  outlierStrategy: 'iqr_cap' | 'median_replace' | 'keep';
  iqrMultiplier: number; // 1.5 or 3.0
  dateTargetFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY';
  typoMatching: boolean;
  fuzzyThreshold: number; // 0.6 to 0.9 similarity
}

export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  category: string;
  rowCount: number;
  csvContent: string;
}
