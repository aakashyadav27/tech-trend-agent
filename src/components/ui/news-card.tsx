"use client";
import React from "react";
import { motion } from "framer-motion";

interface NewsItem {
    title: string;
    source: string;
    summary: string;
    url: string;
    relevance: number;
    publishedAt: string;
    category: string;
    impactLevel?: "critical" | "high" | "medium" | "low";
}

interface HoverCardProps {
    item: NewsItem;
    index: number;
}

function ImpactBadge({ level }: { level?: string }) {
    if (!level) return null;

    const colors = {
        critical: "border-red-500/50 bg-red-500/10 text-red-400",
        high: "border-orange-500/50 bg-orange-500/10 text-orange-400",
        medium: "border-blue-500/50 bg-blue-500/10 text-blue-400",
        low: "border-zinc-500/50 bg-zinc-500/10 text-zinc-400",
    };

    const config = colors[level as keyof typeof colors] || colors.low;

    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${config}`}>
            {level} Impact
        </span>
    );
}

function RelevanceBadge({ score }: { score: number }) {
    const color =
        score >= 8
            ? "from-emerald-500 to-green-400"
            : score >= 5
                ? "from-cyan-500 to-blue-400"
                : "from-amber-500 to-yellow-400";

    return (
        <div
            className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${color} px-2 py-0.5 text-[11px] font-bold text-white shadow-lg`}
        >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {score}/10
        </div>
    );
}

function CategoryTag({ category }: { category: string }) {
    return (
        <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400 backdrop-blur-sm">
            {category}
        </span>
    );
}

export function NewsHoverCard({ item, index }: HoverCardProps) {
    return (
        <motion.a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                duration: 0.5,
                delay: index * 0.08,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{ y: -4, scale: 1.01 }}
            className="group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5 backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(6,182,212,0.08)]"
        >
            {/* Top gradient line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CategoryTag category={item.category} />
                    <ImpactBadge level={item.impactLevel} />
                    <RelevanceBadge score={item.relevance} />
                </div>
                <span className="shrink-0 text-[11px] text-zinc-600">
                    {formatTime(item.publishedAt)}
                </span>
            </div>

            {/* Title */}
            <h3 className="mb-2 text-[15px] font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-cyan-300">
                {item.title}
            </h3>

            {/* Summary */}
            <p className="mb-3 text-[13px] leading-relaxed text-zinc-400 line-clamp-3">
                {item.summary}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-white">
                            {item.source.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <span className="text-[12px] font-medium text-zinc-500">
                        {item.source}
                    </span>
                </div>

                <motion.div
                    className="flex items-center gap-1 text-[12px] text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100"
                    initial={false}
                >
                    Read more
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                </motion.div>
            </div>
        </motion.a>
    );
}

function formatTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHrs < 1) return "Just now";
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        return `${diffDays}d ago`;
    } catch {
        return dateStr;
    }
}

export function NewsCardSkeleton({ index }: { index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className="rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-5 backdrop-blur-sm"
        >
            <div className="mb-3 flex items-center gap-2">
                <div className="h-5 w-12 animate-pulse rounded-md bg-zinc-800" />
                <div className="h-5 w-14 animate-pulse rounded-full bg-zinc-800" />
            </div>
            <div className="mb-2 h-5 w-4/5 animate-pulse rounded bg-zinc-800" />
            <div className="mb-1 h-4 w-full animate-pulse rounded bg-zinc-800/60" />
            <div className="mb-1 h-4 w-3/4 animate-pulse rounded bg-zinc-800/60" />
            <div className="mb-3 h-4 w-1/2 animate-pulse rounded bg-zinc-800/60" />
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-pulse rounded-full bg-zinc-800" />
                <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/60" />
            </div>
        </motion.div>
    );
}
