import React, { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  CleaningRecommendation,
  ColumnPolicy,
  ColumnSchema,
  DatasetProfileReport,
  ExecutionMode,
  NLQueryResponse,
  RowData,
  TransformationLog,
} from '../types';
import {
  answerNaturalLanguageQuestion,
  CLEANING_STRATEGY_GUIDE,
  generateCleaningSummaryNarrative,
} from '../utils/localAiAnalyst';

interface AiAnalystPanelProps {
  rows: RowData[];
  schemas: ColumnSchema[];
  policies: Record<string, ColumnPolicy>;
  baselineProfile?: DatasetProfileReport;
  currentProfile: DatasetProfileReport;
  recommendations: CleaningRecommendation[];
  logs: TransformationLog[];
  executionMode?: ExecutionMode;
  onApproveRecommendation: (recId: string) => void;
  onRejectRecommendation: (recId: string) => void;
  onApproveAllPending: () => void;
  onApplyApprovedRecommendations: () => void;
  isProcessing: boolean;
}

export const AiAnalystPanel: React.FC<AiAnalystPanelProps> = ({
  rows,
  schemas,
  baselineProfile,
  currentProfile,
  recommendations,
  logs,
  executionMode,
  onApproveRecommendation,
  onRejectRecommendation,
  onApproveAllPending,
  onApplyApprovedRecommendations,
  isProcessing,
}) => {
  const [question, setQuestion] = useState('');
  const [queryHistory, setQueryHistory] = useState<NLQueryResponse[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

  const narrative = useMemo(
    () => generateCleaningSummaryNarrative(baselineProfile, currentProfile, logs),
    [baselineProfile, currentProfile, logs]
  );

  const quickQuestions = useMemo(() => {
    const firstCat = schemas.find((s) => s.type === 'categorical')?.name;
    const firstNum = schemas.find((s) => s.type === 'numeric')?.name;
    const prompts = [
      'Which columns have missing values?',
      'Are there any duplicate rows?',
      'What are the top data quality issues?',
      'Which numeric columns are correlated?',
    ];
    if (firstCat && firstNum) {
      prompts.push(`Average ${firstNum} by ${firstCat}`);
    }
    if (firstNum) {
      prompts.push(`Top 10 highest ${firstNum}`);
    }
    return prompts;
  }, [schemas]);

  const handleAsk = async (qText?: string) => {
    const text = (qText ?? question).trim();
    if (!text) return;
    setIsQuerying(true);
    try {
      const response = await answerNaturalLanguageQuestion(
        text,
        rows,
        schemas,
        currentProfile,
        executionMode !== 'server_batch'
      );
      setQueryHistory((prev) => [response, ...prev]);
      if (!qText) setQuestion('');
    } finally {
      setIsQuerying(false);
    }
  };

  const pendingCount = recommendations.filter((r) => r.status === 'pending').length;
  const approvedCount = recommendations.filter((r) => r.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* Zero-API Local AI Cleaning Narrative */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Intelligent Local Data Quality Assistant
            </h2>
          </div>
          <span className="text-xs font-medium text-emerald-700">
            Local NL-to-SQL &amp; Statistical Rule Engine (Zero External API Keys)
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200/80 rounded-lg p-3.5">
          {narrative}
        </p>
      </div>

      {/* Natural Language Data Query Console */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Natural-Language Data &amp; Quality Query Engine
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ask plain-English questions about missingness, duplicates, correlations, top records, or grouped aggregations
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quickQuestions.map((qp) => (
            <button
              key={qp}
              type="button"
              disabled={isQuerying}
              onClick={() => handleAsk(qp)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs text-slate-700 font-medium cursor-pointer transition-colors"
            >
              {qp}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder='Ask e.g. "Average spend by region" or "Which columns have missing values?"'
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isQuerying || !question.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isQuerying ? 'Analyzing...' : 'Ask Question'}</span>
          </button>
        </form>

        {queryHistory.length > 0 && (
          <div className="space-y-4 pt-2">
            {queryHistory.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900">
                    Q: {item.question}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {item.durationMs} ms &middot; {item.timestamp}
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">{item.answer}</p>

                {item.generatedSQL && (
                  <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono flex items-start gap-2 overflow-x-auto">
                    <Terminal className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <code>{item.generatedSQL}</code>
                  </div>
                )}

                {item.rows && item.rows.length > 0 && item.columns && (
                  <div className="overflow-x-auto max-h-56 border border-slate-200 rounded-lg bg-white">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          {item.columns.map((c) => (
                            <th key={c} className="py-2 px-3 whitespace-nowrap">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {item.rows.slice(0, 30).map((r, rIdx) => (
                          <tr key={rIdx}>
                            {item.columns!.map((c) => (
                              <td key={c} className="py-1.5 px-3 whitespace-nowrap">
                                {r[c] === null || r[c] === undefined ? 'NULL' : String(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Human Approval Workflow: Smart Cleaning Recommendations */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Smart Cleaning Recommendations &amp; Human Approval Workflow
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Review each automated recommendation, inspect strategy trade-offs, approve or reject individually, and commit approved actions
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onApproveAllPending}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Approve All Pending ({pendingCount})
              </button>
            )}
            <button
              type="button"
              disabled={isProcessing || approvedCount === 0}
              onClick={onApplyApprovedRecommendations}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? 'Applying...'
                  : `Apply Approved (${approvedCount})`}
              </span>
            </button>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  rec.status === 'approved'
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : rec.status === 'rejected'
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : rec.status === 'applied'
                    ? 'bg-blue-50/40 border-blue-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{rec.title}</span>
                    <span className="text-slate-400">&middot;</span>
                    <span className="font-mono text-blue-700 font-semibold">
                      {rec.columnName}
                    </span>
                    <span className="text-slate-400">&middot;</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {rec.affectedRowsCount.toLocaleString()} cells/rows &middot; {rec.confidenceScore}% conf.
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{rec.explanation}</p>
                  <div className="text-[11px] text-slate-500">
                    <strong>Trade-off:</strong> {rec.strategyTradeoff} &middot;{' '}
                    <strong>Action:</strong>{' '}
                    <span className="font-mono text-slate-800">{rec.recommendedAction}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {rec.status === 'applied' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Applied</span>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onApproveRecommendation(rec.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer border transition-colors ${
                          rec.status === 'approved'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{rec.status === 'approved' ? 'Approved' : 'Approve'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectRecommendation(rec.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer border transition-colors ${
                          rec.status === 'rejected'
                            ? 'bg-slate-600 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{rec.status === 'rejected' ? 'Rejected' : 'Reject'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            <Sparkles className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
            <div className="font-semibold text-slate-800">
              No pending cleaning recommendations
            </div>
            <p className="mt-1">
              All detected missingness, outliers, casing, and duplicate checks are currently clean.
            </p>
          </div>
        )}
      </div>

      {/* Cleaning Strategy Comparison Guide */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Cleaning Strategy Selection Guide
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reference trade-offs to choose the safest statistical method for each column
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Strategy</th>
                <th className="py-2.5 px-4">Best Used For</th>
                <th className="py-2.5 px-4">Strengths</th>
                <th className="py-2.5 px-4">Trade-offs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CLEANING_STRATEGY_GUIDE.map((item) => (
                <tr key={item.strategy}>
                  <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {item.strategy}
                  </td>
                  <td className="py-2.5 px-4">{item.bestFor}</td>
                  <td className="py-2.5 px-4 text-emerald-800">{item.pros}</td>
                  <td className="py-2.5 px-4 text-amber-800">{item.cons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
