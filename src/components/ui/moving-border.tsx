"use client";
import React from "react";
import { motion } from "framer-motion";

interface MovingBorderButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    type?: "button" | "submit";
}

export function MovingBorderButton({
    children,
    onClick,
    disabled,
    className,
    type = "button",
}: MovingBorderButtonProps) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`relative group overflow-hidden rounded-xl px-8 py-3 font-semibold text-white transition-all 
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-105 active:scale-95"}
        ${className || ""}`}
        >
            {/* Animated gradient border */}
            <motion.span
                className="absolute inset-0 rounded-xl block"
                style={{
                    background: "linear-gradient(90deg, #06b6d4, #8b5cf6, #06b6d4, #8b5cf6)",
                    backgroundSize: "300% 100%",
                    padding: "2px",
                }}
                animate={{
                    backgroundPosition: ["0% 0%", "100% 0%", "0% 0%"],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                }}
            >
                <span className="block h-full w-full rounded-[10px] bg-zinc-950" />
            </motion.span>

            {/* Inner glow on hover */}
            <span className="block absolute inset-[2px] rounded-[10px] bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Content */}
            <span className="relative z-10 flex items-center gap-2">
                {children}
            </span>
        </button>
    );
}
