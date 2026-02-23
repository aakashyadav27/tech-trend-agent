import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { search as ddgSearch, searchNews as ddgSearchNews, SafeSearchType } from "duck-duck-scrape";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS — RSS/Atom parsing
// ═══════════════════════════════════════════════════════════════════════════════

function parseRSSItems(xml: string, max: number, sourceName: string) {
    const items: Array<{ title: string; url: string; pubDate: string; source: string }> = [];
    const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const m of matches.slice(0, max)) {
        const title = m.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
            ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            ?.replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
            ?.trim() || "";
        const link = m.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
        const pubDate = m.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
        const itemSource = m.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]
            ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")?.trim() || sourceName;
        if (title) items.push({ title, url: link, pubDate, source: itemSource });
    }
    return items;
}

function parseAtomEntries(xml: string, max: number, sourceName: string) {
    const items: Array<{ title: string; url: string; pubDate: string; source: string }> = [];
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (const m of entries.slice(0, max)) {
        const title = m.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
            ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")?.trim() || "";
        const link = m.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/)?.[1]
            || m.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
        const pubDate = m.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim()
            || m.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() || "";
        if (title) items.push({ title, url: link, pubDate, source: sourceName });
    }
    return items;
}

function parseFeedContent(xml: string, maxResults: number, sourceName: string) {
    let items = parseRSSItems(xml, maxResults * 3, sourceName); // fetch extra, then filter
    if (items.length === 0) {
        items = parseAtomEntries(xml, maxResults * 3, sourceName);
    }
    // Strict 24h freshness filter
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = items.filter((item) => {
        if (!item.pubDate) return true; // No date? Keep for now, Reranker will handle it
        const d = new Date(item.pubDate);
        if (isNaN(d.getTime())) return true;
        return d.getTime() > cutoff;
    });
    return fresh.slice(0, maxResults);
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, timeoutMs = 10000) {
    return fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DUCKDUCKGO WEB SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

export const duckDuckGoSearch = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    🦆 DDG Web: "${query}"`);
            const results = await ddgSearch(query, { safeSearch: SafeSearchType.OFF });
            const items = results.results.slice(0, maxResults).map((r) => ({
                title: r.title, url: r.url, snippet: r.description,
            }));
            console.log(`    🦆 DDG Web: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ DDG Web error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "duckduckgo_search",
        description: "Search the web using DuckDuckGo. Returns titles, URLs, snippets. Free.",
        schema: z.object({
            query: z.string().describe("Search query"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DUCKDUCKGO NEWS
// ═══════════════════════════════════════════════════════════════════════════════

export const duckDuckGoNews = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    📰 DDG News: "${query}"`);
            const results = await ddgSearchNews(query);
            const items = results.results.slice(0, maxResults).map((r) => ({
                title: r.title, url: r.url, snippet: r.excerpt,
                date: r.date ? new Date(r.date * 1000).toISOString() : undefined,
                relativeTime: r.relativeTime,
            }));
            console.log(`    📰 DDG News: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ DDG News error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "duckduckgo_news",
        description: "Search recent news via DuckDuckGo News. Returns titles, URLs, dates. Free.",
        schema: z.object({
            query: z.string().describe("News search query"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GOOGLE NEWS RSS
// ═══════════════════════════════════════════════════════════════════════════════

export const googleNewsRSS = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    📡 Google News RSS: "${query}"`);
            const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+when:1d&hl=en-US&gl=US&ceid=US:en`;
            const res = await fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            const items = parseFeedContent(xml, maxResults, "Google News");
            console.log(`    📡 Google News RSS: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ Google News RSS error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "google_news_rss",
        description: "Fetch Google News RSS headlines from past 24h. Free.",
        schema: z.object({
            query: z.string().describe("News query"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. HACKER NEWS (Algolia)
// ═══════════════════════════════════════════════════════════════════════════════

export const hackerNewsSearch = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    🔶 HN: "${query}"`);
            const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
            const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${oneDayAgo}&hitsPerPage=${maxResults}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
            const items = data.hits
                .map((h: any) => ({
                    title: h.title,
                    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
                    points: h.points, comments: h.num_comments, date: h.created_at,
                }))
                .filter((i: any) => new Date(i.date).getTime() > oneDayAgoMs);
            console.log(`    🔶 HN: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ HN error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "hackernews_search",
        description: "Search Hacker News for recent stories via Algolia. Free.",
        schema: z.object({
            query: z.string().describe("Search query"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. REDDIT via RSS
// ═══════════════════════════════════════════════════════════════════════════════

export const redditSearch = tool(
    async ({ query, subreddit, maxResults }) => {
        try {
            const sub = subreddit || "programming";
            console.log(`    🔴 Reddit r/${sub}: "${query}"`);
            const urls = [
                `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(query)}&sort=new&t=day&restrict_sr=1`,
                `https://www.reddit.com/r/${sub}/hot.rss`,
            ];
            for (const rssUrl of urls) {
                try {
                    const res = await fetchWithTimeout(rssUrl);
                    if (res.ok) {
                        const xml = await res.text();
                        let items = parseAtomEntries(xml, maxResults * 2, `r/${sub}`);
                        const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
                        items = items.filter(i => new Date(i.pubDate).getTime() > oneDayAgoMs).slice(0, maxResults);

                        if (items.length > 0) {
                            console.log(`    🔴 Reddit: ${items.length} results`);
                            return JSON.stringify(items, null, 2);
                        }
                    }
                } catch { /* try next */ }
            }
            console.log(`    🔴 Reddit: 0 results`);
            return JSON.stringify([]);
        } catch (error) {
            console.error(`    ❌ Reddit error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "reddit_search",
        description: "Search Reddit via RSS. Subreddits: programming, webdev, javascript, reactjs, devops, machinelearning, datascience, netsec, technology, rust, golang, python, kubernetes. Free.",
        schema: z.object({
            query: z.string().describe("Search query"),
            subreddit: z.string().default("programming").describe("Subreddit name"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DEV.TO
// ═══════════════════════════════════════════════════════════════════════════════

export const devToSearch = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    🔷 Dev.to: "${query}"`);
            const tag = query.split(" ")[0].toLowerCase();
            const urls = [
                `https://dev.to/api/articles?per_page=${maxResults}&top=1&tag=${encodeURIComponent(tag)}`,
                `https://dev.to/api/articles?per_page=${maxResults}&tag=${encodeURIComponent(tag)}`,
                `https://dev.to/api/articles?per_page=${maxResults}&state=fresh`,
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data: any[] = [];
            for (const url of urls) {
                const res = await fetch(url, { headers: { "User-Agent": "TechTrendAgent/1.0" } });
                if (res.ok) { data = await res.json(); if (data?.length > 0) break; }
            }
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (data || [])
                .filter((a: any) => new Date(a.published_at).getTime() > oneDayAgo)
                .slice(0, maxResults)
                .map((a: any) => ({
                    title: a.title, url: a.url, tags: a.tag_list,
                    reactions: a.positive_reactions_count, comments: a.comments_count,
                    publishedAt: a.published_at, author: a.user?.name,
                }));
            console.log(`    🔷 Dev.to: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ Dev.to error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "devto_articles",
        description: "Search Dev.to for developer articles by tag. Free.",
        schema: z.object({
            query: z.string().describe("Tag (e.g. 'react', 'typescript')"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. LOBSTE.RS
// ═══════════════════════════════════════════════════════════════════════════════

export const lobstersSearch = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    🦞 Lobste.rs: "${query}"`);
            const tag = query.toLowerCase().replace(/[^a-z0-9]/g, "");
            const urls = [`https://lobste.rs/t/${tag}.json`, "https://lobste.rs/newest.json"];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let data: any[] = [];
            for (const url of urls) {
                const res = await fetch(url, { headers: { "User-Agent": "TechTrendAgent/1.0" } });
                if (res.ok) { data = await res.json(); if (data?.length > 0) break; }
            }
            const oneDayAgo = new Date(Date.now() - 86400000);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (data || [])
                .filter((a: { created_at: string }) => new Date(a.created_at) > oneDayAgo)
                .slice(0, maxResults)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((a: any) => ({
                    title: a.title, url: a.url || `https://lobste.rs/s/${a.short_id}`,
                    tags: a.tags, score: a.score, comments: a.comment_count, date: a.created_at,
                }));
            console.log(`    🦞 Lobste.rs: ${items.length} results`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ Lobste.rs error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "lobsters_search",
        description: "Browse Lobste.rs curated tech stories. Tags: javascript, rust, python, security, devops, ai, web. Free.",
        schema: z.object({
            query: z.string().describe("Tag (e.g. 'javascript', 'ai')"),
            maxResults: z.number().default(50).describe("Max results"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DYNAMIC RSS FEED — auto-discovers and reads ANY website's RSS feed
// ═══════════════════════════════════════════════════════════════════════════════

// Common RSS/feed path patterns to try
const COMMON_FEED_PATHS = [
    "/feed", "/feed.xml", "/rss", "/rss.xml", "/atom.xml", "/atom",
    "/feed/", "/rss/", "/index.xml",
    "/blog/feed", "/blog/rss", "/blog/feed.xml", "/blog/rss.xml", "/blog/atom.xml",
    "/blog/index.xml",
    "/feeds/posts/default", "/feeds/posts/default?alt=rss",
    "/.rss",
];

async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
    // Normalize URL
    let baseUrl = siteUrl.replace(/\/+$/, "");
    if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;

    console.log(`      🔍 Discovering feed for: ${baseUrl}`);

    // STEP 1: Fetch the page HTML and look for <link> feed tags
    try {
        const res = await fetchWithTimeout(baseUrl, 8000);
        if (res.ok) {
            const html = await res.text();

            // Look for RSS/Atom link tags
            const feedLinkPatterns = [
                /<link[^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/gi,
                /<link[^>]*type=["']application\/atom\+xml["'][^>]*href=["']([^"']+)["']/gi,
                /<link[^>]*type=["']application\/feed\+json["'][^>]*href=["']([^"']+)["']/gi,
                // Also match href before type
                /<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/rss\+xml["']/gi,
                /<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/atom\+xml["']/gi,
            ];

            for (const pattern of feedLinkPatterns) {
                const match = pattern.exec(html);
                if (match?.[1]) {
                    let feedUrl = match[1];
                    // Resolve relative URLs
                    if (feedUrl.startsWith("/")) {
                        const urlObj = new URL(baseUrl);
                        feedUrl = `${urlObj.protocol}//${urlObj.host}${feedUrl}`;
                    } else if (!feedUrl.startsWith("http")) {
                        feedUrl = `${baseUrl}/${feedUrl}`;
                    }
                    console.log(`      ✅ Found feed via HTML link tag: ${feedUrl}`);
                    return feedUrl;
                }
            }
        }
    } catch {
        // Page fetch failed, try common paths
    }

    // STEP 2: Try common feed paths
    const urlObj = new URL(baseUrl);
    const origin = `${urlObj.protocol}//${urlObj.host}`;

    for (const path of COMMON_FEED_PATHS) {
        const feedUrl = `${origin}${path}`;
        try {
            const res = await fetchWithTimeout(feedUrl, 5000);
            if (res.ok) {
                const contentType = res.headers.get("content-type") || "";
                const text = await res.text();
                // Check if it looks like XML/RSS/Atom
                if (
                    contentType.includes("xml") ||
                    contentType.includes("rss") ||
                    contentType.includes("atom") ||
                    text.trimStart().startsWith("<?xml") ||
                    text.includes("<rss") ||
                    text.includes("<feed") ||
                    text.includes("<channel>")
                ) {
                    console.log(`      ✅ Found feed at common path: ${feedUrl}`);
                    return feedUrl;
                }
            }
        } catch {
            // try next path
        }
    }

    // STEP 3: Try the URL itself — maybe the user passed a direct feed URL
    try {
        const res = await fetchWithTimeout(baseUrl, 5000);
        if (res.ok) {
            const text = await res.text();
            if (text.includes("<rss") || text.includes("<feed") || text.includes("<channel>")) {
                console.log(`      ✅ URL itself is a feed: ${baseUrl}`);
                return baseUrl;
            }
        }
    } catch { /* nope */ }

    console.log(`      ❌ No feed found for: ${baseUrl}`);
    return null;
}

export const dynamicRSSFeed = tool(
    async ({ url, maxResults }) => {
        try {
            console.log(`    📡 Dynamic RSS: "${url}"`);

            // Discover the feed URL
            const feedUrl = await discoverFeedUrl(url);
            if (!feedUrl) {
                return JSON.stringify({
                    error: `Could not find an RSS/Atom feed for "${url}". Try providing a more specific URL like the blog page or a direct feed URL.`,
                });
            }

            // Fetch the feed
            const res = await fetchWithTimeout(feedUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${feedUrl}`);
            const xml = await res.text();

            // Extract source name from URL
            const sourceName = new URL(feedUrl).hostname.replace(/^www\./, "").replace(/\.com$|\.org$|\.io$|\.dev$/, "");

            const items = parseFeedContent(xml, maxResults, sourceName);
            console.log(`    📡 Dynamic RSS [${sourceName}]: ${items.length} articles from ${feedUrl}`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ Dynamic RSS error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "read_rss_feed",
        description: `Dynamically discover and read RSS/Atom feed from ANY website URL. 
Give it any website URL (blog, docs, news site) and it will:
1. Find the RSS/Atom feed automatically by scanning the page HTML
2. Try common feed paths (/feed, /rss, /feed.xml, /atom.xml, /blog/feed, etc.)
3. Fetch and parse the discovered feed

Works with ANY website: react.dev, nextjs.org, kubernetes.io, blog.rust-lang.org, openai.com, etc.
You can also pass a direct feed URL if you know it.
Free, no API key needed.`,
        schema: z.object({
            url: z.string().describe("Website URL to discover feed from (e.g. 'https://react.dev', 'https://blog.rust-lang.org', 'https://kubernetes.io/blog')"),
            maxResults: z.number().default(50).describe("Max articles to return"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. GITHUB TRENDING
// ═══════════════════════════════════════════════════════════════════════════════

export const githubTrending = tool(
    async ({ language }) => {
        try {
            console.log(`    🐙 GitHub Trending: lang=${language || "all"}`);
            const searchUrl = `https://api.github.com/search/repositories?q=${language || "stars:>100"}+pushed:>${new Date(Date.now() - 86400000).toISOString().split("T")[0]}&sort=stars&order=desc&per_page=10`;
            const res = await fetch(searchUrl, {
                headers: { "User-Agent": "TechTrendAgent/1.0", Accept: "application/vnd.github.v3+json" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (data.items || []).slice(0, 10).map((r: any) => ({
                name: r.full_name, url: r.html_url, description: r.description,
                stars: r.stargazers_count, language: r.language, pushedAt: r.pushed_at,
            }));
            console.log(`    🐙 GitHub Trending: ${items.length} repos`);
            return JSON.stringify(items, null, 2);
        } catch (error) {
            console.error(`    ❌ GitHub error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "github_trending",
        description: "Find trending GitHub repos. Filter by language. Free.",
        schema: z.object({
            language: z.string().optional().describe("Language filter (e.g. 'typescript', 'python')"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

import FirecrawlApp from "@mendable/firecrawl-js";

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FIRECRAWL WEB SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════

export const scrapeWebsite = tool(
    async ({ url }) => {
        try {
            console.log(`    🔥 Scrape Website: "${url}"`);

            const apiKey = process.env.FIRECRAWL_API_KEY;
            if (!apiKey) {
                return JSON.stringify({ error: "FIRECRAWL_API_KEY environment variable is missing." });
            }

            const app = new FirecrawlApp({ apiKey });

            // Wait up to 5 seconds, extract markdown and rely on default metadata
            const scrapeResult = await app.scrape(url, {
                formats: ["markdown"],
                waitFor: 5000
            });

            // @ts-expect-error - Firecrawl SDK types might be outdated
            if (!scrapeResult.markdown && !scrapeResult.content) {
                throw new Error("Failed to extract markdown or content from scrape");
            }

            // Extract the domain to act as the source
            const sourceName = new URL(url).hostname.replace(/^www\./, "").replace(/\.com$|\.org$|\.io$|\.dev$/, "");

            // Determine the true publication date purely from metadata
            let trueDate: string | null = null;

            if (scrapeResult.metadata?.datePublished) {
                trueDate = String(scrapeResult.metadata.datePublished);
            } else if (scrapeResult.metadata?.dateModified) {
                trueDate = String(scrapeResult.metadata.dateModified);
            } else if (scrapeResult.metadata?.ogDate) {
                trueDate = String(scrapeResult.metadata.ogDate);
            }

            // CRITICAL: If no date found, we mark as 'today' but with high skepticism
            const finalDate = trueDate || new Date().toISOString();

            // Enforce 24 hour filter immediately
            const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;

            // If we HAVE a date and it's old, REJECT HARD
            if (trueDate && new Date(trueDate).getTime() < oneDayAgoMs) {
                console.log(`    🔥 Scrape Website: Rejected - Article is older than 24h (${trueDate})`);
                return JSON.stringify([]);
            }

            // Return a single item array for consistency
            const items = [{
                title: scrapeResult.metadata?.title || `Content from ${sourceName}`,
                url: url,
                summary: scrapeResult.markdown ? scrapeResult.markdown.substring(0, 1000) : "No content extracted",
                source: sourceName,
                publishedAt: finalDate
            }];

            console.log(`    🔥 Scrape Website: Extracted ${scrapeResult.markdown?.length || 0} characters`);
            return JSON.stringify(items, null, 2);

        } catch (error) {
            console.error(`    ❌ Scrape Website error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "scrape_website",
        description: "Directly scrape text and markdown content from a specific website URL. USE THIS ONLY WHEN: 1. You have a direct URL to a blog post, article, or announcement (e.g., https://www.anthropic.com/news/announcement). 2. The read_rss_feed tool failed on a domain with a 'No feed found' error. DO NOT use this for general search. It is purely for extracting content from a known URL.",
        schema: z.object({
            url: z.string().describe("The exact website URL to scrape"),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT YOUTUBE
// ═══════════════════════════════════════════════════════════════════════════════

export const youtubeSearch = tool(
    async ({ query, maxResults }) => {
        try {
            console.log(`    🎥 YouTube Search: "${query}"`);

            const apiKey = process.env.YOUTUBE_API_KEY;
            if (!apiKey) {
                return JSON.stringify({ error: "YOUTUBE_API_KEY environment variable is missing." });
            }

            // Fetching search results using the YouTube Data API v3
            // Cost per request: 100 quota units
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
                    query
                )}&type=video&maxResults=${maxResults}&order=date&key=${apiKey}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                return JSON.stringify({
                    error: "YouTube API Error",
                    details: errorData,
                });
            }

            const data = await response.json();

            const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
            const items = data.items
                .map((item: any) => ({
                    title: item.snippet.title,
                    channelTitle: item.snippet.channelTitle,
                    description: item.snippet.description,
                    publishedAt: item.snippet.publishedAt,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    source: "YouTube"
                }))
                .filter((item: any) => new Date(item.publishedAt).getTime() > oneDayAgoMs);

            console.log(`      ↳ Found ${items.length} videos`);
            return JSON.stringify(items);

        } catch (error) {
            console.error(`    ❌ YouTube error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "youtube_search",
        description: `Search YouTube for recent technical developments, official announcements, new feature releases, and major updates.
CRITICAL: The YouTube Data API has a strict daily quota limit.
- ALWAYS use this tool sparingly (max 1-2 times per job role).
- USE ONLY FOR: Recent developments (e.g. "React 19 new features"), official announcements, or major release overviews.
- DO NOT use for generic or beginner tutorials. Focus on news and staying up to date.`,
        schema: z.object({
            query: z.string().describe("Specific technical search query (e.g. 'Next.js 15 official announcement', 'PyCon 2024 keynotes', 'Rust 1.80 release')"),
            maxResults: z.number().max(5).default(3).describe("Max videos to return. DO NOT EXCEED 5 to save API quota."),
        }),
    }
);

export const youtubeChannelVideos = tool(
    async ({ channelId, maxResults }) => {
        try {
            console.log(`    📺 YouTube Channel: "${channelId}"`);

            const apiKey = process.env.YOUTUBE_API_KEY;
            if (!apiKey) {
                return JSON.stringify({ error: "YOUTUBE_API_KEY environment variable is missing." });
            }

            // Fetching channel recent videos using the YouTube Data API v3
            // Cost per request: 100 quota units
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&maxResults=${maxResults}&order=date&key=${apiKey}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                return JSON.stringify({
                    error: "YouTube API Error",
                    details: errorData,
                });
            }

            const data = await response.json();

            const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
            const items = data.items
                .map((item: any) => ({
                    title: item.snippet.title,
                    channelTitle: item.snippet.channelTitle,
                    description: item.snippet.description,
                    publishedAt: item.snippet.publishedAt,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    source: "YouTube"
                }))
                .filter((item: any) => new Date(item.publishedAt).getTime() > oneDayAgoMs);

            console.log(`      ↳ Found ${items.length} channel videos`);
            return JSON.stringify(items);

        } catch (error) {
            console.error(`    ❌ YouTube Channel error:`, error);
            return JSON.stringify({ error: String(error) });
        }
    },
    {
        name: "youtube_channel_videos",
        description: `Fetch the latest videos from a specific YouTube Channel ID.
USE THIS ONLY WHEN: You are given a specific YouTube channel ID (e.g., from a format like youtube:CHANNEL_ID).
CRITICAL: The YouTube Data API has a strict daily quota limit. Use sparingly.`,
        schema: z.object({
            channelId: z.string().describe("The exact YouTube Channel ID (e.g., UCP7jMXSY2xbc3KCAE0MHQ-A)"),
            maxResults: z.number().max(5).default(3).describe("Max videos to return. DO NOT EXCEED 5."),
        }),
    }
);

// ═══════════════════════════════════════════════════════════════════════════════

export const allSearchTools = [
    duckDuckGoSearch,
    duckDuckGoNews,
    googleNewsRSS,
    hackerNewsSearch,
    redditSearch,
    devToSearch,
    lobstersSearch,
    dynamicRSSFeed,
    githubTrending,
    youtubeSearch,
    scrapeWebsite,
    youtubeChannelVideos
];
