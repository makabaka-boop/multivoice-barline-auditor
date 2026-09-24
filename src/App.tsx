import { useMemo, useReducer, useRef, useState } from 'react';
import { ScoreEditor } from './components/ScoreEditor';
import { ReportView } from './components/ReportView';
import {
  editorReducer,
  initialEditorState,
  toScoreSpec,
  validateEditor,
} from './state/editor';
import { AnalysisReport, analyzeScore } from './engine/rhythm';

interface StoredResult {
  report: AnalysisReport;
}

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, initialEditorState);
  const [result, setResult] = useState<StoredResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const lastDownloadUrl = useRef<string | null>(null);

  // dirty 由 reducer 维护：任何编辑动作都会置位，旧报告随即标记为“已失效”。
  const isStale = result !== null && state.dirty;

  const issues = useMemo(() => validateEditor(state), [state]);

  function runAnalysis() {
    if (issues.length > 0) {
      setRunError(issues.map((i) => i.message).join('；'));
      return;
    }
    try {
      const report = analyzeScore(toScoreSpec(state));
      setResult({ report });
      setRunError(null);
      dispatch({ type: 'markClean' });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }

  function onEditDispatch(action: Parameters<typeof dispatch>[0]) {
    dispatch(action);
  }

  function downloadJson() {
    if (!result || isStale) return;
    const blob = new Blob([JSON.stringify(result.report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    if (lastDownloadUrl.current) URL.revokeObjectURL(lastDownloadUrl.current);
    const url = URL.createObjectURL(blob);
    lastDownloadUrl.current = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = `rhythm-check-${result.report.timeSignature.numerator}-${result.report.timeSignature.denominator}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>多声部排练谱 · 小节对齐核对台</h1>
        <p className="subtitle">
          整数分数（bigint 分子/分母）累计起止 · 附点 ×3/2、三连音 ×2/3 · 跨小节拆分保留原 id ·
          离线纯前端，不联网
        </p>
      </header>

      <ScoreEditor state={state} dispatch={onEditDispatch} />

      <section className="panel run-bar">
        <button type="button" className="btn primary big" onClick={runAnalysis}>
          核对小节对齐
        </button>
        <button
          type="button"
          className="btn big"
          onClick={downloadJson}
          disabled={!result || isStale}
          title={isStale ? '录入已修改，请重新核对后再下载' : '下载当前核对结果 JSON'}
        >
          下载 JSON{isStale ? '（已失效）' : ''}
        </button>
        {issues.length > 0 && (
          <span className="form-warning">待修正：{issues[0].message}{issues.length > 1 ? ` 等 ${issues.length} 项` : ''}</span>
        )}
        {runError && <span className="form-error">核对中止：{runError}</span>}
      </section>

      {result && isStale && (
        <div className="stale-banner" role="alert">
          ⚠ 录入在上次核对后被修改，以下报告是<b>旧结论</b>，可能与当前谱面不符。
          请重新点击「核对小节对齐」；在重新核对前下载已禁用。
        </div>
      )}

      {result ? (
        <div className={isStale ? 'stale-results' : ''} aria-busy={isStale}>
          <ReportView report={result.report} />
        </div>
      ) : (
        <section className="panel placeholder">
          <p>尚未核对。录入后点击「核对小节对齐」，将显示并列时间轴、跨小节片段、首个小节号错误与结尾差额。</p>
          <p className="hint">可先点录入台右上角「载入示例（含错误）」快速查看。</p>
        </section>
      )}

      <footer className="app-footer">
        所有位置与差额均为整数分数（分子/分母），可手工按有理数复算；屏幕像素位置不参与判定。
      </footer>
    </div>
  );
}
