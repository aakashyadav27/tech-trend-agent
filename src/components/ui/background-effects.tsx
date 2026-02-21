"use client";
import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export function BackgroundBeams({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let beams: Array<{
            x: number;
            y: number;
            dx: number;
            dy: number;
            life: number;
            maxLife: number;
            hue: number;
        }> = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        const createBeam = () => {
            const side = Math.random();
            let x: number, y: number, dx: number, dy: number;
            if (side < 0.25) {
                x = Math.random() * canvas.width;
                y = 0;
                dx = (Math.random() - 0.5) * 2;
                dy = Math.random() * 2 + 0.5;
            } else if (side < 0.5) {
                x = canvas.width;
                y = Math.random() * canvas.height;
                dx = -(Math.random() * 2 + 0.5);
                dy = (Math.random() - 0.5) * 2;
            } else if (side < 0.75) {
                x = Math.random() * canvas.width;
                y = canvas.height;
                dx = (Math.random() - 0.5) * 2;
                dy = -(Math.random() * 2 + 0.5);
            } else {
                x = 0;
                y = Math.random() * canvas.height;
                dx = Math.random() * 2 + 0.5;
                dy = (Math.random() - 0.5) * 2;
            }
            const maxLife = 150 + Math.random() * 100;
            return { x, y, dx, dy, life: 0, maxLife, hue: 200 + Math.random() * 60 };
        };

        for (let i = 0; i < 8; i++) {
            beams.push(createBeam());
        }

        const animate = () => {
            ctx.fillStyle = "rgba(9, 9, 11, 0.08)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            beams.forEach((beam, i) => {
                beam.x += beam.dx;
                beam.y += beam.dy;
                beam.life++;

                const progress = beam.life / beam.maxLife;
                const alpha = progress < 0.1 ? progress * 10 : progress > 0.9 ? (1 - progress) * 10 : 1;

                ctx.beginPath();
                ctx.moveTo(beam.x - beam.dx * 30, beam.y - beam.dy * 30);
                ctx.lineTo(beam.x, beam.y);
                ctx.strokeStyle = `hsla(${beam.hue}, 80%, 60%, ${alpha * 0.3})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(beam.x, beam.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${beam.hue}, 80%, 70%, ${alpha * 0.6})`;
                ctx.fill();

                if (beam.life >= beam.maxLife ||
                    beam.x < -50 || beam.x > canvas.width + 50 ||
                    beam.y < -50 || beam.y > canvas.height + 50) {
                    beams[i] = createBeam();
                }
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`pointer-events-none fixed inset-0 z-0 ${className || ""}`}
        />
    );
}

export function SpotlightEffect() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-b from-cyan-500/10 via-blue-500/5 to-transparent blur-3xl" />
            <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-purple-500/5 blur-3xl" />
            <div className="absolute left-0 bottom-1/4 h-[300px] w-[300px] rounded-full bg-emerald-500/5 blur-3xl" />
        </div>
    );
}

export function GridPattern() {
    return (
        <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]">
            <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
        </div>
    );
}

export function FloatingParticles() {
    const [particles, setParticles] = React.useState<Array<{
        id: number;
        x: number;
        y: number;
        size: number;
        duration: number;
        delay: number;
    }>>([]);

    useEffect(() => {
        setParticles(
            Array.from({ length: 20 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 3 + 1,
                duration: Math.random() * 20 + 15,
                delay: Math.random() * 10,
            }))
        );
    }, []);

    if (particles.length === 0) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-cyan-400/20"
                    style={{
                        width: p.size,
                        height: p.size,
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                    }}
                    animate={{
                        y: [0, -100, 0],
                        x: [0, Math.random() * 50 - 25, 0],
                        opacity: [0, 0.6, 0],
                    }}
                    transition={{
                        duration: p.duration,
                        repeat: Infinity,
                        delay: p.delay,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}
