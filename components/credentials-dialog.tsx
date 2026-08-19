"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { DEFAULT_DOMAIN, normalizeDomain } from "@/lib/domain";
import { DEFAULT_MODEL_ID, normalizeModelId } from "@/lib/models";
import { type DemoSettings } from "@/lib/types";

export type CredentialsDialogHandle = {
  open: () => void;
};

type CredentialsDialogProps = {
  onCredentialsChange: (settings: DemoSettings) => void;
  serverCredentials: { nebius: boolean; tavily: boolean };
};

export const CredentialsDialog = forwardRef<
  CredentialsDialogHandle,
  CredentialsDialogProps
>(function CredentialsDialog(
  { onCredentialsChange, serverCredentials },
  forwardedRef,
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const domainRef = useRef<HTMLInputElement>(null);
  const [nebius, setNebius] = useState("");
  const [tavily, setTavily] = useState("");
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [domainError, setDomainError] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [models, setModels] = useState<string[]>([DEFAULT_MODEL_ID]);
  const [modelsState, setModelsState] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState(false);

  const loadModels = async (browserKey?: string) => {
    setModelsState("loading");
    try {
      const response = await fetch("/api/models", {
        headers: browserKey ? { "x-nebius-api-key": browserKey } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Model catalog unavailable.");
      const payload = (await response.json()) as { models?: unknown };
      const nextModels = Array.isArray(payload.models)
        ? payload.models
            .map((value) => normalizeModelId(value))
            .filter((value): value is string => Boolean(value))
        : [];
      if (nextModels.length === 0) throw new Error("Model catalog is empty.");
      setModels(nextModels);
      setModel((current) => (nextModels.includes(current) ? current : nextModels[0]));
      setModelsState("ready");
    } catch {
      setModels((current) =>
        current.includes(DEFAULT_MODEL_ID) ? current : [DEFAULT_MODEL_ID],
      );
      setModelsState("error");
    }
  };

  useEffect(() => {
    const storedNebiusKey = sessionStorage.getItem("demo_nebius_key") ?? "";
    setNebius(storedNebiusKey);
    setTavily(sessionStorage.getItem("demo_tavily_key") ?? "");
    setDomain(normalizeDomain(sessionStorage.getItem("demo_domain")) ?? DEFAULT_DOMAIN);
    setModel(normalizeModelId(sessionStorage.getItem("demo_model")) ?? DEFAULT_MODEL_ID);
    void loadModels(storedNebiusKey);
  }, []);

  const open = () => {
    setSaved(false);
    setDomainError("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => domainRef.current?.focus());
    void loadModels(sessionStorage.getItem("demo_nebius_key") ?? "");
  };

  useImperativeHandle(forwardedRef, () => ({ open }));

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const save = () => {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      setDomainError("Enter a valid domain, such as example.com.");
      domainRef.current?.focus();
      return;
    }

    if (nebius) sessionStorage.setItem("demo_nebius_key", nebius);
    else sessionStorage.removeItem("demo_nebius_key");
    if (tavily) sessionStorage.setItem("demo_tavily_key", tavily);
    else sessionStorage.removeItem("demo_tavily_key");
    sessionStorage.setItem("demo_domain", normalizedDomain);
    sessionStorage.setItem("demo_model", model);
    sessionStorage.removeItem("demo_model_profile");
    setDomain(normalizedDomain);
    onCredentialsChange({ nebius, tavily, model, domain: normalizedDomain });
    setSaved(true);
    window.setTimeout(() => dialogRef.current?.close(), 360);
  };

  const clear = () => {
    setNebius("");
    setTavily("");
    sessionStorage.removeItem("demo_nebius_key");
    sessionStorage.removeItem("demo_tavily_key");
    onCredentialsChange({
      nebius: "",
      tavily: "",
      model,
      domain: normalizeDomain(domain) ?? DEFAULT_DOMAIN,
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="credentials-dialog"
      aria-labelledby="credentials-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className="dialog-head">
        <div>
          <div className="dialog-title-row">
            <h2 id="credentials-title">Configuration</h2>
          </div>
          <p>Set the approved answer domain, inference profile, and API credentials.</p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close configuration"
        >
          <CloseIcon className="icon" />
        </button>
      </div>

      <div className="server-readiness" aria-label="Server credential status">
        <span data-ready={serverCredentials.nebius}>
          <CheckIcon className="mini-icon" /> Nebius server key
        </span>
        <span data-ready={serverCredentials.tavily}>
          <CheckIcon className="mini-icon" /> Tavily server key
        </span>
      </div>

      <div className="field-group">
        <label htmlFor="answer-domain">Approved answer domain</label>
        <div className="text-field">
          <input
            ref={domainRef}
            id="answer-domain"
            type="text"
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value);
              setDomainError("");
            }}
            placeholder="example.com"
            maxLength={253}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(domainError)}
            aria-describedby="domain-help"
            data-state={domainError ? "error" : "default"}
          />
        </div>
        <p id="domain-help" className={domainError ? "field-help is-error" : "field-help"}>
          {domainError || "Search and answers are restricted to this domain and its subdomains."}
        </p>
      </div>

      <div className="field-group">
        <label htmlFor="inference-model">Inference model</label>
        <div className="select-field">
          <select
            id="inference-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        </div>
        <p className="field-help">
          {modelsState === "loading"
            ? "Loading the Token Factory catalog…"
            : modelsState === "error"
              ? "Catalog unavailable. Add a valid Nebius key and reopen Configuration."
              : `${models.length} available models loaded from Token Factory.`}
        </p>
      </div>

      <div className="field-group">
        <label htmlFor="nebius-key">Nebius Token Factory API key</label>
        <div className="secret-field">
          <input
            id="nebius-key"
            type="password"
            value={nebius}
            onChange={(event) => setNebius(event.target.value)}
            onBlur={() => void loadModels(nebius)}
            placeholder={serverCredentials.nebius ? "Using server environment" : "Paste Nebius key"}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="field-help">Leave blank to use `NEBIUS_API_KEY` from the server.</p>
      </div>

      <div className="field-group">
        <label htmlFor="tavily-key">Tavily API key</label>
        <div className="secret-field">
          <input
            id="tavily-key"
            type="password"
            value={tavily}
            onChange={(event) => setTavily(event.target.value)}
            placeholder={serverCredentials.tavily ? "Using server environment" : "Paste Tavily key"}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="field-help">Leave blank to use `TAVILY_API_KEY` from the server.</p>
      </div>

      <p className="security-note">
        Browser-entered keys stay in session storage, travel only to this app’s server over
        HTTPS, and clear when the tab closes.
      </p>

      <div className="dialog-actions">
        <button className="button button-secondary" type="button" onClick={clear}>
          Use server keys
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={save}
          data-state={saved ? "success" : "default"}
        >
          {saved ? <><CheckIcon className="button-icon" /> Saved</> : "Save for this tab"}
        </button>
      </div>
    </dialog>
  );
});
