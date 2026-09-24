import { EditorAction, EditorState } from '../state/editor';
import { DURATION_DENOMINATORS } from '../engine/rhythm';
import { rationalText } from '../lib/format';
import { eventDuration } from '../engine/rhythm';
import { toRational } from '../engine/fraction';

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

const DURATION_OPTIONS: ReadonlyArray<{ value: (typeof DURATION_DENOMINATORS)[number]; label: string }> = [
  { value: 1, label: '全 1' },
  { value: 2, label: '二分 2' },
  { value: 4, label: '四分 4' },
  { value: 8, label: '八分 8' },
  { value: 16, label: '十六 16' },
  { value: 32, label: '卅二 32' },
];

export function ScoreEditor({ state, dispatch }: Props) {
  return (
    <section className="panel editor" aria-label="录入台">
      <header className="panel-head">
        <h2>① 拍号与声部录入</h2>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'loadDemo' })}>
            载入示例（含错误）
          </button>
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'loadEmpty' })}>
            清空
          </button>
        </div>
      </header>

      <div className="time-sig-row">
        <label>
          拍号
          <input
            className="num-input"
            inputMode="numeric"
            value={state.numeratorInput}
            onChange={(e) => dispatch({ type: 'setNumerator', value: e.target.value })}
            aria-label="拍号分子"
          />
        </label>
        <span className="time-slash">/</span>
        <label>
          <span className="sr-only">拍号分母</span>
          <select
            value={state.denominator}
            onChange={(e) =>
              dispatch({ type: 'setDenominator', value: Number(e.target.value) as 4 | 8 })
            }
          >
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
        <span className="hint">分子 2–12，分母 4 或 8；时值单位为全音符分数</span>
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'addVoice' })}
          disabled={state.voices.length >= 4}
        >
          ＋ 添加声部
        </button>
      </div>

      {state.notice && (
        <div className="notice" role="status">
          {state.notice}
          <button type="button" className="notice-x" onClick={() => dispatch({ type: 'clearNotice' })}>
            ×
          </button>
        </div>
      )}

      <div className="voices">
        {state.voices.map((voice, vi) => (
          <div className="voice-block" key={voice.id}>
            <div className="voice-head">
              <span className="voice-badge">声部 {vi + 1}</span>
              <input
                className="voice-name"
                value={voice.name}
                onChange={(e) =>
                  dispatch({ type: 'renameVoice', voiceId: voice.id, name: e.target.value })
                }
                aria-label={`声部 ${vi + 1} 名称`}
              />
              <span className="voice-id">id: {voice.id}</span>
              <span className="event-count">{voice.events.length}/120 事件</span>
              <button type="button" className="btn small" onClick={() => dispatch({ type: 'addEvent', voiceId: voice.id })}>
                ＋ 事件
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={() => dispatch({ type: 'removeVoice', voiceId: voice.id })}
                disabled={state.voices.length <= 1}
                title="删除该声部"
              >
                删除声部
              </button>
            </div>

            <table className="event-table">
              <thead>
                <tr>
                  <th className="col-order">#</th>
                  <th className="col-id">事件 id</th>
                  <th className="col-measure">标称小节</th>
                  <th className="col-dur">时值分母</th>
                  <th className="col-flag">附点</th>
                  <th className="col-flag">三连音</th>
                  <th>时值（全音符分数）</th>
                  <th className="col-ops">排序/删除</th>
                </tr>
              </thead>
              <tbody>
                {voice.events.map((event, ei) => {
                  const dur = eventDuration({
                    durationDenominator: event.durationDenominator,
                    dotted: event.dotted,
                    triplet: event.triplet,
                  });
                  return (
                    <tr key={event.id}>
                      <td className="col-order">{ei + 1}</td>
                      <td className="col-id mono" title="id 自动生成、全谱唯一、不可修改">
                        {event.id}
                      </td>
                      <td className="col-measure">
                        <input
                          inputMode="numeric"
                          value={event.measureInput}
                          onChange={(e) =>
                            dispatch({
                              type: 'setEventMeasure',
                              voiceId: voice.id,
                              eventId: event.id,
                              value: e.target.value,
                            })
                          }
                          aria-label={`${voice.name} 第 ${ei + 1} 事件标称小节`}
                        />
                      </td>
                      <td className="col-dur">
                        <select
                          value={event.durationDenominator}
                          onChange={(e) =>
                            dispatch({
                              type: 'setEventDuration',
                              voiceId: voice.id,
                              eventId: event.id,
                              value: Number(e.target.value) as (typeof DURATION_DENOMINATORS)[number],
                            })
                          }
                        >
                          {DURATION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="col-flag">
                        <input
                          type="checkbox"
                          checked={event.dotted}
                          onChange={() =>
                            dispatch({
                              type: 'toggleEventFlag',
                              voiceId: voice.id,
                              eventId: event.id,
                              field: 'dotted',
                            })
                          }
                          aria-label="附点"
                        />
                      </td>
                      <td className="col-flag">
                        <input
                          type="checkbox"
                          checked={event.triplet}
                          onChange={() =>
                            dispatch({
                              type: 'toggleEventFlag',
                              voiceId: voice.id,
                              eventId: event.id,
                              field: 'triplet',
                            })
                          }
                          aria-label="三连音"
                        />
                      </td>
                      <td className="mono">{rationalText(toRational(dur))}</td>
                      <td className="col-ops">
                        <button
                          type="button"
                          className="btn tiny"
                          onClick={() =>
                            dispatch({ type: 'moveEvent', voiceId: voice.id, eventId: event.id, dir: -1 })
                          }
                          disabled={ei === 0}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn tiny"
                          onClick={() =>
                            dispatch({ type: 'moveEvent', voiceId: voice.id, eventId: event.id, dir: 1 })
                          }
                          disabled={ei === voice.events.length - 1}
                          title="下移"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn tiny danger"
                          onClick={() =>
                            dispatch({ type: 'removeEvent', voiceId: voice.id, eventId: event.id })
                          }
                          disabled={voice.events.length <= 1}
                          title="删除事件"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
