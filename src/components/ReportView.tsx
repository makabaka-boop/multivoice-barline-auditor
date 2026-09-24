import { AnalysisReport } from '../engine/rhythm';
import { beatText, rationalText, shortfallText } from '../lib/format';
import { Timeline } from './Timeline';

interface Props {
  report: AnalysisReport;
}

export function ReportView({ report }: Props) {
  const td = report.timeSignature.denominator;
  const error = report.firstError;
  const errorVoice = error
    ? report.input.voices.find((v) => v.id === error.voiceId)
    : undefined;

  return (
    <div className="report">
      {/* 摘要 */}
      <section className="panel summary">
        <h2>② 核对结论</h2>
        <div className="summary-chips">
          <span className="chip">
            拍号 {report.timeSignature.numerator}/{report.timeSignature.denominator}
          </span>
          <span className="chip">小节长度 {rationalText(report.measureLength)} 全音符</span>
          <span className="chip">声部 {report.voices.length}</span>
          <span className={`chip ${error ? 'bad' : 'good'}`}>
            小节号错误 {report.mismatchCount} 处
          </span>
          <span className={`chip ${report.allEndAligned ? 'good' : 'bad'}`}>
            {report.allEndAligned ? '结尾齐整' : '结尾未齐'}
          </span>
        </div>
      </section>

      {/* 最早错误 */}
      <section className="panel">
        <h3>首个错误（按起点位置、再按声部与事件次序）</h3>
        {error ? (
          <div className="error-card" role="alert">
            <div className="error-title">
              「{error.voiceName}」事件 <code>{error.eventId}</code> 标称第
              <b> {error.nominalMeasure} </b>小节，实际起始于第
              <b> {error.actualMeasure} </b>小节
            </div>
            <div className="error-meta">
              <span>起点：<code>{rationalText(error.start)}</code> 全音符（{beatText(error.start, td)}）</span>
              <span>事件次序：第 {error.eventIndex + 1} 个</span>
              {errorVoice && (
                <span>
                  时值：
                  {(() => {
                    const ev = errorVoice.events[error.eventIndex];
                    return `${ev.durationDenominator} 分母${ev.dotted ? ' · 附点' : ''}${
                      ev.triplet ? ' · 三连音' : ''
                    }`;
                  })()}
                </span>
              )}
            </div>
            <p className="error-hint">
              其后另有 {Math.max(0, report.mismatchCount - 1)} 处错误；请先修最早一处后重新核对。
            </p>
          </div>
        ) : (
          <p className="ok-text">✓ 所有事件的标称小节号都与整数分数累计的实际起始小节一致。</p>
        )}
      </section>

      {/* 多声部结尾 */}
      <section className="panel">
        <h3>多声部结尾对齐</h3>
        <p className="hint">
          共同结束线取最长声部终点；参考位置{' '}
          <code>{rationalText(report.referenceEnd)}</code>（应对齐第{' '}
          {report.referenceMeasureIndex + 1} 小节起点）
          {report.referenceIsBarline ? '。' : '，但最长声部终点本身不在完整小节线上，需补足。'}
        </p>
        <table className="ending-table">
          <thead>
            <tr>
              <th>声部</th>
              <th>事件数</th>
              <th>总时值（全音符分数）</th>
              <th>占据小节</th>
              <th>自身落在小节线</th>
              <th>距自身下一小节线</th>
              <th>距共同结束线</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {report.endings.map((e) => (
              <tr key={e.voiceId} className={e.aligned ? 'row-ok' : 'row-bad'}>
                <td>
                  {e.name}
                  {e.isLongest && <span className="tag">最长</span>}
                </td>
                <td>{e.eventCount}</td>
                <td className="mono">{rationalText(e.totalDuration)}</td>
                <td>{e.measureSpan}</td>
                <td>{e.endsOnBarline ? '是' : '否'}</td>
                <td className="mono">{shortfallText(e.shortfallToOwnBarline, td)}</td>
                <td className="mono">{shortfallText(e.shortfallToReference, td)}</td>
                <td>
                  {e.aligned ? (
                    <span className="badge good">对齐</span>
                  ) : (
                    <span className="badge bad">
                      {e.isLongest && !report.referenceIsBarline
                        ? '未补足'
                        : e.endsOnBarline
                          ? '提前结束'
                          : '停在小节中途'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 时间轴 */}
      <section className="panel">
        <h3>并列时间轴与小节片段</h3>
        <Timeline report={report} firstErrorEventId={error?.eventId ?? null} />
        <p className="hint">
          同色为同一声部；跨小节事件被小节线切开，各片段仍标注原事件 id（↳ 表示续接片段）；
          红框为首个小节号错误事件。横向位置只用于屏幕示意，判定以上表有理数为准。
        </p>
      </section>

      {/* 每声部事件明细 */}
      {report.voices.map((voice) => (
        <section className="panel" key={voice.voiceId}>
          <h3>
            {voice.name} · 事件与片段明细
            <span className="sub">总时值 {rationalText(voice.totalDuration)}，{voice.measureSpan} 小节</span>
          </h3>
          <table className="detail-table">
            <thead>
              <tr>
                <th>#</th>
                <th>id</th>
                <th>标称</th>
                <th>实际起始小节</th>
                <th>起</th>
                <th>止</th>
                <th>时值</th>
                <th>片段（小节 · 偏移 · 长度）</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {voice.events.map((ev) => (
                <tr key={ev.id} className={ev.measureMatches ? '' : 'row-bad'}>
                  <td>{ev.index + 1}</td>
                  <td className="mono">{ev.id}</td>
                  <td>{ev.nominalMeasure}</td>
                  <td>{ev.actualStartMeasure}</td>
                  <td className="mono">{rationalText(ev.start)}</td>
                  <td className="mono">{rationalText(ev.end)}</td>
                  <td className="mono">
                    {rationalText(ev.duration)}
                    <span className="sub">
                      {ev.dotted ? '·附点' : ''}
                      {ev.triplet ? '·三连音' : ''}
                    </span>
                  </td>
                  <td>
                    <ul className="frag-list">
                      {ev.fragments.map((f) => (
                        <li key={f.fragmentIndex}>
                          第 {f.measureIndex + 1} 小节 · 偏移 {rationalText(f.offsetInMeasure)} · 长{' '}
                          {rationalText(f.length)}
                          {f.split ? (f.first ? '（首段）' : '（续段）') : ''}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    {ev.measureMatches ? (
                      <span className="badge good">一致</span>
                    ) : (
                      <span className="badge bad">小节不符</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
