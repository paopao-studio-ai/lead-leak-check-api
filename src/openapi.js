// OpenAPI 3.1 description. `npm run build` also writes it to ../openapi.json.
const finding = {
  type: "object",
  required: ["id", "severity", "title", "why", "fix", "evidence"],
  properties: {
    id: { type: "string", example: "no-owner" },
    severity: { type: "string", enum: ["high", "medium", "low", "verify"] },
    title: { type: "string", example: "Nobody owns the first reply" },
    why: { type: "string" },
    fix: { type: "string" },
    evidence: { type: "string" },
  },
};
const report = {
  type: "object",
  required: ["pipeline", "risk_score", "counts", "findings", "notes"],
  properties: {
    pipeline: { type: "string" },
    risk_score: { type: "integer", minimum: 0, maximum: 100, description: "0 = no known risk, 100 = leaking everywhere" },
    counts: {
      type: "object",
      properties: { high: { type: "integer" }, medium: { type: "integer" }, low: { type: "integer" }, verify: { type: "integer" } },
    },
    findings: { type: "array", items: { $ref: "#/components/schemas/Finding" }, description: "Sorted high → verify" },
    notes: { type: "array", items: { type: "string" } },
    report_markdown: { type: "string", description: "Omitted when include_markdown=false" },
  },
};
const includeMd = { name: "include_markdown", in: "query", schema: { type: "boolean", default: true }, description: "Set false to omit report_markdown." };
const reportResp = {
  200: { description: "Risk report", content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } } },
  400: { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  401: { description: "Missing or invalid gateway secret" },
  413: { description: "Body larger than 1 MB" },
};

export default {
  openapi: "3.1.0",
  info: {
    title: "Lead Leak Check API",
    version: "0.1.0",
    license: { name: "MIT" },
    description:
      "Audit a Zapier, Make or n8n lead pipeline and get a 0-100 leak-risk score with ranked findings and fixes. " +
      "Deterministic rules, no logins, no storage, no outbound calls. Unstated safeguards are reported as 'verify', never as safe.",
  },
  servers: [{ url: "https://lead-leak-check-api.<your-subdomain>.workers.dev" }],
  security: [{ originKey: [] }, { rapidApiProxySecret: [] }],
  paths: {
    "/health": { get: { summary: "Liveness check", security: [], responses: { 200: { description: "OK" } } } },
    "/v1/rules": {
      get: {
        summary: "List the 15 leak rules",
        operationId: "listRules",
        responses: { 200: { description: "Rule catalog", content: { "application/json": { schema: { type: "object", properties: { rules: { type: "array", items: { type: "object" } } } } } } } },
      },
    },
    "/v1/check": {
      get: {
        summary: "Score a structured pipeline config (query string)",
        operationId: "checkPipelineGet",
        parameters: [
          { name: "config", in: "query", required: true, schema: { type: "string" }, description: "PipelineConfig as a JSON string", example: '{"name":"Form -> Sheet","routing":{"owner_assignment":"none"},"monitoring":{"error_alerts":false}}' },
          includeMd,
        ],
        responses: reportResp,
      },
      post: {
        summary: "Score a structured pipeline config (JSON body)",
        operationId: "checkPipeline",
        parameters: [includeMd],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PipelineConfig" } } } },
        responses: reportResp,
      },
    },
    "/v1/check-description": {
      get: {
        summary: "Score a plain-English pipeline description (query string)",
        operationId: "checkDescriptionGet",
        parameters: [
          { name: "text", in: "query", required: true, schema: { type: "string", maxLength: 4000 }, example: "Typeform leads go to Google Sheets via Zapier on the free plan. Nobody is assigned. No error alerts." },
          includeMd,
        ],
        responses: reportResp,
      },
      post: {
        summary: "Score a plain-English pipeline description",
        operationId: "checkDescription",
        parameters: [includeMd],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } } },
            "text/plain": { schema: { type: "string" } },
          },
        },
        responses: reportResp,
      },
    },
    "/v1/analyze-history": {
      get: {
        summary: "Analyze a run-history CSV (query string)",
        operationId: "analyzeHistoryGet",
        parameters: [
          { name: "csv", in: "query", required: true, schema: { type: "string" }, description: "CSV with a header row; needs a status column, timestamp optional" },
          { name: "expected_interval_minutes", in: "query", schema: { type: "number", exclusiveMinimum: 0 } },
          includeMd,
        ],
        responses: reportResp,
      },
      post: {
        summary: "Analyze a run-history CSV export",
        operationId: "analyzeHistory",
        parameters: [{ name: "expected_interval_minutes", in: "query", schema: { type: "number", exclusiveMinimum: 0 } }, includeMd],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", required: ["csv"], properties: { csv: { type: "string" }, expected_interval_minutes: { type: "number" } } } },
            "text/csv": { schema: { type: "string" } },
          },
        },
        responses: reportResp,
      },
    },
  },
  components: {
    securitySchemes: {
      originKey: { type: "apiKey", in: "header", name: "X-Origin-Key", description: "Shared secret set by the marketplace gateway" },
      rapidApiProxySecret: { type: "apiKey", in: "header", name: "X-RapidAPI-Proxy-Secret" },
    },
    schemas: {
      Finding: finding,
      Report: report,
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
      PipelineConfig: {
        type: "object",
        description: "Every field is optional; true = in place, false = missing, omitted = not stated (reported as 'verify').",
        properties: {
          name: { type: "string" },
          sources: { type: "array", items: { type: "object", properties: { type: { type: "string", example: "web_form" }, required_contact_field: { type: "boolean" }, logged_to_storage: { type: "boolean" } } } },
          storage: { type: "object", properties: { type: { type: "string", example: "google_sheets" }, dedupe: { type: "boolean" } } },
          routing: { type: "object", properties: { owner_assignment: { type: "string", example: "round_robin" }, after_hours_coverage: { type: "boolean" } } },
          response: { type: "object", properties: { sla_minutes: { type: "number" }, auto_ack: { type: "boolean" }, ai_drafts: { type: "boolean" }, human_send_step: { type: "boolean" } } },
          monitoring: { type: "object", properties: { error_alerts: { type: "boolean" }, unanswered_lead_alert: { type: "boolean" }, run_history_review: { type: "string", example: "weekly" } } },
          automation: { type: "object", properties: { platform: { type: "string", example: "zapier" }, plan: { type: "string", example: "free" } } },
          timezone: { type: "object", properties: { business_tz: { type: "string" }, automation_tz: { type: "string" } } },
          follow_up: { type: "object", properties: { sequence: { type: "boolean" } } },
        },
      },
    },
  },
};
