"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowIcon,
  ExternalIcon,
  KeyIcon,
  SendIcon,
  ShieldIcon,
} from "@/components/icons";
import {
  CredentialsDialog,
  type CredentialsDialogHandle,
} from "@/components/credentials-dialog";
import {
  DEFAULT_DOMAIN,
  isUrlWithinDomain,
  normalizeDomain,
} from "@/lib/domain";
import {
  type DemoSettings,
  type Source,
  type StreamEvent,
} from "@/lib/types";
import { DEFAULT_MODEL_ID, normalizeModelId } from "@/lib/models";

const PROMPTS = [
  {
    label: "How can I access my account?",
    question: "How can customers get help accessing or managing their account?",
  },
  {
    label: "What discounts are available?",
    question: "What discounts, fee waivers, or savings are available?",
  },
  {
    label: "How do I resolve a payment issue?",
    question: "What support is available for payments or transfers?",
  },
];

const FOLLOW_UP_PROMPTS = [
  { label: "Explain that simply", question: "Can you explain that in simpler terms?" },
  { label: "What should I do next?", question: "What should I do next?" },
  { label: "Any other options?", question: "Are there any other options?" },
];

const MAX_SESSION_TURNS = 12;

type Stage = "idle" | "triage" | "generate" | "complete" | "error";

type ConversationTurn = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  error: string;
};

function formatHost(url: string, fallback: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

function findApprovedSource(href: string | undefined, sources: Source[]) {
  if (!href) return undefined;

  try {
    const candidate = new URL(href).href;
    return sources.find((source) => new URL(source.url).href === candidate);
  } catch {
    return undefined;
  }
}

function linkInlineCitations(text: string, sources: Source[]) {
  return text.replace(
    /\[(\d+(?:\s*,\s*\d+)*)\](?!\s*\()/g,
    (original, citationList: string) => {
      const sourceNumbers = citationList
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10));

      if (
        sourceNumbers.some(
          (sourceNumber) =>
            !Number.isInteger(sourceNumber) ||
            sourceNumber < 1 ||
            sourceNumber > sources.length,
        )
      ) {
        return original;
      }

      return sourceNumbers
        .map((sourceNumber) => {
          const href = new URL(sources[sourceNumber - 1].url).href.replace(/>/g, "%3E");
          return `[${sourceNumber}](<${href}>)`;
        })
        .join(", ");
    },
  );
}

function AnswerMarkdown({ text, sources }: { text: string; sources: Source[] }) {
  const markdown = linkInlineCitations(text, sources);

  return (
    <ReactMarkdown
      skipHtml
      allowedElements={[
        "p",
        "strong",
        "em",
        "ul",
        "ol",
        "li",
        "a",
        "h1",
        "h2",
        "h3",
        "blockquote",
        "code",
        "pre",
        "br",
        "hr",
      ]}
      unwrapDisallowed
      urlTransform={(url) => (findApprovedSource(url, sources) ? url : "")}
      components={{
        a({ href, children }) {
          const source = findApprovedSource(href, sources);
          if (!source || !href) return <span>{children}</span>;

          const label = String(children);
          const isCitation = /^\d+$/.test(label);
          return (
            <a
              className={isCitation ? "answer-citation" : "answer-link"}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={isCitation ? `Open source ${label}: ${source.title}` : undefined}
              title={source.title}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export function SupportWorkbench() {
  const settingsRef = useRef<CredentialsDialogHandle>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [credentials, setCredentials] = useState<DemoSettings>({
    nebius: "",
    tavily: "",
    model: DEFAULT_MODEL_ID,
    domain: DEFAULT_DOMAIN,
  });
  const [serverCredentials, setServerCredentials] = useState({ nebius: false, tavily: false });
  const busy = stage === "triage" || stage === "generate";
  const latestTurn = turns[turns.length - 1];
  const latestSources = latestTurn?.sources ?? [];
  const latestError = latestTurn?.error ?? "";

  useEffect(() => {
    const storedModel = normalizeModelId(sessionStorage.getItem("demo_model"));
    const storedDomain = normalizeDomain(sessionStorage.getItem("demo_domain"));
    const domain = storedDomain ?? DEFAULT_DOMAIN;
    setCredentials({
      nebius: sessionStorage.getItem("demo_nebius_key") ?? "",
      tavily: sessionStorage.getItem("demo_tavily_key") ?? "",
      model: storedModel ?? DEFAULT_MODEL_ID,
      domain,
    });

    try {
      const storedConversation = JSON.parse(
        sessionStorage.getItem("demo_conversation") ?? "null",
      ) as { domain?: unknown; turns?: unknown } | null;
      if (storedConversation?.domain === domain && Array.isArray(storedConversation.turns)) {
        const restoredTurns = storedConversation.turns
          .filter(
            (turn): turn is Record<string, unknown> =>
              Boolean(turn) && typeof turn === "object" && !Array.isArray(turn),
          )
          .map((turn, index): ConversationTurn | null => {
            const restoredSources = Array.isArray(turn.sources)
              ? turn.sources
                  .filter(
                    (source): source is Record<string, unknown> =>
                      Boolean(source) &&
                      typeof source === "object" &&
                      !Array.isArray(source) &&
                      typeof source.title === "string" &&
                      typeof source.url === "string" &&
                      isUrlWithinDomain(source.url, domain),
                  )
                  .map((source) => ({
                    title: source.title as string,
                    url: source.url as string,
                    content: "",
                  }))
              : [];
            const restoredQuestion =
              typeof turn.question === "string" ? turn.question.slice(0, 1_000) : "";
            const restoredAnswer =
              typeof turn.answer === "string" ? turn.answer.slice(0, 5_000) : "";
            if (!restoredQuestion || !restoredAnswer) return null;

            return {
              id: typeof turn.id === "string" ? turn.id : `restored-${index}`,
              question: restoredQuestion,
              answer: restoredAnswer,
              sources: restoredSources,
              error: "",
            };
          })
          .filter((turn): turn is ConversationTurn => Boolean(turn))
          .slice(-MAX_SESSION_TURNS);
        setTurns(restoredTurns);
      }
    } catch {
      sessionStorage.removeItem("demo_conversation");
    }
    setSessionLoaded(true);

    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data?.serverCredentials) setServerCredentials(data.serverCredentials);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!sessionLoaded || busy) return;

    const storedTurns = turns.slice(-MAX_SESSION_TURNS).map((turn) => ({
      ...turn,
      sources: turn.sources.map((source) => ({
        title: source.title,
        url: source.url,
        content: "",
      })),
    }));
    try {
      sessionStorage.setItem(
        "demo_conversation",
        JSON.stringify({ domain: credentials.domain, turns: storedTurns }),
      );
    } catch {
      // Session storage is optional; the in-memory conversation still works.
    }
  }, [busy, credentials.domain, sessionLoaded, turns]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [turns]);

  const credentialReady =
    (Boolean(credentials.nebius) || serverCredentials.nebius) &&
    (Boolean(credentials.tavily) || serverCredentials.tavily);

  const ask = async (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || stage === "triage" || stage === "generate") return;

    if (!credentialReady) {
      settingsRef.current?.open();
      return;
    }

    const turnId = crypto.randomUUID();
    const history = turns
      .filter((turn) => turn.answer)
      .slice(-6)
      .map((turn) => ({ question: turn.question, answer: turn.answer }));

    setQuestion("");
    setTurns((current) => [
      ...current,
      { id: turnId, question: trimmed, answer: "", sources: [], error: "" },
    ].slice(-MAX_SESSION_TURNS));
    setActiveTurnId(turnId);
    setStage("triage");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(credentials.nebius ? { "x-nebius-api-key": credentials.nebius } : {}),
          ...(credentials.tavily ? { "x-tavily-api-key": credentials.tavily } : {}),
        },
        body: JSON.stringify({
          question: trimmed,
          model: credentials.model,
          domain: credentials.domain,
          history,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The response stream did not open.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const consumeEvent = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as StreamEvent;

        if (event.type === "triage") {
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId ? { ...turn, sources: event.sources } : turn,
            ),
          );
          setStage("generate");
        } else if (event.type === "token") {
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? { ...turn, answer: turn.answer + event.delta }
                : turn,
            ),
          );
        } else if (event.type === "done") {
          setStage("complete");
          setActiveTurnId(null);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) consumeEvent(line);
      }
      if (buffer.trim()) consumeEvent(buffer);
    } catch (caught) {
      setStage("error");
      setActiveTurnId(null);
      const message = caught instanceof Error ? caught.message : "The support request failed.";
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId ? { ...turn, error: message } : turn,
        ),
      );
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  const updateSettings = (nextSettings: DemoSettings) => {
    if (nextSettings.domain !== credentials.domain) {
      setTurns([]);
      setActiveTurnId(null);
      setStage("idle");
    }
    setCredentials(nextSettings);
  };

  const clearConversation = () => {
    if (busy) return;
    setTurns([]);
    setActiveTurnId(null);
    setStage("idle");
    sessionStorage.removeItem("demo_conversation");
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="Nebius Token Factory demo home">
            <img src="/nebius-logo.svg" alt="Nebius" width="131" height="36" />
            <span className="brand-product">Token Factory · Customer support demo</span>
          </a>
          <button
            className="command-trigger"
            type="button"
            onClick={() => settingsRef.current?.open()}
            aria-label="Configure API credentials"
          >
            <KeyIcon className="command-icon" />
            <span>Configure credentials</span>
            <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>

      <main id="top" className="app-shell wrap">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <h1 id="page-title">Customer support triage</h1>
            <p className="intro-audience">For fintech enterprises</p>
          </div>
          <div className="intro-detail">
            <p>
              Retrieve from an approved domain and stream concise, grounded answers for frontline
              support teams.
            </p>
          </div>
        </section>

        <section id="console" className="workbench" aria-label="Live support workbench">
          <div className="console-panel">
            <div className="panel-head">
              <div>
                <h2>Customer conversation</h2>
                <p>Responses are limited to retrieved pages from {credentials.domain}.</p>
              </div>
              <div className="panel-actions">
                {turns.length > 0 ? (
                  <button
                    className="clear-conversation"
                    type="button"
                    onClick={clearConversation}
                    disabled={busy}
                  >
                    New conversation
                  </button>
                ) : null}
                <span className="grounding-badge"><ShieldIcon /> {credentials.domain} only</span>
              </div>
            </div>

            <div className="conversation" aria-live="polite" ref={conversationRef}>
              {turns.length === 0 ? (
                <div className="empty-conversation">
                  <ShieldIcon className="empty-icon" />
                  <h3>Ask a customer support question</h3>
                  <p>The grounded answer and approved sources will appear here.</p>
                </div>
              ) : (
                turns.map((turn) => {
                  const isActive = turn.id === activeTurnId;
                  return (
                    <div className="conversation-turn" key={turn.id}>
                      <div className="message message-user">
                        <span className="message-role">Customer</span>
                        <p>{turn.question}</p>
                      </div>
                      <div
                        className="message message-assistant"
                        data-state={isActive ? stage : turn.error ? "error" : "complete"}
                      >
                        <span className="message-role">Nebius Demo Assistant</span>
                        {turn.answer ? (
                          <div className="answer-copy">
                            <AnswerMarkdown text={turn.answer} sources={turn.sources} />
                          </div>
                        ) : null}
                        {isActive && busy && !turn.answer ? (
                          <div className="answer-skeleton" aria-label="Preparing answer">
                            <span />
                            <span />
                            <span />
                          </div>
                        ) : null}
                        {turn.error ? <p className="inline-error">{turn.error}</p> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {latestSources.length > 0 ? (
              <div className="sources-block">
                <div className="sources-heading">
                  <h3>Approved sources</h3>
                  <span>{latestSources.length} approved {latestSources.length === 1 ? "page" : "pages"}</span>
                </div>
                <ol>
                  {latestSources.map((source, index) => (
                    <li key={source.url}>
                      <span className="source-number">{index + 1}</span>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        <span>{source.title}</span>
                        <small>{formatHost(source.url, credentials.domain)}</small>
                        <ExternalIcon className="source-icon" />
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <form className="composer" onSubmit={submit} data-state={latestError ? "error" : "default"}>
              <label htmlFor="question">
                {turns.length > 0 ? "Continue the conversation" : `Ask about ${credentials.domain}`}
              </label>
              <div className="composer-row">
                <input
                  id="question"
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={turns.length > 0 ? "Ask a follow-up question…" : "Example: What support options are available?"}
                  maxLength={1_000}
                  disabled={busy}
                  aria-describedby="composer-help"
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={busy || !question.trim()}
                  data-state={busy ? "loading" : "default"}
                  aria-label={busy ? "Generating answer" : "Send question"}
                >
                  {busy ? <span className="spinner" /> : <SendIcon />}
                </button>
              </div>
              <div className="composer-meta" id="composer-help">
                <span>Enter to send · Conversation stays in this tab</span>
                <span>{question.length}/1,000</span>
              </div>
            </form>

            <div className="prompt-row" aria-label="Example questions">
              {turns.length === 0
                ? PROMPTS.map((prompt) => (
                    <button key={prompt.label} type="button" onClick={() => void ask(prompt.question)} disabled={busy}>
                      {prompt.label}<ArrowIcon />
                    </button>
                  ))
                : FOLLOW_UP_PROMPTS.map((followUp) => (
                    <button key={followUp.label} type="button" onClick={() => void ask(followUp.question)} disabled={busy}>
                      {followUp.label}<ArrowIcon />
                    </button>
                  ))}
            </div>
          </div>
        </section>

      </main>

      <CredentialsDialog
        ref={settingsRef}
        onCredentialsChange={updateSettings}
        serverCredentials={serverCredentials}
      />
    </>
  );
}
