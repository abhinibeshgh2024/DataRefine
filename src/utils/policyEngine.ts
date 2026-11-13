import type {
  CleaningPipelineManifest,
  ColumnPolicy,
  ColumnSchema,
  ColumnType,
  ContractColumnValidation,
  ContractValidationResult,
  DataContractSchema,
  DuplicateResolutionStrategy,
  EnforcedColumnType,
  RowData,
} from '../types.ts';

export function mapSchemaTypeToEnforced(
  type: ColumnType,
  sampleValues: (string | number | boolean)[]
): EnforcedColumnType {
  if (type === 'id') return 'id';
  if (type === 'date') return 'date';
  if (type === 'boolean') return 'boolean';
  if (type === 'categorical') return 'categorical';
  if (type === 'text') return 'text';

  const nums = sampleValues
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    .map((v) => Number(String(v).trim()))
    .filter((n) => !isNaN(n) && Number.isFinite(n));

  if (nums.length > 0 && nums.every((n) => Number.isInteger(n))) {
    return 'integer';
  }
  return 'float';
}

export function mapEnforcedToBaseType(enforced: EnforcedColumnType): ColumnType {
  if (enforced === 'float' || enforced === 'integer') return 'numeric';
  if (enforced === 'date') return 'date';
  if (enforced === 'boolean') return 'boolean';
  if (enforced === 'categorical') return 'categorical';
  if (enforced === 'id') return 'id';
  return 'text';
}

export function createDefaultPolicies(schemas: ColumnSchema[]): Record<string, ColumnPolicy> {
  const policies: Record<string, ColumnPolicy> = {};

  schemas.forEach((col) => {
    const enforcedType = mapSchemaTypeToEnforced(col.type, col.sampleValues);
    const isNumeric = enforcedType === 'float' || enforcedType === 'integer';
    const isDate = enforcedType === 'date';
    const isCat = enforcedType === 'categorical';
    const isBool = enforcedType === 'boolean';

    policies[col.name] = {
      columnName: col.name,
      enforcedType,
      nullStrategy: isNumeric
        ? 'median'
        : isDate
        ? 'forward_fill'
        : isCat || isBool
        ? 'mode'
        : 'constant',
      customDefaultValue: isNumeric ? '0' : isBool ? 'false' : isDate ? '' : 'Unknown',
      outlierPolicy: isNumeric ? 'iqr_cap' : 'flag_only',
      iqrMultiplier: 1.5,
      zScoreThreshold: 2.5,
      modifiedZThreshold: 3.5,
      percentileLow: 1,
      percentileHigh: 99,
      dateTargetFormat: 'YYYY-MM-DD',
      dateFallbackStrategy: 'median',
      typoNormalization: isCat,
      fuzzyThreshold: 0.75,
      trimWhitespace: true,
      textCase: 'none',
      minBound: null,
      maxBound: null,
      nonNegative: false,
      regexPattern: '',
      allowedValues: [],
      required: enforcedType === 'id',
      selectedForBatch: true,
    };
  });

  return policies;
}

export function buildDataContract(
  contractName: string,
  version: string,
  description: string,
  policies: Record<string, ColumnPolicy>
): DataContractSchema {
  return {
    contractName: contractName.trim() || 'enterprise-data-contract',
    version: version.trim() || '1.0.0',
    createdAt: new Date().toISOString(),
    description: description.trim() || 'Column-level data hygiene & validation schema contract',
    columns: JSON.parse(JSON.stringify(policies)),
  };
}

export function buildCleaningPipelineManifest(
  pipelineName: string,
  version: string,
  description: string,
  policies: Record<string, ColumnPolicy>,
  duplicateConfig: { keyColumns: string[]; strategy: DuplicateResolutionStrategy }
): CleaningPipelineManifest {
  return {
    pipelineName: pipelineName.trim() || 'datarefine-cleaning-pipeline',
    version: version.trim() || '1.0.0',
    createdAt: new Date().toISOString(),
    description: description.trim() || 'Reproducible column-level cleaning & deduplication pipeline',
    duplicateConfig,
    policies: JSON.parse(JSON.stringify(policies)),
  };
}

export function validateDatasetAgainstContract(
  rows: RowData[],
  schemas: ColumnSchema[],
  contract: DataContractSchema
): ContractValidationResult {
  const datasetColNames = new Set(schemas.map((s) => s.name));
  const contractColNames = Object.keys(contract.columns || {});

  const missingColumns = contractColNames.filter((name) => !datasetColNames.has(name));
  const extraColumns = schemas
    .map((s) => s.name)
    .filter((name) => !(name in (contract.columns || {})));

  const columnResults: ContractColumnValidation[] = [];
  let totalViolations = 0;

  for (const colName of contractColNames) {
    const rule = contract.columns[colName];
    const datasetSchema = schemas.find((s) => s.name === colName);

    if (!datasetSchema) {
      columnResults.push({
        columnName: colName,
        status: 'fail',
        expectedType: rule.enforcedType,
        actualType: 'missing',
        violationCount: rows.length,
        message: 'Column required by contract is absent from dataset',
      });
      totalViolations += rows.length;
      continue;
    }

    let violationCount = 0;

    for (const row of rows) {
      const val = row.data[colName];
      const strVal = val === null || val === undefined ? '' : String(val).trim();
      const isMissing =
        val === null ||
        val === undefined ||
        strVal === '' ||
        ['n/a', 'nan', 'null', 'undefined', '?', '-'].includes(strVal.toLowerCase());

      if (isMissing) {
        if (rule.required || rule.nullStrategy === 'drop_row') {
          violationCount++;
        }
        continue;
      }

      if (rule.enforcedType === 'integer') {
        const n = Number(strVal);
        if (isNaN(n) || !Number.isInteger(n)) violationCount++;
      } else if (rule.enforcedType === 'float') {
        const n = Number(strVal);
        if (isNaN(n)) violationCount++;
      } else if (rule.enforcedType === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(strVal)) violationCount++;
      } else if (rule.enforcedType === 'boolean') {
        if (!['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(strVal.toLowerCase())) {
          violationCount++;
        }
      }
    }

    const anomalyFlags = rows.filter((r) => r.anomalyInfo?.cellAnomalies?.[colName]?.isAnomaly).length;
    const effectiveViolations = Math.max(violationCount, anomalyFlags);
    totalViolations += effectiveViolations;

    const actualEnforced = mapSchemaTypeToEnforced(datasetSchema.type, datasetSchema.sampleValues);

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    let message = `Conforms to ${rule.enforcedType} contract`;

    if (effectiveViolations > 0) {
      status = effectiveViolations > rows.length * 0.1 ? 'fail' : 'warning';
      message = `${effectiveViolations} cell violation${effectiveViolations === 1 ? '' : 's'} detected against ${rule.enforcedType} policy`;
    }

    columnResults.push({
      columnName: colName,
      status,
      expectedType: rule.enforcedType,
      actualType: actualEnforced,
      violationCount: effectiveViolations,
      message,
    });
  }

  return {
    contractName: contract.contractName,
    version: contract.version,
    isValid: missingColumns.length === 0 && totalViolations === 0,
    missingColumns,
    extraColumns,
    columnResults,
    totalViolations,
    validatedAt: new Date().toISOString(),
  };
}
