A super lightweight syslog ingestion and alerting service built with Bun. It accepts standard RFC 5424 syslog messages over TCP and can trigger webhook alerts based on configurable conditions.

## Features

- **RFC 5424 Compliant**: Fully supports the standard syslog format
- **TCP Transport**: Reliable message delivery with TCP protocol
- **SQLite Storage**: Fast, embedded database with automatic indexing
- **Flexible Alerting**: SQL-based triggers for powerful and efficient queries
- **Webhook Notifications**: HTTP POST alerts with custom headers
- **Time Windows**: Support for minute/hour/day-based alert windows
- **Alert Cooldowns**: Prevent alert flooding with configurable cooldown periods
- **Log Retention**: Automatic cleanup of old logs

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
  "database": {
    "retentionDays": 7
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

- `SYSLOG_HOST`: Bind address (default: "0.0.0.0")
- `SYSLOG_PORT`: Listen port (default: 6514)
- `DB_PATH`: SQLite database path (default: "logs.db")
- `RETENTION_DAYS`: Log retention period (default: 7)
- `ALERTING_ENABLED`: Enable/disable alerting (default: true)
- `ALERT_CHECK_INTERVAL`: Alert check interval in seconds (default: 60)

## Performance

- Bun's native SQLite is significantly faster than Node.js alternatives
- WAL mode enabled for concurrent reads/writes
- Indexed timestamps for fast time-range queries
- Automatic log cleanup to manage database size

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
