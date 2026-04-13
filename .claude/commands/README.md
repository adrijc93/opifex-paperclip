# Claude Code Slash Commands — OPIFEX

Custom slash commands for Claude Code in OPIFEX repos.

## Available commands

| Command | Description |
|---------|-------------|
| `/deploy-vps` | Build + deploy current service to OPIFEX VPS |
| `/review-pr` | Summarize PR diff + review checklist |
| `/status` | Show live status of all OPIFEX VPS services |

## Usage

In Claude Code, type `/` followed by the command name. Claude will execute the steps defined in the corresponding `.md` file.

## Adding commands

Create a new `.md` file in this directory. The filename (without `.md`) becomes the command name.

## Context

These commands are tailored for OPIFEX infrastructure:
- VPS: Hetzner, systemd + Docker
- Proxy: nginx (80/443)
- Stack: Node.js/pnpm, PostgreSQL, Docker Compose
- CI: GitHub Actions, pnpm typecheck + test:run
