Show the current status of OPIFEX VPS services.

Run the following checks and summarize results:

1. **Systemd services**:
   ```bash
   systemctl status opifex-paperclip opifex-board opifex-mem0 agent-comms-monitor openclaw-gateway --no-pager -l 2>/dev/null | grep -E "Active:|●|failed"
   ```

2. **Docker containers**:
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   ```

3. **Nginx**:
   ```bash
   systemctl status nginx --no-pager | grep -E "Active:|●"
   nginx -t 2>&1
   ```

4. **Key port check**:
   ```bash
   ss -tlnp | grep -E ":(80|443|3000|3001|3002|3003|3100|5432|8010|8080)\s"
   ```

5. **Resources**:
   ```bash
   df -h / && free -h
   ```

Format output as a status table:
- ✅ Service — running / healthy
- ❌ Service — stopped / failed
- ⚠️ Service — degraded / warning

**Known services:**
| Service | Type | Port |
|---------|------|------|
| opifex-paperclip | systemd | 3100 |
| opifex-board | systemd | 3000 |
| opifex-mem0 | systemd | 8010 |
| openclaw-gateway | systemd | — |
| agent-comms-monitor | systemd | — |
| litellm | Docker | 4000 |
| langfuse | Docker | 3003 |
| nginx | systemd | 80/443 |
| postgresql | systemd | 5432 |

Highlight any failures and suggest fixes if obvious.
