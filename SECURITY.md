# Security Policy

This document outlines the security architecture, threat mitigations, and operational guidelines for the NxtGenCore Discord Bot. It is intended for maintainers, contributors, and anyone deploying this software in a production environment.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication and Authorization](#authentication-and-authorization)
- [Secrets Management](#secrets-management)
- [External Service Integration](#external-service-integration)
- [Data Handling](#data-handling)
- [Rate Limiting and Abuse Prevention](#rate-limiting-and-abuse-prevention)
- [Known Limitations](#known-limitations)
- [Vulnerability Reporting](#vulnerability-reporting)
- [Review and Acknowledgments](#review-and-acknowledgments)

---

## Architecture Overview

The following diagram illustrates the trust boundaries and data flow across the system. Each boundary represents a distinct security domain.

```mermaid
graph TB
    subgraph Public["Public Network"]
        U["Discord Users"]
        EXT["External API Consumers"]
    end

    subgraph Discord["Discord Gateway (TLS)"]
        API["Discord API"]
    end

    subgraph Server["Application Server"]
        BOT["Bot Process"]
        EXPRESS["Express HTTP Server"]
        AUTH["API Auth Middleware"]
    end

    subgraph Internal["Internal Services"]
        DB["PostgreSQL Database"]
        AI["Ollama LLM (localhost)"]
        YTDLP["yt-dlp Subprocess"]
    end

    subgraph ThirdParty["Third-Party APIs (TLS)"]
        GOOGLE["Google Maps Geocoding"]
        WEATHER["Tomorrow.io Weather"]
        IQAIR["IQAir AQI"]
        GAMER["GamerPower Giveaways"]
    end

    U -->|Interactions| API
    API -->|WebSocket| BOT
    BOT -->|Queries| DB
    BOT -->|Prompt/Response| AI
    BOT -->|Audio Stream| YTDLP
    BOT -->|HTTP Requests| ThirdParty

    EXT -->|x-api-key| AUTH
    AUTH -->|Authorized| EXPRESS
    EXPRESS -->|Queries| DB

    style AUTH fill:#d4403a,color:#fff
    style DB fill:#336791,color:#fff
    style AI fill:#1a1a2e,color:#fff
```

---

## Authentication and Authorization

### Discord Commands

All slash commands are authenticated through Discord's interaction verification. Admin-restricted commands enforce permissions at registration time via `setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`.

| Command | Required Permission |
|---|---|
| `/setup` | Administrator |
| `/scan` | Administrator |
| `/admhelp` | Administrator |
| `/warnuser` | Administrator |
| `/stealemoji` | Manage Guild Expressions |
| `/stealsticker` | Manage Guild Expressions |
| `/stealreactions` | Manage Guild Expressions |
| All other commands | None (public) |

### Dashboard API

The HTTP API layer (`/api/*`) is protected by a middleware that enforces a dual-path authentication model:

```mermaid
flowchart TD
    REQ["Incoming Request"] --> CHECK_ORIGIN{"Sec-Fetch-Site\nsame-origin?"}
    CHECK_ORIGIN -->|Yes| ALLOW["Allow Request"]
    CHECK_ORIGIN -->|No| CHECK_KEY{"Valid\nx-api-key header?"}
    CHECK_KEY -->|Yes| ALLOW
    CHECK_KEY -->|No| REJECT["401 Unauthorized"]

    style ALLOW fill:#2d6a4f,color:#fff
    style REJECT fill:#d4403a,color:#fff
```

- **Same-origin requests** from the frontend (served by the same Express instance) are permitted automatically based on the `Sec-Fetch-Site` header.
- **External or programmatic requests** must include an `x-api-key` header matching the `API_SECRET` environment variable.
- All other requests are rejected with `401 Unauthorized`.

---

## Secrets Management

All sensitive credentials are stored in the `.env` file, which is excluded from version control via `.gitignore`. No secret values are logged, printed to stdout, or exposed through any API response.

| Variable | Purpose | Exposure Risk |
|---|---|---|
| `DISCORD_TOKEN` | Bot authentication with Discord Gateway | Full bot compromise |
| `DATABASE_PASSWORD` | PostgreSQL authentication | Database breach |
| `DATABASE_URL` | Full connection string (alternative to individual params) | Database breach |
| `API_SECRET` | Dashboard API key for external access | Unauthorized data access |
| `GOOGLE_MAPS_API_KEY` | Geocoding requests | Quota abuse / billing |
| `TOMORROW_API_KEY` | Weather data retrieval | Quota abuse |
| `IQAIR_API_KEY` | Air quality data retrieval | Quota abuse |

`cookies.txt` (YouTube session cookies for `yt-dlp`) is also git-ignored and should be treated as a credential. Rotate periodically.

---

## External Service Integration

### AI Endpoint (Ollama)

The `/aihelp` command communicates with a locally hosted Ollama instance. To prevent prompt injection, system instructions and user input are passed as structurally separate fields in the API payload:

```
{
  "system": "<system instructions>",
  "prompt": "<user input>"
}
```

The AI endpoint must remain bound to `localhost` and should never be exposed to the public network.

### yt-dlp (Audio Playback)

Audio streaming invokes `yt-dlp` as a child process using Node's `execFile` and `spawn` APIs, which do not pass arguments through a shell interpreter. This eliminates shell injection as an attack vector. All process references are tracked per guild and cleaned up on stop, skip, or disconnect.

### Third-Party HTTP APIs

Outbound requests to Google Maps, Tomorrow.io, IQAir, and GamerPower are made server-side over HTTPS. API keys are included only in server-to-server requests and are never embedded in client-facing responses or Discord messages.

---

## Data Handling

### Storage Scope

All user data is scoped per guild using a composite `(guild_id, discord_id)` key constraint. Data from one Discord server is never queryable or visible from another.

### Stored Fields

The following is the full extent of user data persisted in the database:

| Field | Type | Purpose |
|---|---|---|
| `discord_id` | bigint | User identifier |
| `guild_id` | bigint | Server identifier |
| `username` | text | Display name at time of join |
| `joined_at` | timestamp | Server join date |
| `introduction_message_id` | bigint | Reference to intro message |
| `is_active` | boolean | Whether user is still in server |

No message content, passwords, authentication tokens, or personally identifiable information beyond Discord usernames is stored.

### Discord Snowflake Handling

All Discord IDs are stored as PostgreSQL `bigint` to prevent JavaScript floating-point precision loss that occurs with standard `number` types for values exceeding `2^53`.

---

## Rate Limiting and Abuse Prevention

| Mechanism | Scope | Limit |
|---|---|---|
| `/scan` cooldown | Per guild | 5 minutes after completion |
| Logger rate limit | Global | 3-second minimum interval between log messages |
| Discord built-in | Per interaction | Enforced by Discord Gateway |

---

## Known Limitations

- **Dashboard auth is shared-secret based.** The `API_SECRET` model is suitable for single-operator deployments. Multi-tenant or multi-user dashboard access would require per-user token authentication (e.g., OAuth2 or JWT).
- **Log channel may contain stack traces.** The `logError` function sends error details (including stack traces) to a configured Discord channel. This channel should be restricted to bot operators only.
- **No pagination cap on `/scan`.** The scan command fetches all messages in a target channel. Extremely large channels (100k+ messages) may cause elevated memory usage or Discord API rate limiting.

---

## Vulnerability Reporting

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not** disclose the issue publicly (in GitHub issues, Discord channels, or social media).
2. Contact the project maintainer directly via private message or email.
3. Include a clear description of the vulnerability, steps to reproduce, and potential impact.
4. Allow reasonable time for a fix before any public disclosure.

---

## Review and Acknowledgments

This security audit was conducted using a custom-trained model for automated static analysis and vulnerability detection across the full codebase, covering authentication flows, data handling, external integrations, and command permission structures.

Individual review and verification was performed by **Marshal**, who validated the findings, confirmed the applied mitigations, and approved this document for release.
