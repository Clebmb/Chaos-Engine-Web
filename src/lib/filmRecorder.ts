/**
 * Ritual Film — WebM/MP4 export of a fractal flight via MediaRecorder.
 *
 * The moving counterpart to the ritual card: the app drives a zoom dive or
 * Julia morph each frame while this module pipes the canvas into a
 * MediaRecorder. Per-frame motion lives in App.tsx (it must ride the render
 * loop); this module only handles stream capture, codec selection, and the
 * final download. MP4 is preferred where the browser can mux it (Safari),
 * WebM/VP9 or VP8 elsewhere.
 */

export interface FilmSession {
    /** Mime type actually negotiated (drives the file extension). */
    mimeType: string;
    /** File name for the download. */
    fileName: string;
    /** Stop recording, assemble the blob, and trigger the download. */
    stop: () => Promise<void>;
    /** Abandon without downloading (e.g. banished mid-flight). */
    abort: () => void;
}

/** Pick the best video codec this browser can record, in order of preference. */
function pickMime(): string | null {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ];
    for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return null;
}

/** True when the browser can record canvas video at all. */
export function filmSupported(): boolean {
    if (typeof MediaRecorder === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return typeof canvas.captureStream === 'function' && pickMime() !== null;
}

export function filmFileExtension(mimeType: string): string {
    return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * Begin recording `canvas` at up to 60fps. Returns a session whose `stop()`
 * finalizes the file and downloads it. Recording continues until stopped —
 * the caller owns the flight duration.
 */
export function startFilm(canvas: HTMLCanvasElement, fps = 60): FilmSession | null {
    const mimeType = pickMime();
    if (!mimeType || typeof canvas.captureStream !== 'function') return null;

    const stream = canvas.captureStream(fps);
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    } catch {
        return null;
    }
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(250);

    const cleanup = () => {
        stream.getTracks().forEach(t => t.stop());
    };

    const fileName = `ritual_film_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${filmFileExtension(mimeType)}`;

    return {
        mimeType,
        fileName,
        stop: () => new Promise<void>((resolve) => {
            recorder.onstop = () => {
                cleanup();
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = fileName;
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 8000);
                resolve();
            };
            if (recorder.state !== 'inactive') recorder.stop();
            else { cleanup(); resolve(); }
        }),
        abort: () => {
            if (recorder.state !== 'inactive') {
                recorder.onstop = null as unknown as () => void;
                try { recorder.stop(); } catch { /* already stopped */ }
            }
            cleanup();
        },
    };
}
