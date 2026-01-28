import React, { useState, useRef, useEffect } from 'react';

interface OverlaySystemProps {
    url: string | null;
    size: number;
    pos: { x: number; y: number };
    motion: 'none' | 'random' | 'bounce';
    speed: number;
    onPosChange: (pos: { x: number; y: number }) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    isAnimating: boolean;
}

const OverlaySystem: React.FC<OverlaySystemProps> = ({
    url,
    size,
    pos,
    motion,
    speed,
    onPosChange,
    containerRef,
    isAnimating
}) => {
    const [localPos, setLocalPos] = useState(pos);
    const [opacity, setOpacity] = useState(1);
    const [isDragging, setIsDragging] = useState(false);

    const velocityRef = useRef({ x: 1, y: 1 });
    const randomTimerRef = useRef<number>(0);
    const dragOffset = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (motion === 'none') {
            setLocalPos(pos);
            setOpacity(1);
        }
    }, [pos, motion]);

    useEffect(() => {
        if (!url || motion === 'none' || !isAnimating) {
            setOpacity(1);
            return;
        }

        let animationFrame: number;
        let lastTime: number | null = null;

        const update = (time: number) => {
            if (lastTime === null) {
                lastTime = time;
                animationFrame = requestAnimationFrame(update);
                return;
            }
            const dt = Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;

            if (motion === 'bounce') {
                const container = containerRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        setLocalPos(prev => {
                            const speedPx = speed * 100; // Speed in pixels per second

                            let nextX = prev.x + (velocityRef.current.x * speedPx * dt / rect.width) * 100;
                            let nextY = prev.y + (velocityRef.current.y * speedPx * dt / rect.height) * 100;

                            let vx = velocityRef.current.x;
                            let vy = velocityRef.current.y;

                            const halfSizePctX = (size / 2 / rect.width) * 100;
                            const halfSizePctY = (size / 2 / rect.height) * 100;

                            // Collision detection with clamping
                            if (nextX < halfSizePctX) {
                                nextX = halfSizePctX;
                                vx = Math.abs(vx);
                            } else if (nextX > 100 - halfSizePctX) {
                                nextX = 100 - halfSizePctX;
                                vx = -Math.abs(vx);
                            }

                            if (nextY < halfSizePctY) {
                                nextY = halfSizePctY;
                                vy = Math.abs(vy);
                            } else if (nextY > 100 - halfSizePctY) {
                                nextY = 100 - halfSizePctY;
                                vy = -Math.abs(vy);
                            }

                            velocityRef.current = { x: vx, y: vy };
                            return { x: nextX, y: nextY };
                        });
                        setOpacity(1);
                    }
                }
            } else if (motion === 'random') {
                randomTimerRef.current += dt;
                const interval = 2.0 / (speed + 0.1);

                const progress = randomTimerRef.current / interval;
                setOpacity(progress < 0.8 ? 1 : 0);

                if (randomTimerRef.current >= interval) {
                    randomTimerRef.current = 0;
                    const container = containerRef.current;
                    if (container) {
                        const rect = container.getBoundingClientRect();
                        const halfSizePctX = (size / 2 / rect.width) * 100;
                        const halfSizePctY = (size / 2 / rect.height) * 100;

                        setLocalPos({
                            x: halfSizePctX + Math.random() * (100 - 2 * halfSizePctX),
                            y: halfSizePctY + Math.random() * (100 - 2 * halfSizePctY)
                        });
                    }
                }
            }

            animationFrame = requestAnimationFrame(update);
        };

        animationFrame = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(animationFrame);
        };
    }, [url, motion, speed, isAnimating, size, containerRef]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (motion !== 'none') return;
        setIsDragging(true);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - (rect.left + rect.width / 2),
            y: e.clientY - (rect.top + rect.height / 2)
        };
        e.stopPropagation();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();

            const newX = ((e.clientX - containerRect.left - dragOffset.current.x) / containerRect.width) * 100;
            const newY = ((e.clientY - containerRect.top - dragOffset.current.y) / containerRect.height) * 100;

            const clampedX = Math.max(0, Math.min(100, newX));
            const clampedY = Math.max(0, Math.min(100, newY));

            setLocalPos({ x: clampedX, y: clampedY });
        };

        const handleMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                onPosChange(localPos);
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, containerRef, localPos, onPosChange]);

    if (!url) return null;

    return (
        <div
            className={`overlay-image-container ${motion !== 'none' ? 'auto-motion' : ''}`}
            style={{
                left: `${localPos.x}%`,
                top: `${localPos.y}%`,
                width: `${size}px`,
                height: 'auto',
                position: 'absolute',
                transform: 'translate(-50%, -50%)',
                pointerEvents: motion === 'none' ? 'auto' : 'none',
                cursor: motion === 'none' ? (isDragging ? 'grabbing' : 'grab') : 'default',
                zIndex: 5,
                opacity: opacity,
                transition: motion === 'bounce' ? 'none' : 'opacity 0.1s ease-out'
            }}
            onMouseDown={handleMouseDown}
        >
            <img
                src={url}
                alt="Overlay"
                style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none', pointerEvents: 'none' }}
            />
        </div>
    );
};

export default OverlaySystem;
