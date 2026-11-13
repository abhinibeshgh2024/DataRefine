export type ColumnType = 'numeric' | 'date' | 'categorical' | 'text' | 'boolean' | 'id';

export type EnforcedColumnType =
  | 'float'
  | 'integer'
  | 'date'
  | 'categorical'
  | 'text'
  | 'boolean'
  | 'id';

export type NullStrategy =
  | 'drop_row'
  | 'zero_fill'
  | 'forward_fill'
  | 'backward_fill'
  | 'median'
  | 'mean'
  | 'mode'
  | 'constant'
  | 'custom';

export type OutlierPolicy =
  | 'iqr_cap'
  | 'zscore_clip'
  | 'modified_zscore_clip'
  | 'percentile_cap'
  | 'median_replace'
  | 'remove_row'
  | 'flag_only';

export type TextCaseMode = 'none' | 'lower' | 'upper' | 'title';

export type DateFallbackStrategy = 'median' | 'forward_fill' | 'backward_fill' | 'nearest' | 'custom';

export type DuplicateResolutionStrategy = 'keep_first' | 'keep_last' | 'drop_all' | 'flag_only';

export interface ColumnPolicy {
  columnName: string;
  enforcedType: EnforcedColumnType;
  nullStrategy: NullStrategy;
  customDefaultValue: string;
  outlierPolicy: OutlierPolicy;
  iqrMultiplier: number;
  zScoreThreshold: number;
  modifiedZThreshold: number;
  percentileLow: number;
  percentileHigh: number;
  dateTargetFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY';
  dateFallbackStrategy: DateFallbackStrategy;
  typoNormalization: boolean;
  fuzzyThreshold: number; // 0.5 to 0.98 similarity ratio
  trimWhitespace: boolean;
  textCase: TextCaseMode;
  minBound: number | null;
  maxBound: number | null;
  nonNegative: boolean;
  regexPattern: string;
  allowedValues: string[];
  required: boolean;
  selectedForBatch: boolean;
}

export interface DataContractSchema {
  contractName: string;
  version: string;
  createdAt: string;
  description?: string;
  columns: Record<string, ColumnPolicy>;
}

export interface CleaningPipelineManifest {
  pipelineName: string;
  version: string;
  createdAt: string;
  description?: string;
  duplicateConfig: {
    keyColumns: string[];
    strategy: DuplicateResolutionStrategy;
  };
  policies: Record<string, ColumnPolicy>;
}

export interface ContractColumnValidation {
  columnName: string;
  status: 'pass' | 'warning' | 'fail';
  expectedType: EnforcedColumnType;
  actualType: string;
  violationCount: number;
  message: string;
}

export interface ContractValidationResult {
  contractName: string;
  version: string;
  isValid: boolean;
  missingColumns: string[];
  extraColumns: string[];
  columnResults: ContractColumnValidation[];
  totalViolations: number;
  validatedAt: string;
}

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  sampleValues: (string | number | boolean)[];
  distinctCount: number;
}

export interface DuckDBColumnProfile {
  columnName: string;
  totalCount: number;
  nullCount: number;
  distinctCount: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  stdDev: number | null;
  minVal: string | number | null;
  maxVal: string | number | null;
}

export interface HistogramBin {
  bin: string;
  count: number;
}

export interface CategoryFrequency {
  value: string;
  count: number;
  pct: number;
}

export interface ColumnProfileReport {
  columnName: string;
  semanticRole: string;
  detectedType: EnforcedColumnType;
  totalCount: number;
  validCount: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  mean: number | null;
  median: number | null;
  mode: string | number | null;
  stdDev: number | null;
  mad: number | null;
  min: number | string | null;
  max: number | string | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  skewness: number | null;
  anomalyCount: number;
  qualityScore: number; // 0 to 100
  consistencyIssues: string[];
  histogram: HistogramBin[];
  topCategories: CategoryFrequency[];
}

export interface DuplicateCluster {
  id: string;
  type: 'exact' | 'subset';
  keyColumns: string[];
  rowIndices: number[];
  count: number;
  preview: string;
}

export interface CorrelationPair {
  colA: string;
  colB: string;
  r: number;
  strength: 'Strong Positive' | 'Moderate Positive' | 'Weak' | 'Moderate Negative' | 'Strong Negative';
}

export interface CorrelationMatrix {
  columns: string[];
  matrix: number[][];
  strongPairs: CorrelationPair[];
}

export interface TrendSummary {
  dateColumn: string;
  metricColumn: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  slopePct: number;
  anomaliesCount: number;
  points: { date: string; value: number }[];
}

export interface DatasetKPI {
  column: string;
  label: string;
  total: number;
  average: number;
  median: number;
  spreadNote: string;
}

export interface DatasetProfileReport {
  generatedAt: string;
  rowCount: number;
  columnCount: number;
  overallQualityScore: number;
  completenessScore: number;
  validityScore: number;
  uniquenessScore: number;
  consistencyScore: number;
  exactDuplicateRowCount: number;
  columnProfiles: Record<string, ColumnProfileReport>;
  duplicates: DuplicateCluster[];
  correlations: CorrelationMatrix;
  trends: TrendSummary[];
  kpis: DatasetKPI[];
  consistencyAlerts: string[];
  businessInsights: string[];
}

export type ExecutionMode = 'duckdb_wasm' | 'server_batch' | 'local_fallback';

export interface PipelineExecutionInfo {
  mode: ExecutionMode;
  rowCount: number;
  durationMs: number;
  operation: 'load' | 'analyze' | 'clean' | 'corrupt' | 'sql_query' | 'dedupe';
  sqlProfiled: boolean;
  timestamp: string;
}

export type CorruptionType = 'missing' | 'outlier' | 'date_format' | 'typo' | 'validation';

export type NoiseProfileId =
  | 'custom'
  | 'iot_drift'
  | 'manual_entry'
  | 'financial_shock'
  | 'schema_break';

export interface CorruptionConfig {
  profileName: NoiseProfileId;
  overallRate: number;
  enableMissing: boolean;
  missingnessAlgorithm: 'mcar' | 'mar';
  missingRate: number;
  missingPlaceholders: string[];
  enableOutliers: boolean;
  outlierRate: number;
  outlierMultiplier: number; // 5x to 100x
  injectNegativeShocks: boolean;
  enableDateFormats: boolean;
  dateMixRate: number;
  enableTypos: boolean;
  typoRate: number;
  injectWhitespace: boolean;
  injectKeyboardTypos: boolean;
  targetColumns: string[];
}

export interface CellCorruptionMeta {
  isCorrupted: boolean;
  types: CorruptionType[];
  originalValue: any;
}

export interface CellAnomalyInfo {
  isAnomaly: boolean;
  types: CorruptionType[];
  score: number;
  reason?: string;
  aiExplanation?: string;
  suggestedFix?: any;
  confidenceScore?: number;
  detectionRule?: string;
}

export interface CellLineageEntry {
  id: string;
  timestamp: string;
  actor: 'auto_clean' | 'manual_override' | 'rollback' | 'approval_workflow' | 'deduplication';
  originalValue: any;
  beforeValue: any;
  afterValue: any;
  detectionRule: string;
  actionTaken: string;
  confidenceScore: number;
  policyApplied: string;
}

export interface RowData {
  _id: string;
  data: Record<string, any>;
  corruptedMeta?: Record<string, CellCorruptionMeta>;
  cellLineage?: Record<string, CellLineageEntry[]>;
  anomalyInfo?: {
    totalScore: number;
    riskLevel: 'clean' | 'low' | 'medium' | 'high';
    flaggedColumns: string[];
    cellAnomalies: Record<string, CellAnomalyInfo>;
  };
}

export interface TransformationLog {
  id: string;
  rowIndex: number;
  rowId: string;
  column: string;
  type: CorruptionType | 'imputation' | 'normalization' | 'override' | 'rollback' | 'duplicate';
  actor: 'auto_clean' | 'manual_override' | 'rollback' | 'approval_workflow' | 'deduplication';
  originalValue: any;
  beforeValue: any;
  afterValue: any;
  detectionRule: string;
  methodUsed: string;
  confidenceScore: number;
  timestamp: string;
  rolledBack?: boolean;
}

export interface CleaningPreviewDiff {
  rowIndex: number;
  rowId: string;
  column: string;
  beforeValue: string;
  afterValue: string;
  rule: string;
  method: string;
  confidenceScore: number;
}

export interface CleaningPreviewResult {
  diffs: CleaningPreviewDiff[];
  totalImpactedCells: number;
  droppedRowCount: number;
  currentQualityScore: number;
  projectedQualityScore: number;
}

export interface CleaningRecommendation {
  id: string;
  columnName: string;
  category: 'missing' | 'outlier' | 'date' | 'typo' | 'text' | 'duplicate' | 'validation';
  title: string;
  explanation: string;
  strategyTradeoff: string;
  affectedRowsCount: number;
  recommendedAction: string;
  patchPolicy?: Partial<ColumnPolicy>;
  duplicateStrategy?: DuplicateResolutionStrategy;
  confidenceScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
}

export interface NLQueryResponse {
  id: string;
  question: string;
  answer: string;
  generatedSQL?: string;
  columns?: string[];
  rows?: Record<string, any>[];
  durationMs?: number;
  insights?: string[];
  timestamp: string;
}

export interface SessionSnapshot {
  id: string;
  label: string;
  timestamp: string;
  currentRows: RowData[];
  policies: Record<string, ColumnPolicy>;
  cleanHistoryLogs: TransformationLog[];
  isCleaned: boolean;
  isCorrupted: boolean;
}

export interface DatasetState {
  filename: string;
  fileFormat: 'csv' | 'xlsx' | 'json' | 'sample';
  columns: ColumnSchema[];
  policies: Record<string, ColumnPolicy>;
  originalRows: Record<string, any>[];
  currentRows: RowData[];
  isCorrupted: boolean;
  isCleaned: boolean;
  cleanHistoryLogs: TransformationLog[];
  duckdbProfiles?: Record<string, DuckDBColumnProfile>;
  baselineProfile?: DatasetProfileReport;
  currentProfile?: DatasetProfileReport;
  recommendations: CleaningRecommendation[];
  lastExecution?: PipelineExecutionInfo;
  activeContract?: DataContractSchema | null;
}

export interface AutoCleanConfig {
  numericMethod: 'median' | 'mean' | 'forward_fill';
  outlierStrategy: 'iqr_cap' | 'median_replace' | 'keep';
  iqrMultiplier: number;
  dateTargetFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD-MM-YYYY';
  typoMatching: boolean;
  fuzzyThreshold: number;
}

export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  category: string;
  rowCount: number;
  csvContent?: string;
  generator?: () => Record<string, any>[];
}

export interface SQLQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  durationMs: number;
  sql: string;
}
