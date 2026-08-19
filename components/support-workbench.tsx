"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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

type Stage = "idle" | "triage" | "generate" | "complete" | "error";

function formatHost(url: string, fallback: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

export function SupportWorkbench() {
  const settingsRef = useRef<CredentialsDialogHandle>(null);
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<DemoSettings>({
    nebius: "",
    tavily: "",
    model: DEFAULT_MODEL_ID,
    domain: DEFAULT_DOMAIN,
  });
  const [serverCredentials, setServerCredentials] = useState({ nebius: false, tavily: false });

  useEffect(() => {
    const storedModel = normalizeModelId(sessionStorage.getItem("demo_model"));
    const storedDomain = normalizeDomain(sessionStorage.getItem("demo_domain"));
    setCredentials({
      nebius: sessionStorage.getItem("demo_nebius_key") ?? "",
      tavily: sessionStorage.getItem("demo_tavily_key") ?? "",
      model: storedModel ?? DEFAULT_MODEL_ID,
      domain: storedDomain ?? DEFAULT_DOMAIN,
    });

    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data?.serverCredentials) setServerCredentials(data.serverCredentials);
      })
      .catch(() => undefined);
  }, []);

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

    setQuestion("");
    setAskedQuestion(trimmed);
    setAnswer("");
    setSources([]);
    setError("");
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
          setSources(event.sources);
          setStage("generate");
        } else if (event.type === "token") {
          setAnswer((current) => current + event.delta);
        } else if (event.type === "done") {
          setStage("complete");
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
      setError(caught instanceof Error ? caught.message : "The support request failed.");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  const busy = stage === "triage" || stage === "generate";

  const updateSettings = (nextSettings: DemoSettings) => {
    if (nextSettings.domain !== credentials.domain) {
      setAskedQuestion("");
      setAnswer("");
      setSources([]);
      setError("");
      setStage("idle");
    }
    setCredentials(nextSettings);
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="Nebius Token Factory demo home">
            <img src="/nebius-logo.svg" alt="Nebius" width="131" height="36" />
            <span className="brand-product">Token Factory · Customer support demo</span>
          </a>
          <nav className="topnav" aria-label="Page navigation">
            <a href="#console">Live console</a>
          </nav>
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

      <main id="top">
        <section className="intro wrap" aria-labelledby="page-title">
          <div className="intro-copy reveal-one">
            <h1 id="page-title">Customer Support Triaging Agent</h1>
            <p className="intro-audience">For Fintech Enterprises</p>
          </div>
          <div className="intro-detail reveal-two">
            <p>
              An enterprise triage workflow that retrieves from an approved domain and streams
              a concise, grounded answer through Nebius Token Factory.
            </p>
          </div>
        </section>

        <section id="console" className="workbench wrap" aria-label="Live support workbench">
          <div className="console-panel">
            <div className="panel-head">
              <div>
                <h2>Customer conversation</h2>
                <p>Responses are limited to retrieved pages from {credentials.domain}.</p>
              </div>
              <span className="grounding-badge"><ShieldIcon /> {credentials.domain} only</span>
            </div>

            <div className="conversation" aria-live="polite">
              {!askedQuestion ? (
                <div className="empty-conversation">
                  <ShieldIcon className="empty-icon" />
                  <h3>Ask a customer support question</h3>
                  <p>The grounded answer and approved sources will appear here.</p>
                </div>
              ) : (
                <>
                  <div className="message message-user">
                    <span className="message-role">Customer</span>
                    <p>{askedQuestion}</p>
                  </div>
                  <div className="message message-assistant" data-state={stage}>
                    <span className="message-role">Nebius Demo Assistant</span>
                    {answer ? <p className="answer-copy">{answer}</p> : null}
                    {busy && !answer ? (
                      <div className="answer-skeleton" aria-label="Preparing answer">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : null}
                    {error ? <p className="inline-error">{error}</p> : null}
                  </div>
                </>
              )}
            </div>

            {sources.length > 0 ? (
              <div className="sources-block">
                <div className="sources-heading">
                  <h3>Approved sources</h3>
                  <span>{sources.length} approved {sources.length === 1 ? "page" : "pages"}</span>
                </div>
                <ol>
                  {sources.map((source, index) => (
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

            <form className="composer" onSubmit={submit} data-state={error ? "error" : "default"}>
              <label htmlFor="question">Ask about {credentials.domain}</label>
              <div className="composer-row">
                <input
                  id="question"
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Example: What support options are available?"
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
                <span>Enter to send · Answers cite approved pages</span>
                <span>{question.length}/1,000</span>
              </div>
            </form>

            <div className="prompt-row" aria-label="Example questions">
              {PROMPTS.map((prompt) => (
                <button key={prompt.label} type="button" onClick={() => void ask(prompt.question)} disabled={busy}>
                  {prompt.label}<ArrowIcon />
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
