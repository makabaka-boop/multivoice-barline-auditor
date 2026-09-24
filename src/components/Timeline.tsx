import { AnalysisReport } from '../engine/rhythm';
import { Rational } from '../engine/fraction';
import { pctOf, rationalText } from '../lib/format';

interface Props {
  report: AnalysisReport;
  /** 处于小节号错误状态的事件 id 集合（首个错误高亮）。 */
  firstErrorEventId: string | null;
}

/** 两有理数之和（仅用于把参考线换算为百分比基准）。 */
function addR(a: Rational, b: Rational): Rational {
  return {
    num: (BigInt(a.num) * BigInt(b.den) + BigInt(b.num) * BigInt(a.den)).toString(),
    den: (BigInt(a.den) * BigInt(b.den)).toString(),
  };
}

export function Timeline({ report, firstErrorEventId }: Props) {
  // 网格至少铺到共同结束线所在小节；参考线非完整小节线时，多铺一小节。
  const measures = Math.max(
    1,
    ...report.voices.map((v) => v.measureSpan),
    report.referenceMeasureIndex,
  );
  const measureLen = report.measureLength;
  const totalWidth: Rational = {
    num: (BigInt(measures) * BigInt(measureLen.num)).toString(),
    den: measureLen.den,
  };
  const referenceWidth = pctOf(report.referenceEnd, totalWidth);

  return (
    <div className="timeline" aria-label="并列时间轴">
      <div className="ruler-row">
        <div className="track-label-col" aria-hidden="true" />
        <div className="ruler">
          {Array.from({ length: measures }, (_, i) => (
            <div className="ruler-cell" key={i} style={{ width: `${100 / measures}%` }}>
              <span className="ruler-num">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {report.voices.map((voice, vi) => (
        <div className="track-row" key={voice.voiceId}>
          <div className="track-label-col">
            <span className="voice-dot" data-voice={vi} />
            <span className="track-name">{voice.name}</span>
          </div>
          <div className="track" data-voice={vi}>
            <div className="measure-grid">
              {Array.from({ length: measures }, (_, i) => (
                <div className="measure-cell" key={i} style={{ width: `${100 / measures}%` }} />
              ))}
            </div>

            {voice.events.map((ev) =>
              ev.fragments.map((f) => {
                const left = pctOf(f.start, totalWidth);
                const width = pctOf(addR(f.start, f.length), totalWidth) - left;
                const isError = ev.id === firstErrorEventId && f.first;
                return (
                  <div
                    key={`${ev.id}-${f.fragmentIndex}`}
                    className={[
                      'fragment',
                      f.split ? 'split' : '',
                      f.first ? 'first' : 'continuation',
                      isError ? 'has-error' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-voice={vi}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }}
                    title={`${voice.name} · ${ev.id} · 第 ${f.measureIndex + 1} 小节片段${
                      f.split ? '（跨小节拆分）' : ''
                    }\n起 ${rationalText(f.start)}，止 ${rationalText(f.end)}，长 ${rationalText(
                      f.length,
                    )}（全音符分数）\n小节内偏移 ${rationalText(f.offsetInMeasure)}`}
                  >
                    <span className="fragment-label">
                      {f.first ? `${ev.id}` : `↳ ${ev.id}`}
                    </span>
                  </div>
                );
              }),
            )}
          </div>
        </div>
      ))}

      <div className="reference-row">
        <div className="track-label-col" />
        <div className="reference-track">
          <div
            className={report.referenceIsBarline ? 'reference-line ok' : 'reference-line bad'}
            style={{ left: `${referenceWidth}%` }}
            title={
              report.referenceIsBarline
                ? `共同结束小节线（第 ${report.referenceMeasureIndex + 1} 小节起点）`
                : '最长声部终点不在完整小节线上'
            }
          >
            <span className="reference-tag">
              {report.referenceIsBarline
                ? `共同结束线 · ${rationalText(report.referenceEnd)}`
                : `终点 ${rationalText(report.referenceEnd)} 不在小节线`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
