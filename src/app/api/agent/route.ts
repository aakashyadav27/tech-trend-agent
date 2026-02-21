import { NextRequest, NextResponse } from "next/server";
import { AzureChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { allSearchTools } from "@/lib/search-tools";

export const maxDuration = 120;

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — tuned for technical depth, zero noise
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an expert tech industry analyst who finds deeply TECHNICAL and ACTIONABLE news for a specific job role.

You have 10 FREE search tools:

SEARCH: duckduckgo_search (web), duckduckgo_news (news), google_news_rss (headlines past 24h)
COMMUNITY: hackernews_search (HN), reddit_search (subreddits), devto_articles (dev.to), lobsters_search (lobste.rs)
RSS: read_rss_feed — Give it ANY website URL and it auto-discovers and reads the RSS/Atom feed. Works with blogs, docs sites, news sites, framework pages — anything.
CODE: github_trending (trending repos)
VIDEO: youtube_search (recent developments, feature announcements, releases)

PROCESS:
1. Identify the core technologies, frameworks, languages, and tools for this job role.
2. Make 15-25 PARALLEL tool calls. Be aggressive:
   - 6-10 read_rss_feed calls or scrape_website calls with the OFFICIAL websites of frameworks/libraries this role uses.
     THINK about what sites a person in this role would bookmark and read daily — fetch those.
   - 4-5 google_news_rss or duckduckgo_news queries with TECHNICAL terms (framework names, CVEs, release keywords)
   - 2-4 hackernews_search, reddit_search, or devto_articles for community discussions
   - 1 github_trending filtered by the role's primary language
   - 1-2 youtube_search or youtube_channel_videos calls for high-value visual news.
   - 1-2 duckduckgo_search for niche topics
3. Include EVERY technically relevant item from the PAST 24 HOURS ONLY. Strictly no older content.
   ✅ INCLUDE: Framework releases, library updates, CVEs, security patches, tutorials, architecture patterns, perf improvements, tooling updates, language/runtime updates, protocol changes, API changes, benchmark results, migration guides, best practice posts, new dev tools, research papers with code.
   ✅ GITHUB RULE: For GitHub/repositories, ONLY include MAJOR library/framework releases (e.g., v1.0, v2.0) or massive architectural updates.
   ❌ EXCLUDE: CEO drama, politics, funding rounds, acquisitions, layoffs, stock moves, regulatory speculation, vague AI hype, anything older than 24 hours.
   ❌ GITHUB EXCLUDE: Minor GitHub commits, obscure repositories without wide adoption, routine bugfix patches that aren't critical security issues.

4. Return a JSON array with ALL qualifying items. You MUST return at least 15-25 items if sufficient news exists. Increase your internal tool 'maxResults' usage if needed. Each item MUST exactly match this database schema format (plus source):
   - "title": Headline
   - "url": Direct link
   - "summary": 2-3 sentences on TECHNICAL IMPACT
   - "importance_score": 1-10 (10 = critical)
   - "target_audience": Array of strings (e.g. ["Frontend", "React"])
   - "published_at": ISO Date if known, else "today"
   - "is_major_announcement": Boolean
   - "technologies": Array of strings (e.g. ["Next.js", "TypeScript"])
   - "primary_role": Single job role this most applies to
   - "relevant_roles": Array of strings (Other impacted roles)
   - "source": Name of the publication or blog

CRITICAL: Output ONLY a valid JSON array. No markdown, no fences, no commentary.`;

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
    try {
        const pubDate = new Date(dateStr);
        if (isNaN(pubDate.getTime())) return true; // can't parse → keep it (agent said it's fresh)
        const hoursAgo = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
        return hoursAgo >= -1 && hoursAgo <= 24; // allow 1h future for timezone drift
    } catch {
        return true; // unparseable → keep
    }
}

function rerank(items: NewsItem[]): NewsItem[] {
    console.log(`\n🔄 RERANKER: Processing ${items.length} items...`);

    // ── IDENTIFY Stale items without removing them ──
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

        // Severe penalty for stale items instead of removal
        if (!isFresh) {
            score -= 5;
        }

        // Impact level bonus
        if (item.impactLevel === "critical") score += 3;
        else if (item.impactLevel === "high") score += 2;
        else if (item.impactLevel === "medium") score += 1;

        // Noise penalty
        for (const pattern of NOISE_PATTERNS) {
            if (pattern.test(text)) { score -= 3; break; }
        }


        score = Math.max(1, Math.min(10, score));

        // Map the final score 1-10 to an impact level
        let impactLevel = "medium";
        if (score >= 8) impactLevel = "high";
        else if (score <= 4) impactLevel = "low";

        return { ...item, relevance: score, impactLevel };
    });

    // Do not filter out any news. Keep everything, but sort by relevance.
    const filtered = scored;

    // Sort by relevance
    filtered.sort((a, b) => b.relevance - a.relevance);

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = filtered.filter((item) => {
        const key = item.url?.toLowerCase().replace(/\/$/, "") || item.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`🔄 RERANKER: ${items.length} → ${deduped.length} items (${items.length - deduped.length} total removed)`);
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
        return sources.map((s: any) => `- ${s.name} (${s.type}): ${s.url}`);
    } catch (err) {
        console.error("Error fetching curated sources:", err);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        const { jobRole, projectContext } = await req.json();
        console.log(`\n${"#".repeat(80)}`);
        console.log(`# 🚀 AGENT START | Role: "${jobRole}" | Context: ${projectContext ? "Yes" : "No"} | ${new Date().toISOString()}`);
        console.log(`${"#".repeat(80)}`);

        if (!jobRole || typeof jobRole !== "string") {
            return NextResponse.json({ error: "jobRole is required" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
        }

        const model = new AzureChatOpenAI({
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiVersion: "2024-12-01-preview",
            azureOpenAIApiDeploymentName: "gpt-4.1-mini",
            azureOpenAIEndpoint: "https://uptostack-openai.openai.azure.com/",
            temperature: 0,
            maxTokens: 31000,
        });

        console.log(`🔧 Tools: ${allSearchTools.map((t) => t.name).join(", ")}`);

        const agent = createReactAgent({ llm: model, tools: allSearchTools });

        // 1. Fetch curated sources from Supabase
        const curatedSources = await getCuratedSources(jobRole);
        let sourceInstruction = "";

        if (curatedSources.length > 0) {
            console.log(`🔗 Found ${curatedSources.length} curated sources for role mapping.`);
            sourceInstruction = `\n\nCRITICAL SOURCE INSTRUCTION:\nYou MUST prioritize checking the following curated, high-priority sources first before generic web searches:\n${curatedSources.join("\n")}\n- If the source is an RSS or XML feed, use 'read_rss_feed'.\n- If the source is a standard website and 'read_rss_feed' fails or returns 'No feed found', you MUST fallback to 'scrape_website'.\n- If the source is a YouTube channel ID (e.g., 'youtube:UCP7jMXSY2...'), you MUST use 'youtube_channel_videos' and pass that exact ID.`;
        } else {
            console.log(`🔗 No curated sources found for role. Falling back to agentic search.`);
        }

        // 2. Add Project Context
        const contextInstruction = projectContext
            ? `\n\nCRITICAL CONTEXT: The user is currently working on the following projects/technologies: "${projectContext}". \nYOU MUST prioritize finding news, releases, and updates that specifically relate to these technologies. When scoring relevance, heavily boost items that match this context.`
            : "";

        console.log(`🚀 Invoking agent...\n`);
        const result = await agent.invoke({
            messages: [
                new SystemMessage(SYSTEM_PROMPT),
                new HumanMessage(
                    `Find the latest TECHNICAL news and trends from the past 24 hours for a "${jobRole}". Focus on: framework/library releases, security patches, technical tutorials, architecture insights, tooling updates, and engineering blog posts. Skip business news, CEO drama, funding rounds, and hype pieces. Today: ${new Date().toISOString().split("T")[0]}.${contextInstruction}${sourceInstruction}`
                ),
            ],
        });

        // Log trace
        console.log(`\n${"*".repeat(80)}`);
        console.log(`* TRACE: ${result.messages.length} messages`);
        console.log(`${"*".repeat(80)}`);
        result.messages.forEach((msg: BaseMessage, i: number) => logMessage(msg, i));

        // Extract final response
        const lastMessage = result.messages[result.messages.length - 1];
        logMessage(lastMessage, result.messages.length - 1);

        const content =
            typeof lastMessage.content === "string"
                ? lastMessage.content
                : JSON.stringify(lastMessage.content);

        let parsed: any[] = [];
        try {
            const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            parsed = JSON.parse(cleaned);
        } catch (err) {
            console.error("❌ Failed to parse agent exact JSON. Attempting cleanup...", err);
            const match = content.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch {
                    parsed = [];
                }
            }
        }

        console.log(`✅ Parsed: ${parsed.length} items`);

        // Map the new LLM Database Schema back to the legacy NewsItem UI Schema
        const mappedItems: NewsItem[] = parsed.map((item: any) => ({
            // Core Legacy UI Fields
            title: item.title || "No Title",
            source: item.source || "Unknown",
            summary: item.summary || "",
            url: item.url || "#",
            relevance: item.importance_score || item.relevance || 5, // Map importance -> relevance
            publishedAt: item.published_at || item.publishedAt || new Date().toISOString(),
            category: (item.technologies && item.technologies.length > 0) ? item.technologies[0] : (item.category || "General"),
            impactLevel: item.impactLevel || (item.is_major_announcement ? "critical" : undefined),

            // Raw Database Fields for future table saves
            importance_score: item.importance_score,
            target_audience: item.target_audience,
            is_major_announcement: item.is_major_announcement,
            technologies: item.technologies,
            primary_role: item.primary_role,
            relevant_roles: item.relevant_roles
        }));

        // ═══════════════════════════════════════════════════════════════════════════
        // RERANK: Filter noise, boost technical depth, sort by impact
        // ═══════════════════════════════════════════════════════════════════════════

        let newsItems: NewsItem[] = [];
        if (Array.isArray(mappedItems)) {
            newsItems = rerank(mappedItems);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n# ✅ DONE in ${elapsed}s — ${newsItems.length} items after reranking\n`);

        return NextResponse.json({ newsItems, jobRole });
    } catch (error: unknown) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`\n❌ ERROR after ${elapsed}s:`, error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
