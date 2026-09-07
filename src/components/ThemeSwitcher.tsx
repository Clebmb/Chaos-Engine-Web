import React, { useEffect, useRef, useState } from 'react';
import { THEMES, getStoredTheme, setTheme } from '../lib/themes';

/** Pixel-flavored paintbrush glyph, drawn on a 16px grid. */
const BrushIcon: React.FC = () => (
    <svg
        viewBox="0 0 16 16"
        width="15"
        height="15"
        aria-hidden="true"
        shapeRendering="crispEdges"
        focusable="false"
    >
        {/* handle (diagonal) */}
        <path
            d="M9.5 2.5 L13.5 6.5 L8 12 L4 12 L4 8 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
        />
        {/* ferrule line */}
        <path d="M8.4 3.6 L12.4 7.6" stroke="currentColor" strokeWidth="1" />
        {/* bristle tip */}
        <path
            d="M4 12 C2.2 12.4 1.4 13.4 1.2 14.8 C2.8 14.8 4.6 14.2 5.6 13 L4 12 Z"
            fill="currentColor"
            stroke="none"
        />
    </svg>
);

const ThemeSwitcher: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState<string>(() => getStoredTheme());
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="theme-switcher" ref={rootRef}>
            <button
                type="button"
                className="theme-brush"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Choose theme"
                title="Themes"
            >
                <BrushIcon />
            </button>

            {open && (
                <div className="theme-menu" role="menu" aria-label="Theme menu">
                    <div className="theme-menu-title">◆ SELECT SKIN ◆</div>
                    {THEMES.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={t.id === current}
                            className={`theme-item${t.id === current ? ' active' : ''}`}
                            onClick={() => {
                                setTheme(t.id);
                                setCurrent(t.id);
                                setOpen(false);
                            }}
                        >
                            <span className="theme-swatch" aria-hidden="true">
                                <i style={{ background: t.swatch[0] }} />
                                <i style={{ background: t.swatch[1] }} />
                                <i style={{ background: t.swatch[2] }} />
                            </span>
                            <span className="theme-item-text">
                                <span className="theme-item-label">{t.label}</span>
                            </span>
                            {t.id === current && (
                                <span className="theme-item-mark" aria-hidden="true">◆</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ThemeSwitcher;
