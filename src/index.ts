import { AlertEngine } from "./alerting/alert-engine";
import { ConfigManager } from "./config/config";
import { SyslogServer } from "./server/syslog-server";
import { LogDatabase } from "./storage/database";

class OpenLogService {
	private syslogServer: SyslogServer;
	private configManager: ConfigManager;
	private alertEngine: AlertEngine;
	private db: LogDatabase;
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor() {
		console.log("🚀 OpenLog - Lightweight Syslog Ingestion & Alerting Service");
		console.log("=".repeat(60));

		this.configManager = new ConfigManager();
		const config = this.configManager.getConfig();

		this.db = new LogDatabase(config.database.path);

		this.syslogServer = new SyslogServer(
			config.server.port,
			config.server.host,
		);

		this.alertEngine = new AlertEngine(
			this.configManager,
			this.syslogServer.getDatabase(),
		);

		this.setupCleanup(config.database.retentionDays);
	}

	private setupCleanup(retentionDays: number): void {
		const runCleanup = () => {
			const deleted = this.db.cleanOldLogs(retentionDays);
			if (deleted > 0) {
				console.log(
					`🗑️  Cleaned up ${deleted} old log entries (retention: ${retentionDays} days)`,
				);
			}
		};

		runCleanup();

		this.cleanupInterval = setInterval(runCleanup, 24 * 60 * 60 * 1000);

		console.log(
			`♻️  Log rotation: Daily cleanup, ${retentionDays} days retention`,
		);
	}

	async start(): Promise<void> {
		try {
			await this.syslogServer.start();

			this.alertEngine.start();

			const config = this.configManager.getConfig();
			console.log("\n✅ Service started successfully!");
			console.log(`📥 Syslog TCP: ${config.server.host}:${config.server.port}`);
			console.log(`🗄️  Database: ${config.database.path || "data/logs.db"}`);
			console.log(`📊 Retention: ${config.database.retentionDays} days`);

			if (config.alerting.enabled) {
				const alertCount = this.configManager.getAlertRules().length;
				console.log(
					`🔔 Alerts: ${alertCount} rules active, checking every ${config.alerting.checkInterval}s`,
				);
			} else {
				console.log("🔕 Alerts: Disabled");
			}

			this.setupSignalHandlers();
		} catch (error) {
			console.error("❌ Failed to start service:", error);
			process.exit(1);
		}
	}

	private setupSignalHandlers(): void {
		const shutdown = async (signal: string) => {
			console.log(`\n📛 Received ${signal}, shutting down gracefully...`);

			this.alertEngine.stop();

			await this.syslogServer.stop();

			if (this.cleanupInterval) {
				clearInterval(this.cleanupInterval);
			}

			this.db.close();

			console.log("👋 Goodbye!");
			process.exit(0);
		};

		process.on("SIGINT", () => shutdown("SIGINT"));
		process.on("SIGTERM", () => shutdown("SIGTERM"));

		process.on("uncaughtException", (error) => {
			console.error("❌ Uncaught exception:", error);
			shutdown("uncaughtException");
		});

		process.on("unhandledRejection", (reason, promise) => {
			console.error("❌ Unhandled rejection at:", promise, "reason:", reason);
		});
	}
}

new OpenLogService().start().catch((error) => {
	console.error("❌ Fatal error:", error);
	process.exit(1);
});
