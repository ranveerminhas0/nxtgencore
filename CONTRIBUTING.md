# Contributing to NxtGenCore

Thank you for your interest in contributing to NxtGenCore. This document outlines the standards and process for contributing to the project.

---

## Code of Conduct

This project and everyone participating in it is governed by a standard Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

### Reporting Issues

The following diagram illustrates how to report bugs or suggest enhancements.

```mermaid
graph TD
    classDef default fill:#fff,stroke:#333,stroke-width:2px,color:#000;
    
    subgraph "Start"
        A[Detect Issue or Have Idea] --> B{Type?}
    end

    subgraph "Bug Report"
        B -->|Bug| C[Check Existing Issues]
        C -->|Not Found| D[Create New Issue]
        D --> D1[Clear Title]
        D1 --> D2[Steps to Reproduce]
        D2 --> D3[Expected vs Actual Behavior]
    end

    subgraph "Enhancement"
        B -->|Enhancement| E[Check Existing Requests]
        E -->|Not Found| F[Create New Issue]
        F --> F1[Clear Title]
        F1 --> F2[Detailed Description]
        F2 --> F3[Explain Utility/Value]
    end

    class A,B,C,D,D1,D2,D3,E,F,F1,F2,F3 default;
    style A fill:#f9f,stroke:#333,stroke-width:2px,color:#000
```

### Pull Request Workflow

Once you are ready to contribute code, follow this workflow.

```mermaid
graph TD
    classDef default fill:#fff,stroke:#333,stroke-width:2px,color:#000;

    subgraph "Preparation"
        G[Ready to Contribute] --> H[Fork Repository]
        H --> I[Clone Locally]
        I --> J[Create Branch]
    end

    subgraph "Development"
        J --> K[Write Code & Tests]
        K --> L{Tests Pass?}
        L -->|No| K
        L -->|Yes| M[Commit & Push]
    end

    subgraph "Review"
        M --> N[Open Pull Request]
        N --> O[CI Checks]
        O -->|Fail| K
        O -->|Pass| P[Manual Review]
        P -->|Approved| Q[Merge to Main]
        P -->|Changes Requested| K
    end

    class G,H,I,J,K,L,M,N,O,P,Q default;
    style Q fill:#9f9,stroke:#333,stroke-width:2px,color:#000
```

---

## Development Guide

### Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in the required values.
    ```bash
    cp .env.example .env
    ```
3.  **Start Development Server**:
    ```bash
    npm run dev
    ```

### Project Structure

- `server/`: Backend logic, API routes, and bot commands.
- `shared/`: Shared types and schema definitions (Drizzle ORM).
- `client/`: Frontend dashboard code (if applicable).
- `.github/`: CI/CD workflows.

### Testing

We use [Vitest](https://vitest.dev/) for testing.

*   Run all tests:
    ```bash
    npm test
    ```
*   Run tests in watch mode:
    ```bash
    npm test -- --watch
    ```

**Requirement**: All new features must include unit tests. PRs with failing tests will be automatically rejected by CI.

---

## Style Guide

### TypeScript

- Use **TypeScript** for all new code.
- Avoid `any` types whenever possible. Use explicit types or interfaces.
- Interfaces over Types generally.

### No Emojis

*   **Strict Rule**: Do not use emojis in:
    *   Code comments
    *   Commit messages
    *   Documentation (except this welcome message)
    *   Pull Request titles
*   Keep it professional and clean.

---

## Review Process

All Pull Requests go through a strict review process:

1.  **Automated CI Checks**: GitHub Actions will automatically run `npm test`. If this fails, the PR cannot be merged.
2.  **Manual Code Review**: A maintainer (e.g., **Marshal**) must manually review the code.
3.  **Approval**: Changes will only be merged after explicit approval from a maintainer.

**Do not merge your own PRs.**
