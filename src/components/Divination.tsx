import React, { useState } from 'react';
import {
    castGeomancy, castRunes, castTarot, castIChing,
    type GeoReading, type RuneDraw, type TarotDraw, type IchingReading,
    type GeoFigure, trigramName, ICHING_TRIGRAMS,
} from '../lib/divination';
import { lastEntropySource } from '../lib/entropy';

type System = 'geomancy' | 'runes' | 'tarot' | 'iching';

const GEO_ELEMENT_ROWS = ['Fire', 'Air', 'Water', 'Earth'];

/** A geomantic figure rendered as its actual dotted lines. */
const GeoGlyph: React.FC<{ fig: GeoFigure; label?: boolean }> = ({ fig, label = false }) => (
    <div className="div-geo-glyph" title={label ? undefined : `${fig.name} — ${fig.latin}`}>
        <div className="div-geo-lines" role="img" aria-label={`${fig.name}: ${fig.lines.map((l, i) => `${GEO_ELEMENT_ROWS[i]} ${l ? 'active' : 'passive'}`).join(', ')}`}>
            {fig.lines.map((l, i) => (
                <span key={i} className={`div-geo-row${l ? ' active' : ''}`} data-row={GEO_ELEMENT_ROWS[i]}>
                    {l ? '•' : '••'}
                </span>
            ))}
        </div>
        {label && <span className="div-geo-name">{fig.name}</span>}
    </div>
);

/** Runic stone with the stave glyph. */
const RuneStone: React.FC<{ glyph: string; name: string; reversed: boolean }> = ({ glyph, name, reversed }) => (
    <div className={`div-rune-stone${reversed ? ' reversed' : ''}`} title={name}>
        <span className="div-rune-glyph">{glyph}</span>
    </div>
);

/** I Ching line stack, bottom→top; changing lines get a marker. */
const HexLines: React.FC<{ lines: number[]; changing?: number[] }> = ({ lines, changing = [] }) => (
    <div className="div-hex-lines" role="img" aria-label={`${lines.length} lines`}>
        {[...lines].reverse().map((v, i) => {
            const idx = lines.length - 1 - i;
            return (
                <span
                    key={i}
                    className={`div-hex-line${v ? ' yang' : ''}${changing.includes(idx) ? ' changing' : ''}`}
                    title={`Line ${idx + 1}${changing.includes(idx) ? ' — changing' : ''}`}
                />
            );
        })}
    </div>
);

const SYSTEMS: Array<{ id: System; label: string }> = [
    { id: 'geomancy', label: 'Geomancy' },
    { id: 'runes', label: 'Runes' },
    { id: 'tarot', label: 'Tarot' },
    { id: 'iching', label: 'I Ching' },
];

export const Divination: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [tab, setTab] = useState<System>('geomancy');
    const [reading, setReading] = useState<GeoReading | RuneDraw | TarotDraw | IchingReading | null>(null);
    const [source, setSource] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [spread, setSpread] = useState<'single' | 'three'>('single');

    const cast = async () => {
        setBusy(true);
        setReading(null);
        // brief pause so the "casting" state reads as a beat of ritual
        await new Promise(r => setTimeout(r, 350));
        try {
            let r: typeof reading;
            if (tab === 'geomancy') r = await castGeomancy();
            else if (tab === 'runes') r = await castRunes(spread === 'three' ? 'norns' : 'single');
            else if (tab === 'tarot') r = await castTarot(spread as 'single' | 'three');
            else r = await castIChing();
            setReading(r);
            setSource(lastEntropySource());
        } finally {
            setBusy(false);
        }
    };

    const isGeo = (r: typeof reading): r is GeoReading => !!r && 'judge' in r;
    const isRune = (r: typeof reading): r is RuneDraw => !!r && 'stones' in r;
    const isTarot = (r: typeof reading): r is TarotDraw => !!r && 'cards' in r;
    const isIching = (r: typeof reading): r is IchingReading => !!r && 'primary' in r;

    return (
        <div className="sigil-scribe-modal drawer-title divination-window" role="dialog" aria-modal="true">
            <div className="modal-content divination-content">
                <button className="close-button" onClick={onClose} aria-label="Close">&times;</button>
                <h2>Divination</h2>
                <p className="scribe-info">
                    Four oracles, one stream of entropy. Every cast draws fresh randomness
                    from the same source as the Quantum Seed.
                    {source && (
                        <span className="div-source-seal" title={source === 'BEACON' ? 'drand League of Entropy beacon' : 'browser cryptographic random'}>
                            {source === 'BEACON' ? '◈ BEACON SEALED' : '◈ CSPRNG SEALED'}
                        </span>
                    )}
                </p>

                <div className="div-tabs" role="tablist">
                    {SYSTEMS.map(s => (
                        <button
                            key={s.id}
                            role="tab"
                            aria-selected={tab === s.id}
                            className={`div-tab${tab === s.id ? ' active' : ''}`}
                            onClick={() => { setTab(s.id); setReading(null); }}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {(tab === 'runes' || tab === 'tarot') && (
                    <div className="div-spread-row">
                        <span className="div-spread-label">Spread:</span>
                        <button className={`mini${spread === 'single' ? ' active' : ''}`} onClick={() => { setSpread('single'); setReading(null); }}>Single</button>
                        <button className={`mini${spread === 'three' ? ' active' : ''}`} onClick={() => { setSpread('three'); setReading(null); }}>Three</button>
                    </div>
                )}

                <button className="div-cast-button" onClick={cast} disabled={busy}>
                    {busy ? 'CASTING…' : reading ? 'CAST AGAIN' : 'CAST'}
                </button>

                {busy && <div className="div-casting-note"> Consulting the stream… </div>}

                {reading && isGeo(reading) && (
                    <div className="div-reading">
                        <div className="div-shield-chart">
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Mothers</span></div>
                                {reading.mothers.map((m, i) => <div className="div-shield-cell" key={`m${i}`}><GeoGlyph fig={m} /><span className="div-cell-name">{m.name}</span></div>)}
                            </div>
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Daughters</span></div>
                                {reading.daughters.map((d, i) => <div className="div-shield-cell" key={`d${i}`}><GeoGlyph fig={d} /><span className="div-cell-name">{d.name}</span></div>)}
                            </div>
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Nieces</span></div>
                                {reading.nieces.map((n, i) => <div className="div-shield-cell" key={`n${i}`}><GeoGlyph fig={n} /><span className="div-cell-name">{n.name}</span></div>)}
                            </div>
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Witnesses</span></div>
                                {reading.witnesses.map((w, i) => <div className="div-shield-cell" key={`w${i}`}><GeoGlyph fig={w} /><span className="div-cell-name">{w.name}</span></div>)}
                            </div>
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Judge</span></div>
                                <div className="div-shield-cell"><GeoGlyph fig={reading.judge} /><span className="div-cell-name">{reading.judge.name}</span></div>
                                <div className="div-shield-cell head"><span className="div-cell-tag">Requerant</span></div>
                                <div className="div-shield-cell"><GeoGlyph fig={reading.requerant} /><span className="div-cell-name">{reading.requerant.name}</span></div>
                            </div>
                            <div className="div-shield-row">
                                <div className="div-shield-cell head"><span className="div-cell-tag">Sentence</span></div>
                                <div className="div-shield-cell"><GeoGlyph fig={reading.sentence} /><span className="div-cell-name">{reading.sentence.name}</span></div>
                            </div>
                        </div>

                        <div className="div-geo-interpretation">
                            <h3>{reading.judge.name} — {reading.judge.latin}</h3>
                            <p className="div-omen-line">{reading.judge.omen} · {reading.judge.planet} · {reading.judge.sign} · {reading.judge.element} · {reading.judge.quality}</p>
                            <p>{reading.judge.meaning}</p>
                            <p className="div-sentence-line"><strong>Sentence:</strong> {reading.sentence.name} — {reading.sentence.meaning}</p>
                        </div>
                    </div>
                )}

                {reading && isRune(reading) && (
                    <div className="div-reading">
                        <div className="div-rune-row">
                            {reading.stones.map((s, i) => (
                                <div className="div-rune-slot" key={i}>
                                    <span className="div-position-label">{s.position}</span>
                                    <RuneStone glyph={s.rune.glyph} name={s.rune.name} reversed={s.reversed} />
                                    <span className="div-rune-name">{s.rune.name}{s.reversed ? ' (merkstave)' : ''}</span>
                                    <p className="div-rune-meaning">{s.reversed ? s.rune.merkstave : s.rune.meaning}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {reading && isTarot(reading) && (
                    <div className="div-reading">
                        <div className="div-tarot-row">
                            {reading.cards.map((c, i) => (
                                <div className={`div-tarot-card${c.reversed ? ' reversed' : ''}`} key={i}>
                                    <div className="div-tarot-face">
                                        <span className="div-tarot-arcana">{c.card.arcana === 'major' ? `ARCANA ${c.card.number! + 1}` : c.card.suit?.toUpperCase()}</span>
                                        <span className="div-tarot-name">{c.card.name}</span>
                                        <span className="div-tarot-reversed">{c.reversed ? 'INVERTED' : 'UPRIGHT'}</span>
                                    </div>
                                    <p className="div-tarot-keywords">{c.card.keywords}</p>
                                    <span className="div-position-label">{c.position}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {reading && isIching(reading) && (
                    <div className="div-reading">
                        <div className="div-iching-row">
                            <div className="div-iching-block">
                                <span className="div-position-label">The Situation</span>
                                <div className="div-iching-figure">
                                    <HexLines lines={reading.primary.lines} changing={reading.changing} />
                                    <span className="div-hex-glyph">{reading.primary.glyph}</span>
                                </div>
                                <span className="div-hex-title">#{reading.primary.number} {reading.primary.name}</span>
                                <span className="div-hex-chinese">{reading.primary.chinese} · {trigramName(reading.primary.lines, false)} below, {trigramName(reading.primary.lines, true)} above ({ICHING_TRIGRAMS[trigramName(reading.primary.lines, true)]?.nature})</span>
                            </div>
                            {reading.secondary && (
                                <div className="div-iching-block">
                                    <span className="div-position-label">Moving Toward</span>
                                    <div className="div-iching-figure">
                                        <HexLines lines={reading.secondary.lines} />
                                        <span className="div-hex-glyph">{reading.secondary.glyph}</span>
                                    </div>
                                    <span className="div-hex-title">#{reading.secondary.number} {reading.secondary.name}</span>
                                    <span className="div-hex-chinese">{reading.secondary.chinese}</span>
                                </div>
                            )}
                        </div>
                        <div className="div-iching-tosses">
                            Coin tosses (bottom→top): {reading.tosses.map(v => <span key={v + Math.random()} className="div-toss">{v}</span>)}
                            {reading.changing.length > 0 && (
                                <span className="div-changing-note">
                                    {' '}— lines {reading.changing.map(i => i + 1).join(', ')} in motion
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Divination;
