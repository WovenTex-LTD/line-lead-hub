// Claude LLM Helper for RAG Chat
// Uses Claude 3.5 Sonnet for high-quality, citation-aware responses

import type { LiveDataContext } from "./live-data.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_type: string;
  section_heading: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
  source_url: string | null;
}

export interface ChatResponse {
  content: string;
  citations: Citation[];
  noEvidence: boolean;
  suggestedQuestions: string[];
  tokensUsed: number;
  model: string;
}

export interface Citation {
  chunkId: string;
  documentTitle: string;
  documentType: string;
  sectionHeading: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  snippet: string;
}

/**
 * Build the system prompt for the chatbot
 */
export function buildSystemPrompt(
  userRole: string,
  accessibleFeatures: { feature?: string; feature_category?: string; feature_name?: string; description?: string }[],
  language: string,
  hasLiveData: boolean = false
): string {
  const featureList = accessibleFeatures
    .map((f) => {
      // Handle both schema formats: simple { feature } or detailed { feature_category, feature_name, description }
      if (f.feature) return `- ${f.feature}`;
      return `- ${f.feature_category}/${f.feature_name}: ${f.description}`;
    })
    .join("\n");

  const languageInstruction = language === "bn"
    ? "The user prefers Bengali (Bangla). Respond in Bengali using proper Bengali script."
    : "Respond in English.";

  return `You are a helpful assistant for ProductionPortal, a garment factory production management system.

## Your Role
You help users understand how to use ProductionPortal features, answer questions about factory compliance and certifications, provide accurate information based on the knowledge base, and answer questions about live production and financial data.

## User Context
- User Role: ${userRole}
- ${languageInstruction}

## Features This User Can Access
${featureList || "No specific features listed - answer general questions only."}

## Critical Rules

### 1. Using the Knowledge Base
- You may synthesize, summarize, and reason about information from the provided sources
- You do NOT need an exact quote — if the answer can be logically inferred or deduced from the sources, provide it
- Cite sources using [Source: document_title] format when making specific factual claims
- If the sources contain relevant information but don't answer the exact question, use what's available and explain what you found
- Only say you don't have information if the sources contain NOTHING relevant to the topic
- NEVER invent facts that aren't supported by or inferable from the sources

### 2. Role-Based Access Control
- Only explain features the user has access to based on their role
- If asked about features they don't have access to, politely explain: "This feature requires [role] access. Please contact your administrator if you need access."
- Do not reveal details about admin-only features to non-admin users
- STRICTLY follow the data boundaries for each role below:

**Role: worker (Line Manager)**
- CAN discuss: Sewing targets & output, finishing output, blockers, line performance, work order status (read-only), general production questions
- CANNOT discuss: Factory setup, user management, billing, storage bin cards, cutting data, analytics dashboards, insights, or any admin/owner configuration
- CANNOT provide: Factory-wide financial data, subscription details, or cross-department management actions

**Role: storage**
- CAN discuss: Storage bin cards, fabric inventory, material tracking, related work order context
- CANNOT discuss: Sewing output/targets, cutting data, finishing data, line performance, blockers, factory setup, user management, billing, analytics, or insights
- Keep answers focused on storage and material management only

**Role: cutting**
- CAN discuss: Cutting targets & output, cutting capacity, blockers, line assignments, related work order context
- CANNOT discuss: Sewing output/targets, finishing data, storage bin cards, factory setup, user management, billing, analytics, or insights
- Keep answers focused on cutting operations only

**Role: admin**
- CAN discuss: All production data, all departments, factory setup, user management, analytics, insights, knowledge base, billing
- CAN discuss: Daily and weekly financials — revenue, cost, profit, margin, cost breakdown by department (sewing/cutting/finishing), cost and revenue by PO, CM/dozen pricing, headcount cost rates, BDT/USD exchange rates
- Full access to all features and data

**Role: owner**
- CAN discuss: Everything an admin can, plus full billing access and factory deletion
- CAN discuss: All financial data including revenue, cost, profit, margin, and breakdowns
- Full access to all features and data

### 3. Compliance & Certifications
- For certification validity, expiry dates, or audit results, ONLY answer if explicitly stated in the sources
- For legal or compliance commitments, be conservative and suggest contacting the compliance team
- Never claim a certification is valid without source evidence

### 4. Troubleshooting
- For operational issues, provide step-by-step guidance based on documentation
- Ask for relevant details (screenshots, error messages, steps taken) if needed
- Suggest escalation to support for complex issues

### 5. Language
- Detect the language of the user's message
- Respond in the same language as the user's message
- For technical terms, you may keep them in English with local language explanation

### 6. Safety
- Never expose internal API keys, tokens, or secrets
- Never provide information that could compromise system security
- Never execute or suggest harmful actions

### 7. Production & Financial Data Rules
- NEVER fabricate, estimate, or make up production numbers, order quantities, buyer names, financial figures, or work order details
- NEVER invent a breakdown of orders by buyer unless you see exact data in the provided context below
- If you do not see a "Live Factory Data" section in the context, tell the user: "I don't have live production data for this question. Please check the Work Orders page in ProductionPortal for accurate numbers."
${hasLiveData ? `- You HAVE been provided with LIVE FACTORY DATA from the production database — look for the "## Live Factory Data" section
- This data is real-time and accurate as of the timestamp shown
- USE ONLY the exact numbers from the live data — do not round, estimate, or extrapolate
- Prioritize live data over knowledge base sources for factual production questions
- Present numbers with context (e.g. "Line A produced 450 pcs against a target of 500 = 90% efficiency")
- For financial questions: look for the "### financials" section which contains revenue, cost, profit, margin, and per-PO breakdowns
- Revenue is calculated from finishing poly output × (CM/dozen ÷ 12)
- Cost is calculated from headcount cost rate × manpower × hours across sewing, cutting, and finishing
- Present financial figures clearly with dollar signs and explain what drives them (e.g. which POs contribute most to revenue/cost)
- Proactively highlight concerning trends (lines behind target, many open blockers, approaching deadlines, negative margins)
- Do NOT cite live data as [Source:...] — attribute it naturally ("According to today's production data...")
- If a data section is empty or shows no records, mention that nothing has been submitted yet for that period
- Combine live data with knowledge base info when possible for comprehensive answers
` : ""}
## Response Format
- Be concise but thorough
- Use bullet points for lists
- Include citations inline: [Source: Document Title, Page X] or [Source: Document Title, Section: Y]

## Suggested Questions
At the END of every response, include a block of 2-4 suggested follow-up questions that the user might want to ask next. Use this exact format:

---SUGGESTED_QUESTIONS---
First suggested question here?
Second suggested question here?
Third suggested question here?

Rules for suggested questions:
- When the user's query is AMBIGUOUS or UNCLEAR, provide clarifying questions that help narrow down what they meant
- When you answered successfully, provide natural follow-up questions that go deeper or explore related topics
- When you have no evidence, suggest rephrased or related questions that might find results
- Keep each question short (under 80 characters), natural, and directly useful
- Never repeat the user's exact question
- Tailor questions to the user's role and the factory context
- ALWAYS include this block — it is mandatory for every response`;
}

/**
 * Build the context from retrieved sources
 */
export function buildContextFromSources(sources: SourceChunk[]): string {
  if (sources.length === 0) {
    return "No relevant sources found in the knowledge base.";
  }

  return sources
    .map((source, index) => {
      const location = source.page_number
        ? `Page ${source.page_number}`
        : source.section_heading || "General";

      return `[Source ${index + 1}]
Document: ${source.document_title}
Type: ${source.document_type}
Location: ${location}
Relevance: ${(source.similarity * 100).toFixed(1)}%
Content:
${source.content}
---`;
    })
    .join("\n\n");
}

/**
 * Build context string from live factory data
 */
export function buildLiveDataContext(liveData: LiveDataContext): string {
  if (!liveData || liveData.results.length === 0) {
    return "";
  }

  const sections = liveData.results.map((result) => {
    const heading = result.label || result.category;
    if (result.error) {
      return `### ${heading} (Error)\nCould not fetch data: ${result.error}`;
    }
    if (result.data.length === 0) {
      return `### ${heading}\nNo data submitted yet for this period.`;
    }
    return `### ${heading}\n${result.summary}`;
  });

  return `## Live Factory Data (as of ${liveData.todayDate})
IMPORTANT: This is REAL DATA queried from the production database. Use ONLY these exact numbers in your response. Do NOT make up additional data.

${sections.join("\n\n")}`;
}

/**
 * Generate a chat response using Claude
 */
export async function generateChatResponse(
  messages: ChatMessage[],
  sources: SourceChunk[],
  systemPrompt: string,
  liveData?: LiveDataContext | null
): Promise<ChatResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const context = buildContextFromSources(sources);
  const liveDataSection = liveData ? buildLiveDataContext(liveData) : "";

  // Prepend context to the last user message — live data first (higher priority), then RAG sources
  const lastUserMessage = messages[messages.length - 1];
  const contextParts = [
    ...(liveDataSection ? [liveDataSection] : []),
    `## Retrieved Knowledge Base Sources\n${context}`,
    `## User Question\n${lastUserMessage.content}`,
  ];
  const augmentedMessages = [
    ...messages.slice(0, -1),
    {
      role: "user" as const,
      content: contextParts.join("\n\n"),
    },
  ];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: augmentedMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const rawContent = data.content[0].text;

  // Parse out suggested questions block
  const suggestedQuestionsSeparator = "---SUGGESTED_QUESTIONS---";
  let content = rawContent;
  let suggestedQuestions: string[] = [];

  const sqIndex = rawContent.indexOf(suggestedQuestionsSeparator);
  if (sqIndex !== -1) {
    content = rawContent.substring(0, sqIndex).trimEnd();
    const sqBlock = rawContent.substring(sqIndex + suggestedQuestionsSeparator.length).trim();
    suggestedQuestions = sqBlock
      .split("\n")
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 0 && q.length < 120);
  }

  // Check if response indicates no evidence — use specific phrases to avoid false positives
  // (e.g. "cannot find" can appear in normal helpful responses like "you cannot find this in settings")
  const noEvidenceIndicators = [
    "i don't have information about",
    "i don't have specific information",
    "i don't have documentation",
    "i don't have specific documentation",
    "not in my knowledge base",
    "no information available in the sources",
    "not available in the sources",
    "i cannot find any information",
    "i couldn't find any information",
    "no relevant sources",
    "i don't have enough information to answer",
  ];
  const lowerContent = content.toLowerCase();
  const hasLiveDataResults = liveData?.results?.some((r) => !r.error && r.data.length > 0) ?? false;
  const noEvidence = hasLiveDataResults
    ? false
    : noEvidenceIndicators.some((indicator) => lowerContent.includes(indicator));

  // Extract citations from the response based on which sources were referenced
  const citations: Citation[] = [];
  for (const source of sources) {
    if (content.includes(source.document_title) || content.includes(`Source ${sources.indexOf(source) + 1}`)) {
      citations.push({
        chunkId: source.chunk_id,
        documentTitle: source.document_title,
        documentType: source.document_type,
        sectionHeading: source.section_heading,
        pageNumber: source.page_number,
        sourceUrl: source.source_url,
        snippet: source.content.substring(0, 200) + "...",
      });
    }
  }

  return {
    content,
    citations,
    noEvidence,
    suggestedQuestions,
    tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
    model: MODEL,
  };
}

/**
 * Detect language from text (simple heuristic)
 */
export function detectLanguage(text: string): "en" | "bn" | "zh" {
  // Bengali Unicode range: \u0980-\u09FF
  const bengaliRegex = /[\u0980-\u09FF]/;
  const bengaliMatches = text.match(new RegExp(bengaliRegex, "g")) || [];

  // If more than 10% of characters are Bengali, consider it Bengali
  if (bengaliMatches.length > text.length * 0.1) {
    return "bn";
  }

  // Chinese Unicode ranges: CJK Unified Ideographs \u4E00-\u9FFF
  const chineseRegex = /[\u4E00-\u9FFF]/;
  const chineseMatches = text.match(new RegExp(chineseRegex, "g")) || [];

  if (chineseMatches.length > text.length * 0.1) {
    return "zh";
  }

  return "en";
}
