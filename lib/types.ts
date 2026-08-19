export type Source = {
  title: string;
  url: string;
  content: string;
};

export type DemoSettings = {
  nebius: string;
  tavily: string;
  model: string;
  domain: string;
};

export type StreamEvent =
  | { type: "triage"; sources: Source[] }
  | { type: "token"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };
