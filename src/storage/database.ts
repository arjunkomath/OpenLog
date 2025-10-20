import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LogEntry {
	id?: number;
	timestamp: Date;
	facility: number;
	severity: number;
	hostname: string;
	appName: string;
	procId?: string;
	msgId?: string;
	message: string;
	raw: string;
}

export interface AlertHistory {
	id?: number;
	alertName: string;
	triggeredAt: Date;
	count: number;
	windowStart: Date;
	windowEnd: Date;
}

interface LogRow {
	id: number;
	timestamp: string;
	facility: number;
	severity: number;
	hostname: string;
	app_name: string;
	proc_id: string | null;
	msg_id: string | null;
	message: string;
	raw: string;
}

interface AlertHistoryRow {
	id: number;
	alert_name: string;
	triggered_at: string;
	count: number;
	window_start: string;
	window_end: string;
}

export class LogDatabase {
	private db: Database;

	constructor(dbPath?: string) {
		const defaultPath = join(process.cwd(), "data", "logs.db");
		const finalPath = dbPath || defaultPath;

		const dbDir = join(finalPath, "..");
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true });
		}

		this.db = new Database(finalPath);
		this.db.run("PRAGMA journal_mode = WAL");
		this.db.run("PRAGMA busy_timeout = 5000");
		this.initSchema();
	}

	private initSchema() {
		this.db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        facility INTEGER,
        severity INTEGER,
        hostname TEXT,
        app_name TEXT,
        proc_id TEXT,
        msg_id TEXT,
        message TEXT,
        raw TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_severity ON logs(severity);
      CREATE INDEX IF NOT EXISTS idx_hostname ON logs(hostname);
      CREATE INDEX IF NOT EXISTS idx_app_name ON logs(app_name);

      CREATE TABLE IF NOT EXISTS alert_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_name TEXT NOT NULL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        count INTEGER NOT NULL,
        window_start DATETIME NOT NULL,
        window_end DATETIME NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_alert_name ON alert_history(alert_name);
      CREATE INDEX IF NOT EXISTS idx_triggered_at ON alert_history(triggered_at);
    `);
	}

	insertLog(log: Omit<LogEntry, "id">): number {
		const stmt = this.db.prepare(`
      INSERT INTO logs (timestamp, facility, severity, hostname, app_name, proc_id, msg_id, message, raw)
      VALUES ($timestamp, $facility, $severity, $hostname, $appName, $procId, $msgId, $message, $raw)
    `);

		const result = stmt.run({
			$timestamp: log.timestamp.toISOString(),
			$facility: log.facility,
			$severity: log.severity,
			$hostname: log.hostname,
			$appName: log.appName,
			$procId: log.procId || null,
			$msgId: log.msgId || null,
			$message: log.message,
			$raw: log.raw,
		});

		return result.lastInsertRowid as number;
	}

	getLogsInTimeWindow(startTime: Date, endTime: Date): LogEntry[] {
		const stmt = this.db.prepare(`
      SELECT * FROM logs
      WHERE timestamp >= $startTime AND timestamp <= $endTime
      ORDER BY timestamp DESC
    `);

		const rows = stmt.all({
			$startTime: startTime.toISOString(),
			$endTime: endTime.toISOString(),
		}) as LogRow[];

		return rows.map((row) => ({
			id: row.id,
			timestamp: new Date(row.timestamp),
			facility: row.facility,
			severity: row.severity,
			hostname: row.hostname,
			appName: row.app_name,
			procId: row.proc_id || undefined,
			msgId: row.msg_id || undefined,
			message: row.message,
			raw: row.raw,
		}));
	}

	getLogsAsText(startTime: Date, endTime: Date): string {
		const logs = this.getLogsInTimeWindow(startTime, endTime);
		return logs.map((log) => log.message).join("\n");
	}

	getLogsAsJSON(startTime: Date, endTime: Date): string {
		const logs = this.getLogsInTimeWindow(startTime, endTime);
		return JSON.stringify(logs, null, 0);
	}

	getRecentLogs(limit: number = 50): LogEntry[] {
		const stmt = this.db.prepare(`
      SELECT * FROM logs
      ORDER BY timestamp DESC
      LIMIT $limit
    `);

		const rows = stmt.all({ $limit: limit }) as any[];

		return rows.map((row) => ({
			id: row.id,
			timestamp: new Date(row.timestamp),
			facility: row.facility,
			severity: row.severity,
			hostname: row.hostname,
			appName: row.app_name,
			procId: row.proc_id,
			msgId: row.msg_id,
			message: row.message,
			raw: row.raw,
		}));
	}

	runAlertQuery(predicate: string, startTime: Date, endTime: Date): number {
		try {
			const fullQuery = `SELECT COUNT(*) as count FROM logs WHERE timestamp >= $startTime AND timestamp <= $endTime AND (${predicate})`;

			const stmt = this.db.prepare(fullQuery);
			const result = stmt.get({
				$startTime: startTime.toISOString(),
				$endTime: endTime.toISOString(),
			});

			if (result && typeof result === "object") {
				const firstValue = Object.values(result)[0];
				if (typeof firstValue === "number") {
					return firstValue;
				}
			}

			return 0;
		} catch (error) {
			console.error(`Error running alert query: ${error}`);
			console.error(`Predicate was: ${predicate}`);
			return 0;
		}
	}

	insertAlertHistory(alert: Omit<AlertHistory, "id" | "triggeredAt">): number {
		const stmt = this.db.prepare(`
      INSERT INTO alert_history (alert_name, count, window_start, window_end)
      VALUES ($alertName, $count, $windowStart, $windowEnd)
    `);

		const result = stmt.run({
			$alertName: alert.alertName,
			$count: alert.count,
			$windowStart: alert.windowStart.toISOString(),
			$windowEnd: alert.windowEnd.toISOString(),
		});

		return result.lastInsertRowid as number;
	}

	getLastAlertTrigger(alertName: string): AlertHistory | null {
		const stmt = this.db.prepare(`
      SELECT * FROM alert_history
      WHERE alert_name = $alertName
      ORDER BY triggered_at DESC
      LIMIT 1
    `);

		const row = stmt.get({ $alertName: alertName }) as
			| AlertHistoryRow
			| undefined;

		if (!row) return null;

		return {
			id: row.id,
			alertName: row.alert_name,
			triggeredAt: new Date(row.triggered_at),
			count: row.count,
			windowStart: new Date(row.window_start),
			windowEnd: new Date(row.window_end),
		};
	}

	cleanOldLogs(retentionDays: number = 7): number {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

		const logsStmt = this.db.prepare(`
      DELETE FROM logs WHERE timestamp < $cutoffDate
    `);

		const logsResult = logsStmt.run({ $cutoffDate: cutoffDate.toISOString() });
		const deletedLogs = logsResult.changes;

		const alertsStmt = this.db.prepare(`
      DELETE FROM alert_history WHERE triggered_at < $cutoffDate
    `);

		const alertsResult = alertsStmt.run({
			$cutoffDate: cutoffDate.toISOString(),
		});
		const deletedAlerts = alertsResult.changes;

		if (deletedLogs > 0 || deletedAlerts > 0) {
			this.db.run("PRAGMA optimize");
			this.db.run("VACUUM");
		}

		return deletedLogs;
	}

	close() {
		this.db.close();
	}
}
