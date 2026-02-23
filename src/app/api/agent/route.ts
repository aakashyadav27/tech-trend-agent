import { NextRequest, NextResponse } from "next/server";
import { AzureChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { allSearchTools } from "@/lib/search-tools";

export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1 PROMPT — RESEARCHER
// Only goal: fetch raw data from tools. Do NOT summarise or produce JSON.
// ═══════════════════════════════════════════════════════════════════════════════

const RESEARCHER_PROMPT = `You are a raw data collector for a tech news pipeline.

═══════════════════════════════════════════════
🔒 STRICT RULES — NEVER VIOLATE
═══════════════════════════════════════════════
- Your ONLY job is to call tools and collect raw data. Do NOT write summaries.
- Do NOT format or structure any output.
- Do NOT add any commentary, analysis, or JSON.
- When you have finished calling all tools, output exactly one word: DONE
═══════════════════════════════════════════════

You have these search tools:
SEARCH: duckduckgo_search, duckduckgo_news, google_news_rss
COMMUNITY: hackernews_search, reddit_search, devto_articles, lobsters_search
RSS: read_rss_feed — give it any website URL to discover and read its RSS/Atom feed
CODE: github_trending
VIDEO: youtube_search, youtube_channel_videos

COLLECTION STRATEGY — be extremely aggressive:
1. Make as many PARALLEL tool calls as the task requires.
   - 10-15 read_rss_feed calls on OFFICIAL framework/library websites for this role.
   - 5-8 google_news_rss or duckduckgo_news queries using TECHNICAL terms.
   - 4-6 hackernews_search, reddit_search, or devto_articles for community discussions.
   - 1-2 github_trending filtered by primary language.
   - 2-4 youtube_search for high-value announcements.
2. Collect EVERYTHING from the past 24 hours. Do not filter — the next stage handles filtering.
3. When all tools are done, output exactly: DONE`;

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2 PROMPT — EXTRACTOR
// Only goal: parse raw tool outputs into structured JSON. Zero hallucination.
// ═══════════════════════════════════════════════════════════════════════════════

const EXTRACTOR_PROMPT = `You are a structured data extractor for a tech news pipeline.

═══════════════════════════════════════════════
🔒 GROUNDING RULES — NEVER VIOLATE
═══════════════════════════════════════════════
1. You have NO tools. You CANNOT search the web or call any APIs.
2. TOOL OUTPUTS ARE YOUR ONLY SOURCE OF TRUTH.
   Every field you write MUST come from the raw text provided to you below.
   Do NOT use your internal training knowledge to fill in any field.
3. NEVER INVENT DATES. Use only dates present in the raw text. If absent, use "today".
4. NEVER WRITE A SUMMARY YOU CANNOT CITE.
   If only a title was returned with no body text, write: "No further detail available from source."
5. NEVER ADD ITEMS FROM MEMORY. Only items explicitly present in the raw tool output below.
6. SKIP any item that is older than 24 hours based on its date in the raw text.
7. SKIP business news: CEO drama, funding, IPOs, acquisitions, layoffs, stock prices.
═══════════════════════════════════════════════

From the raw tool outputs below, extract all technically relevant news items and return them as a JSON array.
Target 80-150 items if sufficient news exists. Prioritise items with clear dates within the last 24 hours.

DENSITY RULES (to fit more items):
- "summary": STRICTLY 1 concise sentence from the raw text only.
- "target_audience": Max 2 items.
- "technologies": Max 3 items.
- "relevant_roles": Keep short or empty.

Schema for EACH item:
- "title": Exact headline from the raw text
- "url": Exact URL from the raw text
- "summary": 1 sentence derived ONLY from the raw text content
- "importance_score": 1-10 (10 = critical security patch or major release)
- "target_audience": Array (max 2 strings)
- "published_at": Exact date string from raw text, or "today" if none
- "is_major_announcement": Boolean
- "technologies": Array of technology names (max 3)
- "primary_role": The job role this most applies to
- "relevant_roles": Array of other impacted roles
- "source": Publication or site name from the raw text

CRITICAL: Output ONLY a valid JSON array. No markdown, no fences, no commentary.
CRITICAL: Every item MUST be backed by the raw text. Do not add anything from memory.`;

// ═══════════════════════════════════════════════════════════════════════════════
// RERANKER — post-process items by actionable technical impact
// ═══════════════════════════════════════════════════════════════════════════════

interface NewsItem {
    title: string;
    source: string;
    summary: string;
    url: string;
    relevance: number;
    publishedAt: string;
    category: string;
    impactLevel?: string;

    // Database schema fields passed through
    importance_score?: number;
    target_audience?: string[];
    is_major_announcement?: boolean;
    technologies?: string[];
    primary_role?: string;
    relevant_roles?: string[];
}

const NOISE_PATTERNS = [
    /\bceo\b/i, /\bacquisition\b/i, /\bIPO\b/i, /\blayoff/i, /\bfund(?:ing|raise)/i,
    /\bvaluation\b/i, /\bstock\s*price/i, /\bshares?\s*(?:drop|rise|fell|surge)/i,
    /\bdrama\b/i, /\bcontroversy\b/i, /\bscandal\b/i, /\blawsuit\b/i,
    /\bregulat(?:ion|ory)\b/i, /\blobby/i, /\bpolitics?\b/i, /\belection/i,
    /\bbillionaire/i, /\brich\s*list/i, /\bnet\s*worth/i,
];

function isWithin24Hours(dateStr: string): boolean {
    if (!dateStr || dateStr === "today") return true;
    try {
        const pubDate = new Date(dateStr);
        if (isNaN(pubDate.getTime())) return true;
        const hoursAgo = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
        return hoursAgo >= -0.5 && hoursAgo <= 24;
    } catch {
        return true;
    }
}

function rerank(items: NewsItem[]): NewsItem[] {
    console.log(`\n🔄 RERANKER: Processing ${items.length} items...`);

    let staleCount = 0;

    const scored = items.map((item) => {
        let isFresh = true;
        if (item.publishedAt && item.publishedAt !== "" && item.publishedAt !== "today") {
            isFresh = isWithin24Hours(item.publishedAt);
            if (!isFresh) {
                console.log(`   ⚠️  Stale (>24h): "${item.title.substring(0, 50)}" — ${item.publishedAt}`);
                staleCount++;
            }
        }

        const text = `${item.title} ${item.summary} ${item.category || ""}`;
        let score = item.relevance || 5;

        if (!isFresh) score = 0; // stale items get zeroed — hard removed below

        if (item.impactLevel === "critical") score += 3;
        else if (item.impactLevel === "high") score += 2;
        else if (item.impactLevel === "medium") score += 1;

        for (const pattern of NOISE_PATTERNS) {
            if (pattern.test(text)) { score -= 3; break; }
        }

        score = Math.max(1, Math.min(10, score));

        let impactLevel = "medium";
        if (score >= 8) impactLevel = "high";
        else if (score <= 4) impactLevel = "low";

        return { ...item, relevance: score, impactLevel, isFresh };
    });

    // HARD FILTER: stale items are removed entirely
    const filtered = scored.filter(item => (item as any).isFresh !== false);
    filtered.sort((a, b) => b.relevance - a.relevance);

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = filtered.filter((item) => {
        const key = item.url?.toLowerCase().replace(/\/$/, "") || item.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`🔄 RERANKER: ${items.length} → ${deduped.length} items (${staleCount} stale removed)`);
    if (deduped.length > 0) {
        console.log(`   Top 3: ${deduped.slice(0, 3).map((i) => `[${i.relevance}] ${i.title.substring(0, 60)}`).join(" | ")}`);
    }

    return deduped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

function logMessage(msg: BaseMessage, index: number) {
    const type = msg._getType();
    const content =
        typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content, null, 2);

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📨 MSG #${index} | ${type.toUpperCase()}`);

    if (type === "ai") {
        const aiMsg = msg as BaseMessage & {
            tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
        };
        if (content && content.length > 0 && content !== "[]" && content !== '""') {
            console.log(`🤖 ${content.substring(0, 1000)}`);
        }
        if (aiMsg.tool_calls?.length) {
            console.log(`🔧 ${aiMsg.tool_calls.length} tool calls:`);
            for (const tc of aiMsg.tool_calls) {
                console.log(`   ├─ ${tc.name}(${JSON.stringify(tc.args).substring(0, 200)})`);
            }
        }
    } else if (type === "tool") {
        const toolMsg = msg as BaseMessage & { name?: string };
        console.log(`🔨 ${toolMsg.name}: ${content.substring(0, 300)}${content.length > 300 ? "..." : ""}`);
    } else if (type === "human") {
        console.log(`👤 ${content.substring(0, 200)}`);
    } else if (type === "system") {
        console.log(`⚙️  (${content.length} chars)`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE MAPPING & SUPABASE FETCH
// ═══════════════════════════════════════════════════════════════════════════════

function mapToInternalRole(frontendRole: string): string | null {
    const role = frontendRole.toLowerCase();
    if (role.includes("frontend")) return "frontend_engineer";
    if (role.includes("backend")) return "backend_engineer";
    if (role.includes("ai") || role.includes("ml") || role.includes("data scientist")) return "ai_engineer";
    if (role.includes("devops") || role.includes("sre")) return "devops_engineer";
    if (role.includes("ux") || role.includes("ui") || role.includes("designer")) return "ui_ux_designer";
    if (role.includes("mobile") || role.includes("ios") || role.includes("android")) return "mobile_developer";
    return null;
}

async function getCuratedSources(jobRole: string): Promise<string[]> {
    const internalRole = mapToInternalRole(jobRole);
    if (!internalRole) return [];

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn("⚠️ Supabase credentials missing, skipping curated sources fetch.");
        return [];
    }

    try {
        const url = `${supabaseUrl}/rest/v1/sources?select=name,url,type&active=eq.true&roles=cs.{${encodeURIComponent('"' + internalRole + '"')}}`;
        const res = await fetch(url, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!res.ok) {
            console.error(`Supabase fetch failed: ${res.statusText}`);
            return [];
        }

        const sources = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sources.map((s: any) => `- ${s.name} (${s.type}): ${s.url}`);
    } catch (err) {
        console.error("Error fetching curated sources:", err);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Collect all tool result messages from Stage 1 history
// ═══════════════════════════════════════════════════════════════════════════════

function extractRawToolOutputs(messages: BaseMessage[]): string {
    const chunks: string[] = [];
    for (const msg of messages) {
        if (msg._getType() === "tool") {
            const toolMsg = msg as BaseMessage & { name?: string };
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            if (content && content !== "[]" && content !== "{}" && content.length > 10) {
                chunks.push(`[SOURCE: ${toolMsg.name || "tool"}]\n${content}`);
            }
        }
    }
    console.log(`\n📦 Extracted ${chunks.length} raw tool outputs (${chunks.join("").length} chars) for Stage 2`);
    return chunks.join("\n\n---\n\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        const { jobRole, projectContext } = await req.json();
        console.log(`\n${"#".repeat(80)}`);
        console.log(`# 🚀 TWO-STAGE AGENT | Role: "${jobRole}" | ${new Date().toISOString()}`);
        console.log(`${"#".repeat(80)}`);

        if (!jobRole || typeof jobRole !== "string") {
            return NextResponse.json({ error: "jobRole is required" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
        }

        // ─── Shared Azure model config ─────────────────────────────────────────
        const modelConfig = {
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiVersion: "2024-12-01-preview",
            azureOpenAIApiDeploymentName: "gpt-4.1-mini",
            azureOpenAIEndpoint: "https://uptostack-openai.openai.azure.com/",
            temperature: 0,
        };

        // ─── Curated sources from Supabase ────────────────────────────────────
        const curatedSources = await getCuratedSources(jobRole);
        let sourceInstruction = "";
        if (curatedSources.length > 0) {
            console.log(`🔗 Found ${curatedSources.length} curated sources for role.`);
            sourceInstruction = `\n\nCRITICAL: Prioritise these curated sources first:\n${curatedSources.join("\n")}\n- RSS/XML feeds → use 'read_rss_feed'.\n- Standard websites (if read_rss_feed fails) → use 'scrape_website'.\n- YouTube channel IDs (e.g., 'youtube:UCP7...') → use 'youtube_channel_videos'.`;
        } else {
            console.log(`🔗 No curated sources found. Using agentic search.`);
        }

        const contextInstruction = projectContext
            ? `\n\nCONTEXT: User is working on: "${projectContext}". Prioritise news related to these technologies.`
            : "";

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 1 — RESEARCHER
        // A ReAct agent that ONLY calls tools and collects raw data.
        // Output tokens are intentionally limited — it outputs only "DONE".
        // ═══════════════════════════════════════════════════════════════════════

        console.log(`\n${"─".repeat(80)}`);
        console.log(`🔍 STAGE 1: RESEARCHER — fetching raw data for "${jobRole}"...`);
        console.log(`${"─".repeat(80)}\n`);

        const researcherModel = new AzureChatOpenAI({ ...modelConfig, maxTokens: 4096 });
        const researcherAgent = createReactAgent({ llm: researcherModel, tools: allSearchTools });

        const stage1Result = await researcherAgent.invoke({
            messages: [
                new SystemMessage(RESEARCHER_PROMPT),
                new HumanMessage(
                    `Collect all technical news from the past 24 hours for a "${jobRole}". Today: ${new Date().toISOString().split("T")[0]}. Call as many tools as possible in parallel. Do NOT write any JSON or summaries — just run the tools and output DONE when finished.${contextInstruction}${sourceInstruction}`
                ),
            ],
        });

        console.log(`✅ Stage 1 done. ${stage1Result.messages.length} messages in trace.`);
        stage1Result.messages.forEach((msg: BaseMessage, i: number) => logMessage(msg, i));

        // ─── Extract raw tool outputs ──────────────────────────────────────────
        const rawToolData = extractRawToolOutputs(stage1Result.messages);

        if (!rawToolData || rawToolData.length < 50) {
            console.warn("⚠️  Stage 1 returned no usable tool data. Returning empty result.");
            return NextResponse.json({ newsItems: [], jobRole });
        }

        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 2 — EXTRACTOR
        // A plain LLM call with NO tools. Converts raw tool output to JSON.
        // Cannot hallucinate — it has no tools and is given only raw text.
        // ═══════════════════════════════════════════════════════════════════════

        console.log(`\n${"─".repeat(80)}`);
        console.log(`🧪 STAGE 2: EXTRACTOR — structuring ${rawToolData.length} chars of raw data...`);
        console.log(`${"─".repeat(80)}\n`);

        const extractorModel = new AzureChatOpenAI({ ...modelConfig, maxTokens: 16383 });

        const stage2Result = await extractorModel.invoke([
            new SystemMessage(EXTRACTOR_PROMPT),
            new HumanMessage(
                `Job role: "${jobRole}"\nToday: ${new Date().toISOString().split("T")[0]}\n\nRAW TOOL OUTPUTS FROM STAGE 1:\n\n${rawToolData}\n\nExtract all technically relevant news items from the raw data above and return them as a JSON array. ONLY use information present in the raw text.`
            ),
        ]);

        const stage2Content =
            typeof stage2Result.content === "string"
                ? stage2Result.content
                : JSON.stringify(stage2Result.content);

        console.log(`✅ Stage 2 done. Output length: ${stage2Content.length} chars`);

        // ─── Parse Stage 2 output ─────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any[] = [];
        try {
            const cleaned = stage2Content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            parsed = JSON.parse(cleaned);
        } catch (err) {
            console.error("❌ JSON parse failed. Attempting regex extraction...", err);
            const match = stage2Content.match(/\[[\s\S]*\]/);
            if (match) {
                try { parsed = JSON.parse(match[0]); } catch { parsed = []; }
            }
        }

        console.log(`✅ Parsed: ${parsed.length} items from Stage 2`);

        // ─── Map to legacy UI schema ──────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedItems: NewsItem[] = parsed.map((item: any) => ({
            title: item.title || "No Title",
            source: item.source || "Unknown",
            summary: item.summary || "",
            url: item.url || "#",
            relevance: item.importance_score || item.relevance || 5,
            publishedAt: item.published_at || item.publishedAt || new Date().toISOString(),
            category: (item.technologies && item.technologies.length > 0)
                ? item.technologies[0]
                : (item.category || "General"),
            impactLevel: item.impactLevel || (item.is_major_announcement ? "critical" : undefined),
            importance_score: item.importance_score,
            target_audience: item.target_audience,
            is_major_announcement: item.is_major_announcement,
            technologies: item.technologies,
            primary_role: item.primary_role,
            relevant_roles: item.relevant_roles,
        }));

        // ─── Rerank & deduplicate ─────────────────────────────────────────────
        let newsItems: NewsItem[] = [];
        if (Array.isArray(mappedItems)) {
            newsItems = rerank(mappedItems);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n# ✅ TWO-STAGE DONE in ${elapsed}s — ${newsItems.length} final items\n`);

        return NextResponse.json({ newsItems, jobRole });

    } catch (error: unknown) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`\n❌ ERROR after ${elapsed}s:`, error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
