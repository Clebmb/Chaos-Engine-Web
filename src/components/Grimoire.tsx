import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    loadGrimoire, addRecord, updateRecord, deleteRecord, newId,
    downloadJson, importJson, saveToFile, loadFromFile, fsaSupported,
    formatMoon, moonPhase,
} from '../lib/grimoire';
import type { Grimoire as GrimoireData, GrimoireRecord, SigilRecord, DiaryRecord, ServitorRecord, DiaryOutcome, FractalSnapshot, ServitorDraft } from '../lib/grimoire';
import { ServitorWizard } from './ServitorWizard';

interface GrimoireProps {
    onClose: () => void;
    /** Captures the live ritual space (URL query string + fractal snapshot). */
    captureCurrent: () => { ritualLink: string; state: FractalSnapshot };
    /** Restores a saved ritual space from its stored URL query string. */
    onEngage: (ritualLink: string) => void;
    /** Launches a servitor: restores its world, projects its sigil, sounds its tone. */
    onAwaken: (rec: ServitorRecord) => void;
}

type Tab = 'sigils' | 'diary' | 'servitors';

const PREVIEW_W = 120;
const PREVIEW_H = 90;

/** Small CPU escape-time preview honoring the saved fractal type/view. */
const GrimoirePreview: React.FC<{ state: FractalSnapshot | null }> = ({ state }) => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !state) return;

        const w = canvas.width;
        const h = canvas.height;
        const img = ctx.createImageData(w, h);
        const aspect = w / h;
        const maxIter = 48;

        for (let px = 0; px < w; px++) {
            for (let py = 0; py < h; py++) {
                const cx = state.center[0] + (px / w - 0.5) * state.zoom * aspect;
                const cy = state.center[1] + (0.5 - py / h) * state.zoom;
                let zx: number, zy: number;
                if (state.type === 1) {
                    zx = cx; zy = cy;
                } else {
                    zx = 0; zy = 0;
                }
                const cre = state.type === 1 ? state.juliaC[0] : cx;
                const cim = state.type === 1 ? state.juliaC[1] : cy;
                let j = 0;
                while (zx * zx + zy * zy < 4 && j < maxIter) {
                    const t: [number, number] = [zx, zy];
                    switch (state.type) {
                        case 2: // Burning Ship
                            zx = t[0] * t[0] - t[1] * t[1] + cre;
                            zy = 2 * Math.abs(t[0] * t[1]) + cim;
                            break;
                        case 3: // Tricorn
                            zx = t[0] * t[0] - t[1] * t[1] + cre;
                            zy = -2 * t[0] * t[1] + cim;
                            break;
                        case 4: // Celtic
                            zx = Math.abs(t[0] * t[0] - t[1] * t[1]) + cre;
                            zy = 2 * t[0] * t[1] + cim;
                            break;
                        case 5: // Buffalo
                            zx = Math.abs(t[0] * t[0] - t[1] * t[1]) + cre;
                            zy = Math.abs(2 * t[0] * t[1]) + cim;
                            break;
                        case 6: // Perpendicular
                            zx = Math.abs(t[0]) * Math.abs(t[0]) - t[1] * t[1] + cre;
                            zy = 2 * Math.abs(t[0]) * t[1] + cim;
                            break;
                        default: // Mandelbrot / Julia
                            zx = t[0] * t[0] - t[1] * t[1] + cre;
                            zy = 2 * t[0] * t[1] + cim;
                    }
                    j++;
                }
                const idx = (py * w + px) * 4;
                const v = j === maxIter ? 0 : (j / maxIter);
                img.data[idx] = Math.floor(v * 220);
                img.data[idx + 1] = Math.floor(v * 30);
                img.data[idx + 2] = Math.floor(v * 30);
                img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }, [state]);

    return (
        <canvas
            ref={ref}
            width={PREVIEW_W}
            height={PREVIEW_H}
            className="grimoire-preview"
        />
    );
};

const OUTCOMES: DiaryOutcome[] = ['pending', 'manifested', 'partial', 'failed'];

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const Grimoire: React.FC<GrimoireProps> = ({ onClose, captureCurrent, onEngage, onAwaken }) => {
    const [tab, setTab] = useState<Tab>('sigils');
    const [grimoire, setGrimoire] = useState<GrimoireData>(() => loadGrimoire());

    // Capture forms
    const [sigilIntent, setSigilIntent] = useState('');
    const [diaryTitle, setDiaryTitle] = useState('');
    const [diaryBody, setDiaryBody] = useState('');
    const [diarySigilId, setDiarySigilId] = useState('');
    const [notice, setNotice] = useState('');
    const [showServitorWizard, setShowServitorWizard] = useState(false);

    const sigils = grimoire.records.filter((r): r is SigilRecord => r.kind === 'sigil');
    const diary = grimoire.records.filter((r): r is DiaryRecord => r.kind === 'diary');
    const servitors = grimoire.records.filter((r): r is ServitorRecord => r.kind === 'servitor');

    const flash = (msg: string) => {
        setNotice(msg);
        setTimeout(() => setNotice(''), 2500);
    };

    const captureSigil = () => {
        if (!sigilIntent.trim()) return;
        const { ritualLink, state } = captureCurrent();
        const record: SigilRecord = {
            kind: 'sigil',
            id: newId(),
            intent: sigilIntent.trim(),
            createdAt: Date.now(),
            moonPhase: moonPhase().phase,
            ritualLink,
            state,
        };
        setGrimoire(addRecord(record));
        setSigilIntent('');
        flash('Sigil bound to the grimoire.');
    };

    const addServitor = (draft: ServitorDraft) => {
        const { ritualLink, state } = captureCurrent();
        const record: ServitorRecord = {
            kind: 'servitor',
            id: newId(),
            createdAt: Date.now(),
            moonPhase: moonPhase().phase,
            homeWorld: state,
            ritualLink,
            ...draft,
        };
        setGrimoire(addRecord(record));
        setShowServitorWizard(false);
        flash(`${record.name} has been housed in this world.`);
    };

    const addDiaryEntry = () => {
        if (!diaryTitle.trim()) return;
        const record: DiaryRecord = {
            kind: 'diary',
            id: newId(),
            createdAt: Date.now(),
            title: diaryTitle.trim(),
            body: diaryBody.trim(),
            moonPhase: moonPhase().phase,
            outcome: 'pending',
            outcomeAt: null,
            sigilId: diarySigilId || null,
        };
        setGrimoire(addRecord(record));
        setDiaryTitle(''); setDiaryBody(''); setDiarySigilId('');
        flash('Entry inscribed.');
    };

    const cycleOutcome = (rec: DiaryRecord) => {
        const next = OUTCOMES[(OUTCOMES.indexOf(rec.outcome) + 1) % OUTCOMES.length];
        setGrimoire(updateRecord(rec.id, {
            outcome: next,
            outcomeAt: next === 'pending' ? null : Date.now(),
        } as Partial<DiaryRecord>));
    };

    const remove = (rec: GrimoireRecord) => {
        setGrimoire(deleteRecord(rec.id));
    };

    const handleFile = useCallback(async (file: File) => {
        try {
            setGrimoire(importJson(await file.text()));
            flash('Grimoire imported.');
        } catch {
            flash('Import failed: not a grimoire file.');
        }
    }, []);

    return (
        <div className="sigil-scribe-modal drawer-title grimoire-window" role="dialog" aria-modal="true">
            <div className="modal-content grimoire-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Grimoire</h2>
                <p className="scribe-info">
                    The permanent record of your workings: sigils, results, and servitors.
                    Stored locally; export before clearing your browser.
                </p>

                <div className="grimoire-tabs" role="tablist">
                    {(['sigils', 'diary', 'servitors'] as Tab[]).map(t => (
                        <button
                            key={t}
                            role="tab"
                            aria-selected={tab === t}
                            className={`grimoire-tab${tab === t ? ' active' : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {t === 'sigils' ? `Sigils (${sigils.length})` : t === 'diary' ? `Diary (${diary.length})` : `Servitors (${servitors.length})`}
                        </button>
                    ))}
                    <div className="grimoire-data-buttons">
                        <button className="mini secondary" onClick={downloadJson} title="Download the grimoire as JSON">Export</button>
                        <label className={`mini secondary grimoire-import-label${fsaSupported() ? '' : ' fallback'}`}>
                            Import
                            <input
                                type="file"
                                accept="application/json,.json"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleFile(f);
                                    e.currentTarget.value = '';
                                }}
                            />
                        </label>
                        {fsaSupported() && (
                            <>
                                <button className="mini secondary" onClick={async () => flash(await saveToFile() ? 'Grimoire written to file.' : 'Save cancelled.')}>
                                    Save to File
                                </button>
                                <button className="mini secondary" onClick={async () => {
                                    const g = await loadFromFile();
                                    if (g) { setGrimoire(g); flash('Grimoire loaded from file.'); }
                                    else flash('Load cancelled.');
                                }}>
                                    Load File
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {notice && <div className="grimoire-notice">{notice}</div>}

                {/* ---------- SIGILS ---------- */}
                {tab === 'sigils' && (
                    <>
                        <div className="grimoire-capture">
                            <input
                                type="text"
                                placeholder="Name this working..."
                                value={sigilIntent}
                                onChange={(e) => setSigilIntent(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && captureSigil()}
                            />
                            <button onClick={captureSigil} disabled={!sigilIntent.trim()}>Capture Current Space</button>
                        </div>
                        <div className="grimoire-list">
                            {sigils.length === 0 && <p className="grimoire-empty">No sigils bound yet. Set up a ritual space and capture it.</p>}
                            {sigils.map(rec => (
                                <div className="grimoire-record" key={rec.id}>
                                    <GrimoirePreview state={rec.state} />
                                    <div className="grimoire-record-info">
                                        <div className="grimoire-record-title">{rec.intent}</div>
                                        <div className="grimoire-record-meta">
                                            {fmtDate(rec.createdAt)} · {formatMoon(rec.createdAt)} · iter {rec.state.maxIterations}
                                        </div>
                                        <div className="grimoire-record-actions">
                                            <button className="mini" onClick={() => onEngage(rec.ritualLink)}>Engage</button>
                                            <button className="mini secondary" onClick={() => remove(rec)}>Release</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ---------- DIARY ---------- */}
                {tab === 'diary' && (
                    <>
                        <div className="grimoire-capture column">
                            <input
                                type="text"
                                placeholder="Entry title..."
                                value={diaryTitle}
                                onChange={(e) => setDiaryTitle(e.target.value)}
                            />
                            <textarea
                                className="grimoire-textarea"
                                placeholder="What was worked? What was felt? What happened?"
                                value={diaryBody}
                                onChange={(e) => setDiaryBody(e.target.value)}
                                rows={3}
                            />
                            <select value={diarySigilId} onChange={(e) => setDiarySigilId(e.target.value)}>
                                <option value="">Linked sigil: none</option>
                                {sigils.map(s => <option key={s.id} value={s.id}>{s.intent}</option>)}
                            </select>
                            <button onClick={addDiaryEntry} disabled={!diaryTitle.trim()}>Inscribe Entry</button>
                        </div>
                        <div className="grimoire-list">
                            {diary.length === 0 && <p className="grimoire-empty">The diary is blank. Record the working; record the result.</p>}
                            {diary.map(rec => {
                                const linked = rec.sigilId ? sigils.find(s => s.id === rec.sigilId) : null;
                                return (
                                    <div className="grimoire-record" key={rec.id}>
                                        <div className="grimoire-record-info">
                                            <div className="grimoire-record-title">{rec.title}</div>
                                            <div className="grimoire-record-meta">
                                                {fmtDate(rec.createdAt)} · {formatMoon(rec.createdAt)}
                                                {linked && <> · sigil: {linked.intent}</>}
                                            </div>
                                            {rec.body && <p className="grimoire-record-body">{rec.body}</p>}
                                            <div className="grimoire-record-actions">
                                                <button
                                                    className={`mini outcome-badge outcome-${rec.outcome}`}
                                                    onClick={() => cycleOutcome(rec)}
                                                    title="Click to cycle outcome"
                                                >
                                                    {rec.outcome === 'pending' ? '◌ PENDING' : rec.outcome === 'manifested' ? '✧ MANIFESTED' : rec.outcome === 'partial' ? '◐ PARTIAL' : '✕ FAILED'}
                                                </button>
                                                <button className="mini secondary" onClick={() => remove(rec)}>Burn</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* ---------- SERVITORS ---------- */}
                {tab === 'servitors' && (
                    <>
                        <div className="grimoire-capture">
                            <button onClick={() => setShowServitorWizard(true)} className="servitor-forge-button">
                                ⚡ Forge a Servitor…
                            </button>
                        </div>
                        <div className="grimoire-list">
                            {servitors.length === 0 && <p className="grimoire-empty">No servitors bound. Forge one and house it in a world.</p>}
                            {servitors.map(rec => (
                                <div className="grimoire-record" key={rec.id}>
                                    {rec.sigilDataUrl
                                        ? <img src={rec.sigilDataUrl} alt={`${rec.name} sigil`} className="servitor-sigil-thumb" />
                                        : <GrimoirePreview state={rec.homeWorld} />}
                                    <div className="grimoire-record-info">
                                        <div className="grimoire-record-title">{rec.name}</div>
                                        <div className="grimoire-record-meta">
                                            {fmtDate(rec.createdAt)} · {formatMoon(rec.createdAt)}
                                            {rec.tonePreset && rec.tonePreset !== '__silent__' && rec.toneFamily
                                                ? <> · key: {rec.toneFamily === 'solfeggio' ? '♫' : '≋'} {rec.tonePreset}</>
                                                : <> · silent</>}
                                        </div>
                                        <div className="grimoire-record-purpose">{rec.purpose}</div>
                                        {rec.duties && <p className="grimoire-record-body">{rec.duties}</p>}
                                        {(rec.lifespan || rec.feeding) && (
                                            <div className="servitor-terms">
                                                {rec.lifespan && <span>⏳ {rec.lifespan}</span>}
                                                {rec.feeding && <span>🍖 {rec.feeding}</span>}
                                            </div>
                                        )}
                                        <div className="grimoire-record-actions">
                                            <button className="mini servitor-awaken" onClick={() => onAwaken(rec)}>⚡ Awaken</button>
                                            {rec.ritualLink
                                                ? <button className="mini secondary" onClick={() => rec.ritualLink && onEngage(rec.ritualLink)}>Home World</button>
                                                : <button className="mini secondary" disabled>No Home World</button>}
                                            <button className="mini secondary" onClick={() => remove(rec)}>Dismiss</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {showServitorWizard && (
                            <ServitorWizard
                                onClose={() => setShowServitorWizard(false)}
                                onCreate={addServitor}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
