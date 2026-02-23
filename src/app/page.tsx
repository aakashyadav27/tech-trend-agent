"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BackgroundBeams,
  SpotlightEffect,
  GridPattern,
  FloatingParticles,
} from "@/components/ui/background-effects";
import { TextGenerateEffect, TypewriterEffect } from "@/components/ui/text-effects";
import { MovingBorderButton } from "@/components/ui/moving-border";
import { NewsHoverCard, NewsCardSkeleton } from "@/components/ui/news-card";

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

const ROLE_SUGGESTIONS = [
  "Frontend Developer",
  "Data Scientist",
  "DevOps Engineer",
  "Product Manager",
  "AI/ML Engineer",
  "Cybersecurity Analyst",
  "Backend Developer",
  "UX Designer",
];

const ROLE_CONTEXT_TEMPLATES: Record<string, string> = {
  "Frontend Developer":
    `I am a Frontend Developer working daily with React 18+, Next.js 14/15 (App Router), TypeScript, and Tailwind CSS.

My day-to-day responsibilities include:
- Building complex, performant UI components and design systems (Radix UI, shadcn/ui, Headless UI)
- Managing client and server state with React Query / TanStack Query, Zustand, or Jotai
- Optimizing Core Web Vitals (LCP, CLS, INP) and Lighthouse scores for production apps
- Writing end-to-end and component tests with Playwright, Vitest, and React Testing Library
- Implementing advanced CSS patterns, animations (Framer Motion, CSS View Transitions API), and responsive layouts
- Integrating REST and GraphQL APIs, handling real-time data via WebSockets or SSE
- Working with modern bundlers: Vite, Turbopack, esbuild, and Webpack 5
- Shipping features via Vercel, Netlify or Cloudflare Pages with edge deployments`,

  "Data Scientist":
    `I am a Data Scientist working daily with Python (Pandas, NumPy, scikit-learn, PyTorch, TensorFlow/Keras), SQL, and Jupyter notebooks.

My day-to-day responsibilities include:
- Building and evaluating supervised/unsupervised machine learning models for classification, regression, clustering, and anomaly detection
- Running exploratory data analysis (EDA) and feature engineering on large structured and unstructured datasets
- Optimizing model training pipelines using distributed frameworks: Apache Spark, Dask, Ray
- Experimenting and tracking runs with MLflow, Weights & Biases (W&B), or DVC
- Serving models in production via FastAPI, Flask, or Triton Inference Server
- Working with data warehouses: BigQuery, Snowflake, Redshift, and dbt for transformation
- Building dashboards and visualizations in Plotly, Seaborn, Tableau, or Streamlit
- Applying and fine-tuning LLMs and foundation models for NLP tasks (HuggingFace Transformers, LangChain)`,

  "DevOps Engineer":
    `I am a DevOps / Platform Engineer working daily with Kubernetes, Terraform, Docker, CI/CD pipelines, and major cloud providers (AWS, GCP, Azure).

My day-to-day responsibilities include:
- Provisioning and managing cloud infrastructure as code with Terraform, Pulumi, or AWS CDK
- Operating Kubernetes clusters (EKS, GKE, AKS) — managing ingress, Helm charts, operators, and custom controllers
- Designing and maintaining CI/CD pipelines with GitHub Actions, GitLab CI, ArgoCD, or Tekton
- Building container images with Docker and managing them via ECR, GAR, or Harbor
- Implementing observability stacks: Prometheus + Grafana, OpenTelemetry, Datadog, or Loki for logs
- Enforcing security and compliance: RBAC, OPA/Gatekeeper, secret management (Vault), SBOM, and image scanning (Trivy, Snyk)
- Optimizing cloud costs and resource utilization with KEDA, Karpenter, or Cluster Autoscaler
- Designing zero-downtime deployment strategies: blue/green, canary, feature flags`,

  "Product Manager":
    `I am a Technical Product Manager leading cross-functional teams to ship AI-powered software products.

My day-to-day responsibilities include:
- Defining product strategy, writing PRDs, and maintaining roadmaps aligned with business goals
- Prioritizing features using frameworks like RICE, MoSCoW, and Jobs-to-be-Done (JTBD)
- Running agile ceremonies: sprint planning, retrospectives, and stakeholder demos
- Analyzing product metrics with Mixpanel, Amplitude, PostHog, or Looker
- Conducting user interviews, usability testing, and A/B experiments to validate hypotheses
- Staying ahead of AI/ML integrations — evaluating LLM APIs (OpenAI, Anthropic, Gemini), AI copilots, and no-code/low-code platforms
- Performing competitive analysis of SaaS products and emerging tech trends
- Collaborating with design (Figma) and engineering (JIRA, Linear, Notion) to align delivery`,

  "AI/ML Engineer":
    `I am an AI/ML Engineer specializing in building, fine-tuning, and deploying large language models (LLMs) and multimodal AI systems into production.

My day-to-day responsibilities include:
- Fine-tuning and aligning LLMs using LoRA, QLoRA, RLHF, and DPO on frameworks like Hugging Face TRL, Axolotl, or Unsloth
- Building scalable LLM inference pipelines with vLLM, TGI (Text Generation Inference), Triton, or ONNX Runtime
- Designing agentic AI systems using LangChain, LangGraph, LlamaIndex, AutoGen, or CrewAI
- Implementing RAG (Retrieval-Augmented Generation) pipelines with vector databases: Pinecone, Weaviate, Qdrant, Chroma, or pgvector
- Integrating multi-modal models for vision, speech, and code understanding (GPT-4V, Claude 3.5, Gemini 1.5)
- Evaluating model quality using RAGAS, TruLens, Langfuse, or custom LLM-as-judge frameworks
- Managing GPU infrastructure on AWS (SageMaker, EC2 P/G/Inf instances), GCP (TPU/Vertex), or on-prem
- Monitoring inference latency, token usage, hallucination rates, and cost in production`,

  "Cybersecurity Analyst":
    `I am a Cybersecurity Analyst / Security Engineer responsible for protecting enterprise infrastructure from threats, vulnerabilities, and compliance gaps.

My day-to-day responsibilities include:
- Monitoring SIEM platforms (Splunk, Microsoft Sentinel, Elastic SIEM) for threats, anomalies, and IOCs
- Conducting vulnerability assessments and penetration testing using Burp Suite, Metasploit, Nmap, and Nessus
- Triaging and responding to security incidents following NIST/SANS IR playbooks
- Analyzing CVEs and security advisories from NIST NVD, MITRE CVE, and vendor bulletins
- Hardening cloud environments (AWS/GCP/Azure) using CIS benchmarks, SCPs, and IAM least-privilege policies
- Managing endpoint detection and response (EDR): CrowdStrike Falcon, SentinelOne, Microsoft Defender
- Implementing zero-trust architecture, mTLS, and WAF rules (Cloudflare, AWS WAF)
- Auditing software supply chain security: SBOM, sigstore, Dependabot, Renovate`,

  "Backend Developer":
    `I am a Backend Developer building highly available, distributed backend systems and APIs serving millions of requests per day.

My day-to-day responsibilities include:
- Designing and building RESTful and GraphQL APIs using Node.js (Fastify/Express/NestJS), Python (FastAPI/Django), Go (Gin/Echo), or Rust (Axum/Actix)
- Architecting microservices and event-driven systems with Kafka, RabbitMQ, NATS, or AWS SQS/SNS
- Designing relational and NoSQL schemas: PostgreSQL (with pgvector, TimescaleDB extensions), MySQL, MongoDB, Redis, Cassandra
- Optimizing query performance, indexing strategies, connection pooling (PgBouncer, Prisma, DrizzleORM)
- Implementing distributed system patterns: CQRS, saga, outbox, circuit breaker, rate limiting
- Securing APIs: OAuth 2.0, JWT, API keys, mTLS, OWASP API Top 10 protections
- Writing integration and load tests with k6, Artillery, or Locust
- Deploying services with Docker, Kubernetes, and serverless functions (AWS Lambda, Cloudflare Workers)`,

  "UX Designer":
    `I am a UX/Product Designer specializing in designing intuitive, accessible, and visually compelling digital experiences for web and mobile platforms.

My day-to-day responsibilities include:
- Conducting user research: qualitative interviews, usability tests, card sorting, tree testing with tools like Maze, Lookback, and UserTesting
- Creating low-fidelity wireframes, high-fidelity mockups, and interactive prototypes in Figma (using Auto Layout, Variables, and Dev Mode)
- Building and maintaining scalable design systems and component libraries following atomic design principles
- Ensuring WCAG 2.1/2.2 AA accessibility compliance using color contrast tools, screen reader testing, and keyboard navigation audits
- Collaborating with engineers to implement designs using Storybook, Zeroheight, or Notion-based design documentation
- Running A/B tests and analyzing behavioral data (heatmaps, session recordings) via Hotjar, FullStory, or Mixpanel
- Exploring motion design and micro-interactions with Rive, Lottie, or Figma Prototyping
- Staying current on design trends: glassmorphism, neumorphism, AI-generated UI, spatial computing (visionOS, Quest)`,
};

const TYPEWRITER_WORDS = [
  "Frontend Developer",
  "Data Scientist",
  "DevOps Engineer",
  "Product Manager",
  "AI/ML Engineer",
];

export default function Home() {
  const [jobRole, setJobRole] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedImpact, setSelectedImpact] = useState<string | null>(null);

  // Auto-fill context when role changes (if user hasn't heavily manually edited)
  useEffect(() => {
    if (jobRole && !isManuallyEdited) {
      const template = ROLE_CONTEXT_TEMPLATES[jobRole] || ROLE_CONTEXT_TEMPLATES[Object.keys(ROLE_CONTEXT_TEMPLATES).find(k => jobRole.toLowerCase().includes(k.toLowerCase())) || ""];
      if (template) {
        setProjectContext(template);
      } else {
        setProjectContext("");
      }
    }
  }, [jobRole, isManuallyEdited]);

  const handleContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProjectContext(e.target.value);
    setIsManuallyEdited(true);
  };

  const categories = Array.from(new Set(newsItems.map((item) => item.category))).sort();
  const impacts = ["critical", "high", "medium", "low"];

  const filteredItems = newsItems.filter((item) => {
    if (selectedCategory && item.category !== selectedCategory) return false;
    if (selectedImpact && item.impactLevel !== selectedImpact) return false;
    return true;
  });

  const handleSearch = async () => {
    if (!jobRole.trim()) return;

    setLoading(true);
    setError(null);
    setNewsItems([]);
    setSearched(true);
    setAgentStatus("Initializing agent and connecting to search tools...");
    setSelectedCategory(null);
    setSelectedImpact(null);

    try {
      const statusMessages = [
        "Identifying reputable sources for this role...",
        "Applying project context to search strategy...",
        "Scanning tech news outlets and tutorials...",
        "Analyzing search results...",
        "Compiling and ranking news items...",
      ];

      let msgIdx = 0;
      const statusInterval = setInterval(() => {
        msgIdx = Math.min(msgIdx + 1, statusMessages.length - 1);
        setAgentStatus(statusMessages[msgIdx]);
      }, 7000);

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobRole: jobRole.trim(),
          projectContext: projectContext.trim()
        }),
      });

      clearInterval(statusInterval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch news");
      }

      const data = await res.json();
      setNewsItems(data.newsItems || []);
      setAgentStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setAgentStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleSearch();
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      {/* Background layers */}
      <BackgroundBeams />
      <SpotlightEffect />
      <GridPattern />
      <FloatingParticles />

      {/* Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="flex min-h-[55vh] flex-col items-center justify-center px-4 pt-16">
          {/* Logo / Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-zinc-400 backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
            Powered by LangChain ReAct Agent + MCP
          </motion.div>

          {/* Title */}
          <TextGenerateEffect
            words="Tech Trend Intelligence"
            className="mb-3 text-center text-5xl font-bold tracking-tight md:text-7xl"
          />

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mb-2 max-w-xl text-center text-lg text-zinc-400"
          >
            AI-powered news aggregation for{" "}
            <TypewriterEffect
              words={TYPEWRITER_WORDS}
              className="text-cyan-400 font-medium"
            />
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="mb-10 max-w-lg text-center text-sm text-zinc-500"
          >
            Enter your job role and our AI agent will search reputable sources to find the most relevant news from the past 24 hours.
          </motion.p>

          {/* Search Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="flex w-full max-w-xl flex-col items-center gap-4"
          >
            <div className="flex w-full flex-col items-center gap-4 sm:flex-row">
              <div className="relative flex-1 w-full">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 blur-xl opacity-50" />
                <input
                  type="text"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., Frontend Developer"
                  disabled={loading}
                  className="relative w-full rounded-xl border border-white/10 bg-zinc-900/80 px-5 py-3.5 text-[15px] text-white placeholder-zinc-500 outline-none backdrop-blur-xl transition-all focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
                />
              </div>
              <MovingBorderButton onClick={handleSearch} disabled={loading}>
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </>
                )}
              </MovingBorderButton>
            </div>

            {/* Project Context Input */}
            <div className="w-full">
              <label className="mb-2 block text-[13px] font-medium text-cyan-400/80">
                Project Context (Optional)
              </label>
              <textarea
                value={projectContext}
                onChange={handleContextChange}
                placeholder="e.g. Currently building a React Native application with Expo and Supabase..."
                className="min-h-[80px] w-full resize-y rounded-xl border border-white/10 bg-zinc-900/50 p-3 text-[13px] text-zinc-300 placeholder-zinc-600 outline-none backdrop-blur-xl transition-all focus:border-cyan-500/50 focus:bg-zinc-900/80"
              />
            </div>
          </motion.div>

          {/* Quick role chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.5 }}
            className="mt-5 flex flex-wrap items-center justify-center gap-2"
          >
            {ROLE_SUGGESTIONS.map((role) => (
              <button
                key={role}
                onClick={() => setJobRole(role)}
                disabled={loading}
                className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[12px] text-zinc-500 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/5 hover:text-cyan-400 disabled:opacity-50 cursor-pointer"
              >
                {role}
              </button>
            ))}
          </motion.div>
        </section>

        {/* Agent Status */}
        <AnimatePresence>
          {loading && agentStatus && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-auto mt-8 flex max-w-xl items-center justify-center gap-3 rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-5 py-3 backdrop-blur-sm"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
              <span className="text-sm text-cyan-300">{agentStatus}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto mt-8 max-w-xl rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-3 text-center text-sm text-red-400"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-10">
          {/* Loading skeletons */}
          {loading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <NewsCardSkeleton key={i} index={i} />
              ))}
            </div>
          )}

          {/* News cards */}
          {!loading && newsItems.length > 0 && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
              >
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold text-zinc-100 mb-1">
                    Trending for{" "}
                    <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                      {jobRole}
                    </span>
                  </h2>
                  <p className="text-sm text-zinc-500 mb-6">
                    {newsItems.length} news items from the past 24 hours
                  </p>

                  <div className="space-y-4">
                    {/* Category Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 mr-2">Category:</span>
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${!selectedCategory ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/10'}`}
                      >
                        All
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${cat === selectedCategory ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/10'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Impact Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 mr-2">Impact:</span>
                      <button
                        onClick={() => setSelectedImpact(null)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${!selectedImpact ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-zinc-900 text-zinc-500 border border-white/5 hover:border-white/10'}`}
                      >
                        Any
                      </button>
                      {impacts.map((level) => (
                        <button
                          key={level}
                          onClick={() => setSelectedImpact(level === selectedImpact ? null : level)}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all border ${level === selectedImpact
                            ? (level === 'critical' ? 'bg-red-500 border-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                              level === 'high' ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]' :
                                level === 'medium' ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' :
                                  'bg-zinc-500 border-zinc-400 text-white')
                            : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-white/10'}`}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {(selectedCategory || selectedImpact) && (
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedImpact(null); }}
                    className="text-[12px] text-cyan-400 hover:text-cyan-300 underline underline-offset-4"
                  >
                    Clear all filters
                  </button>
                )}

                <div className="hidden items-center gap-2 text-[12px] text-zinc-600 md:flex">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  Live results
                </div>
              </motion.div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredItems
                  .sort((a, b) => b.relevance - a.relevance)
                  .map((item, i) => (
                    <NewsHoverCard key={i} item={item} index={i} />
                  ))}
              </div>

              {filteredItems.length === 0 && (
                <div className="py-20 text-center">
                  <p className="text-zinc-500">No results matching your current filters.</p>
                  <button
                    onClick={() => { setSelectedCategory(null); setSelectedImpact(null); }}
                    className="mt-4 text-cyan-400 hover:underline"
                  >
                    Show all results
                  </button>
                </div>
              )}
            </>
          )}

          {/* Empty state after search */}
          {!loading && searched && newsItems.length === 0 && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-16 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/5 bg-zinc-900/50">
                <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">
                No results found. Try a different job role.
              </p>
            </motion.div>
          )}
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-6 text-center text-[12px] text-zinc-600">
          Built with Next.js · LangChain · Google Search MCP · Azure OpenAI
        </footer>
      </div>
    </main>
  );
}
