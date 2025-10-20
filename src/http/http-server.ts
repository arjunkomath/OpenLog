import type { ConfigManager } from "../config/config";
import type { LogDatabase } from "../storage/database";

export class HttpServer {
	private server: ReturnType<typeof Bun.serve> | null = null;
	private db: LogDatabase;
	private configManager: ConfigManager;
	private port: number;
	private host: string;

	constructor(
		port: number,
		host: string,
		db: LogDatabase,
		configManager: ConfigManager,
	) {
		this.port = port;
		this.host = host;
		this.db = db;
		this.configManager = configManager;
	}

	async start(): Promise<void> {
		this.server = Bun.serve({
			hostname: this.host,
			port: this.port,
			fetch: (req) => this.handleRequest(req),
		});

		console.log(`HTTP server listening on ${this.host}:${this.port}`);
	}

	private async handleRequest(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname;

		if (path === "/" && req.method === "GET") {
			return this.handleHello();
		}

		if (path === "/health" && req.method === "GET") {
			return this.handleHealth();
		}

		if (path === "/logs" && req.method === "GET") {
			return this.handleLogs(url);
		}

		return new Response("Not Found", {
			status: 404,
			headers: { "Content-Type": "text/plain" },
		});
	}

	private handleHello(): Response {
		const config = this.configManager.getConfig();
		const alertRules = this.configManager.getAlertRules();

		const response = {
			service: "OpenLog",
			version: "1.0.0",
			description: "Lightweight Syslog Ingestion & Alerting Service",
			endpoints: {
				base: "/",
				health: "/health",
				logs: "/logs",
			},
			configuration: {
				syslog: {
					host: config.server.host,
					port: config.server.port,
				},
				alerting: {
					enabled: config.alerting.enabled,
					activeRules: alertRules.length,
					checkInterval: `${config.alerting.checkInterval}s`,
				},
				database: {
					retention: `${config.database.retentionDays} days`,
				},
				debug: config.debug,
			},
		};

		return new Response(JSON.stringify(response, null, 2), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	private handleHealth(): Response {
		try {
			const config = this.configManager.getConfig();

			const health = {
				status: "healthy",
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
				services: {
					syslog: {
						status: "running",
						port: config.server.port,
					},
					alerting: {
						status: config.alerting.enabled ? "enabled" : "disabled",
						activeRules: this.configManager.getAlertRules().length,
					},
					database: {
						status: "connected",
					},
				},
			};

			return new Response(JSON.stringify(health, null, 2), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			const errorHealth = {
				status: "unhealthy",
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : "Unknown error",
			};

			return new Response(JSON.stringify(errorHealth, null, 2), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	private handleLogs(url: URL): Response {
		try {
			const limitParam = url.searchParams.get("limit");
			const limit = limitParam ? parseInt(limitParam, 10) : 50;

			if (isNaN(limit) || limit < 1 || limit > 1000) {
				return new Response(
					JSON.stringify({
						error: "Invalid limit. Must be between 1 and 1000",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			const logs = this.db.getRecentLogs(limit);

			const response = {
				count: logs.length,
				limit,
				logs,
			};

			return new Response(JSON.stringify(response, null, 2), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: error instanceof Error ? error.message : "Unknown error",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	async stop(): Promise<void> {
		if (this.server) {
			this.server.stop();
			this.server = null;
			console.log("HTTP server stopped");
		}
	}
}
