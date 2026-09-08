declare module 'gif.js' {
    interface GIFOptions {
        workers?: number;
        quality?: number;
        workerScript?: string;
        width?: number;
        height?: number;
    background?: string;
    /** Packed RGB (0xRRGGBB) treated as the transparent palette index. */
    transparent?: number | null;
    repeat?: number;
        dither?: boolean | string;
    }

    type GIFListener = (...args: any[]) => void;

    export default class GIF {
        constructor(options?: GIFOptions);
        on(event: string, listener: GIFListener): void;
        addFrame(
            image: CanvasImageSource | ImageData,
            options?: { copy?: boolean; delay?: number }
        ): void;
        render(): void;
        abort(): void;
    }
}

declare module '*?url' {
    const url: string;
    export default url;
}
