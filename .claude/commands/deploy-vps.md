Deploy the current project to the OPIFEX VPS.

Follow these steps:

1. **Pre-flight check**: Run `git status` to confirm no uncommitted changes.

2. **Identify service**: Detect from current directory (Dockerfile, docker-compose.yml, systemd units). Ask if not clear.

3. **Build**:
   - Docker: `docker build -t <service-name>:latest .`
   - Node.js: `pnpm install && pnpm build`

4. **Deploy on VPS**:
   - systemd + git pull: `git pull && pnpm install && systemctl restart <service-name>`
   - Docker Compose: `docker compose pull && docker compose up -d`
   - Direct systemd: `systemctl restart <service-name>`

5. **Verify**:
   - `systemctl status <service-name> --no-pager` or `docker ps | grep <service-name>`
   - Test: `curl -s http://localhost:<port>/health`

6. **Report**: Service name, commit hash (`git rev-parse --short HEAD`), timestamp, verification result.

**VPS context:**
- Systemd + Docker stack, nginx reverse proxy (80/443)
- Key services: opifex-paperclip (systemd, /root/forge-workspace/opifex-paperclip), litellm, langfuse (Docker)
- Backup before touching nginx: `cp file file.bak.$(date +%s)`
- Validate before reload: `nginx -t` then `systemctl reload nginx`
