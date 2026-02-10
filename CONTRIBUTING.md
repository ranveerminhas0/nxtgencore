# Contributing to NxtGenCore

Thank you for your interest in contributing! We welcome improvements, bug fixes, and new features.

## Getting Started

1.  **Fork** the repository on GitHub.
2.  **Clone** your fork locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/Discord-Onboarder-Bot.git
    cd Discord-Onboarder-Bot
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Create a Branch** for your changes:
    ```bash
    git checkout -b feature/my-new-feature
    # or
    git checkout -b fix/bug-fix-name
    ```

## Development Standards

*   **Language**: TypeScript only.
*   **No Emojis**: Do not use emojis in code comments, commit messages, or documentation.
*   **Linting**: Ensure code is clean and readable.

## Testing

We use [Vitest](https://vitest.dev/) for testing. Before submitting any changes, you **must** run the test suite and ensure everything passes.

```bash
npm test
```

If you add new features, please include relevant tests in the `server/*.test.ts` files.

## Submitting specific Changes

1.  **Commit** your changes with clear, descriptive messages:
    ```bash
    git commit -m "fix: resolve issue with database connection"
    ```
2.  **Push** to your fork:
    ```bash
    git push origin feature/my-new-feature
    ```
3.  **Open a Pull Request** (PR) to the `main` branch of the original repository.

##/ Review Process

All Pull Requests require:
1.  **Automated Tests to Pass**: The CI system will automatically run `npm test`.
2.  **Manual Approval**: A maintainer (e.g., **Marshal**) must manually review and approve your changes before they can be merged.

Do not merge your own PRs. Wait for a review.
