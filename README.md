A lightweight syslog ingestion and alerting service built with Bun. It has a syslog endpoint over TCP that can accept messages and can trigger alerts based on configurable conditions.

## Why?

I used this to drain CDN logs and setup alerts.

> [!WARNING]  
> **Lot of the code was written by AI (Claude)**, this was an experiment and I didn't want to spend hours writing this.
> If you're wondering this works; yes, kinda.

Over to you Claude.

---

## Features

- **RFC 5424 Compliant**: Fully supports the standard syslog format
- **TCP Transport**: Reliable message delivery with TCP protocol
- **Flexible Alerting**: SQL-based triggers for powerful and efficient queries
- **Webhook Notifications**: HTTP POST alerts with custom headers

## Quick Start

### Installation

```bash
bun install
```

### Configuration

Edit `config/alerts.json` to configure your alerts:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 6514
  },
  "http": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 3000
  },
  "alerting": {
    "enabled": true,
    "checkInterval": 60
  },
  "alerts": [
    {
      "name": "High Error Rate",
      "enabled": true,
      "window": "15m",
      "query": "LOWER(message) LIKE '%error%'",
      "threshold": 10,
      "operator": "gt",
      "webhook": "https://your-webhook.com/alert",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      },
      "cooldown": "5m"
    }
  ]
}
```

### Running the Service

```bash
# Start the service
bun start

# Development mode with auto-reload
bun dev

# Run on custom port
SYSLOG_PORT=6514 bun start
```

## Sending Logs

Send syslog messages to the service using any syslog client or netcat:

```bash
# Send a test message
echo '<134>1 2024-01-01T12:00:00Z host.example.com myapp - - Test message' | nc localhost 6514

# Send an error message (severity 3)
echo '<131>1 2024-01-01T12:00:00Z host.example.com myapp - - Error: Something went wrong' | nc localhost 6514
```

## HTTP API

OpenLog provides an HTTP API for health checks and service information.

### Endpoints

#### GET /

Returns service information and configuration.

```bash
curl http://localhost:3000/

# Response:
{
  "service": "OpenLog",
  "version": "1.0.0",
  "description": "Lightweight Syslog Ingestion & Alerting Service",
  "endpoints": {
    "base": "/",
    "health": "/health"
  },
  "configuration": {
    "syslog": {
      "host": "0.0.0.0",
      "port": 6514
    },
    "alerting": {
      "enabled": true,
      "activeRules": 4,
      "checkInterval": "60s"
    },
    "debug": false
  }
}
```

#### GET /health

Health check endpoint for monitoring and container orchestration.

```bash
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600.5,
  "services": {
    "syslog": {
      "status": "running",
      "port": 6514
    },
    "alerting": {
      "status": "enabled",
      "activeRules": 4
    },
    "database": {
      "status": "connected"
    }
  }
}
```

#### GET /logs

Returns recent log entries for debugging. Supports optional `limit` query parameter (1-1000, default: 50).

```bash
# Get last 50 logs (default)
curl http://localhost:3000/logs

# Get last 100 logs
curl http://localhost:3000/logs?limit=100

# Response:
{
  "count": 50,
  "limit": 50,
  "logs": [
    {
      "id": 123,
      "timestamp": "2024-01-01T12:00:00.000Z",
      "facility": 16,
      "severity": 3,
      "hostname": "server1.local",
      "appName": "myapp",
      "procId": "1234",
      "msgId": "-",
      "message": "Error: Database connection failed",
      "raw": "<131>1 2024-01-01T12:00:00Z server1.local myapp 1234 - - Error: Database connection failed"
    }
  ]
}
```

## Alert Configuration

### Alert Rule Properties

- `name`: Unique name for the alert
- `enabled`: Whether the alert is active
- `window`: Time window to check (e.g., "15m", "1h", "7d")
- `query`: SQL WHERE predicate to filter logs (time window is automatically applied)
- `threshold`: Numeric threshold to compare against
- `operator`: Comparison operator ("gt", "gte", "lt", "lte", "eq")
- `webhook`: URL to POST alerts to
- `headers`: Optional HTTP headers for webhook
- `cooldown`: Minimum time between alerts (default: "5m")

### Query Examples

The `query` field is a SQL WHERE predicate that filters logs. The time window filter is automatically applied, so you only need to specify your matching conditions.

```sql
# Count logs containing "error" (case-insensitive)
LOWER(message) LIKE '%error%'

# Count critical severity logs (severity 2 or lower)
severity <= 2

# Count logs from a specific host
hostname = 'production-server-01'

# Count logs matching multiple patterns
message LIKE '%error%' OR message LIKE '%fail%' OR message LIKE '%exception%'

# Count logs from specific application
app_name = 'myapp'

# Count logs with specific severity from specific host
severity <= 3 AND hostname = 'prod-server'

# Complex pattern matching
LOWER(message) LIKE '%database%' AND (severity <= 2 OR message LIKE '%timeout%')
```

## Webhook Payload

When an alert is triggered, the following JSON payload is sent to the webhook:

```json
{
  "alertName": "High Error Rate",
  "severity": "warning",
  "timestamp": "2024-01-01T12:00:00Z",
  "window": {
    "start": "2024-01-01T11:45:00Z",
    "end": "2024-01-01T12:00:00Z",
    "duration": "15m"
  },
  "trigger": {
    "query": "LOWER(message) LIKE '%error%'",
    "threshold": 10,
    "operator": "gt",
    "actualValue": 25
  },
  "message": "Alert \"High Error Rate\" triggered: Count (25) is greater than threshold (10) in the last 15m"
}
```

## Environment Variables

### Individual Settings

- `SYSLOG_HOST`: Bind address for syslog server (default: "0.0.0.0")
- `SYSLOG_PORT`: Listen port for syslog server (default: 6514)
- `HTTP_ENABLED`: Enable/disable HTTP API (default: true)
- `HTTP_HOST`: Bind address for HTTP server (default: "0.0.0.0")
- `HTTP_PORT`: Listen port for HTTP server (default: 3000)
- `DB_PATH`: SQLite database path (default: "data/logs.db")
- `RETENTION_DAYS`: Log retention period in days (default: 7)
- `ALERTING_ENABLED`: Enable/disable alerting (default: true)
- `ALERT_CHECK_INTERVAL`: Alert check interval in seconds (default: 60)
- `DEBUG`: Enable debug logging for all operations (default: false)

**Note:** Database configuration (`DB_PATH` and `RETENTION_DAYS`) is only available via environment variables, not in the config file.

### Full Configuration Override

You can provide the entire configuration as a JSON string via the `CONFIG_JSON` environment variable. This will override all defaults and the config file.

```bash
# Provide full configuration via environment variable
CONFIG_JSON='{"server":{"host":"0.0.0.0","port":6514},"http":{"enabled":true,"host":"0.0.0.0","port":3000},"alerting":{"enabled":true,"checkInterval":120},"debug":false,"alerts":[]}' bun start

# Or use a more readable format with environment variable files
export CONFIG_JSON=$(cat <<'EOF'
{
  "server": {
    "host": "0.0.0.0",
    "port": 6514
  },
  "http": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 3000
  },
  "alerting": {
    "enabled": true,
    "checkInterval": 120
  },
  "debug": false,
  "alerts": []
}
EOF
)
bun start
```

**Priority order:**
1. `CONFIG_JSON` environment variable (highest priority)
2. Individual environment variables (e.g., `SYSLOG_PORT`)
3. `openlog.json` configuration file
4. Default values (lowest priority)

Note: Individual environment variables will still override corresponding values from `CONFIG_JSON`.

### Debug Mode

Enable debug mode to see detailed logs for every operation:

```bash
# Enable debug logging
DEBUG=true bun start

# You'll see detailed logs like:
# 📨 Received 256 bytes from 127.0.0.1
# 🔍 Processing raw message: <131>1 2024-01-01T12:00:00Z server1.local app - - Error: Database connection failed
# 📋 Parsed: severity=3, host=server1.local, app=app
# ✅ Ingested log #42: [ERROR] server1.local/app: Database connection failed
# Running 4 alert checks...
```

## Testing

```bash
# Send test syslog messages
bun run test-syslog
bun run test-error

# Test with custom severity
echo '<131>1 2024-01-01T12:00:00Z test error - - Critical error occurred' | nc localhost 6514
```

## License

MIT
