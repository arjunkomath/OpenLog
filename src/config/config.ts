import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const AlertRuleSchema = z.object({
	name: z.string(),
	enabled: z.boolean().default(false),
	window: z
		.string()
		.regex(/^\d+[mhd]$/, "Window format must be like '15m', '1h', or '7d'"),
	query: z
		.string()
		.describe(
			"SQL WHERE predicate to filter logs (e.g., \"LOWER(message) LIKE '%error%'\"). Time window filter is automatically applied.",
		),
	threshold: z.number().positive(),
	operator: z.enum(["gt", "gte", "lt", "lte", "eq"]).default("gt"),
	webhook: z.url(),
	headers: z.record(z.string(), z.string()).optional(),
	cooldown: z
		.string()
		.regex(/^\d+[mhd]$/)
		.optional()
		.default("5m"),
});

const ConfigSchema = z.object({
	server: z.object({
		host: z.string().default("0.0.0.0"),
		port: z.number().default(6514),
	}),
	http: z
		.object({
			enabled: z.boolean().default(true),
			host: z.string().default("0.0.0.0"),
			port: z.number().default(3000),
		})
		.optional()
		.default({ enabled: true, host: "0.0.0.0", port: 3000 }),
	database: z.object({
		path: z.string().optional(),
		retentionDays: z.number().positive().default(7),
	}),
	alerting: z.object({
		enabled: z.boolean().default(false),
		checkInterval: z.number().positive().default(60),
	}),
	debug: z.boolean().default(false),
	alerts: z.array(AlertRuleSchema),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
	private config: Config;

	constructor() {
		if (process.env.CONFIG_JSON) {
			try {
				const rawConfig = JSON.parse(process.env.CONFIG_JSON);
				this.config = ConfigSchema.parse(rawConfig);
				console.log(
					"Loaded configuration from CONFIG_JSON environment variable",
				);
			} catch (error) {
				console.error("Error parsing CONFIG_JSON:", error);
				this.config = this.getDefaultConfig();
			}
		} else {
			const path = join(process.cwd(), "openlog.json");

			if (existsSync(path)) {
				try {
					const rawConfig = JSON.parse(readFileSync(path, "utf-8"));
					this.config = ConfigSchema.parse(rawConfig);
					console.log(`Loaded configuration from ${path}`);
				} catch (error) {
					console.error("Error loading configuration:", error);
					this.config = this.getDefaultConfig();
				}
			} else {
				console.log("No configuration file found, using defaults");
				this.config = this.getDefaultConfig();
			}
		}

		this.loadEnvironmentOverrides();
	}

	private getDefaultConfig(): Config {
		return {
			server: {
				host: "0.0.0.0",
				port: 6514,
			},
			http: {
				enabled: true,
				host: "0.0.0.0",
				port: 3000,
			},
			database: {
				retentionDays: 7,
			},
			alerting: {
				enabled: true,
				checkInterval: 60,
			},
			debug: false,
			alerts: [],
		};
	}

	private loadEnvironmentOverrides() {
		if (process.env.SYSLOG_HOST) {
			this.config.server.host = process.env.SYSLOG_HOST;
		}

		if (process.env.SYSLOG_PORT) {
			this.config.server.port = parseInt(process.env.SYSLOG_PORT, 10);
		}

		if (process.env.DB_PATH) {
			this.config.database.path = process.env.DB_PATH;
		}

		if (process.env.RETENTION_DAYS) {
			this.config.database.retentionDays = parseInt(
				process.env.RETENTION_DAYS,
				10,
			);
		}

		if (process.env.ALERTING_ENABLED) {
			this.config.alerting.enabled = process.env.ALERTING_ENABLED === "true";
		}

		if (process.env.ALERT_CHECK_INTERVAL) {
			this.config.alerting.checkInterval = parseInt(
				process.env.ALERT_CHECK_INTERVAL,
				10,
			);
		}

		if (process.env.DEBUG) {
			this.config.debug = process.env.DEBUG === "true";
		}

		if (process.env.HTTP_ENABLED) {
			this.config.http.enabled = process.env.HTTP_ENABLED === "true";
		}

		if (process.env.HTTP_HOST) {
			this.config.http.host = process.env.HTTP_HOST;
		}

		if (process.env.HTTP_PORT) {
			this.config.http.port = parseInt(process.env.HTTP_PORT, 10);
		}
	}

	getConfig(): Config {
		return this.config;
	}

	getAlertRules(): AlertRule[] {
		return this.config.alerts.filter((alert) => alert.enabled);
	}

	parseTimeWindow(window: string): number {
		const match = window.match(/^(\d+)([mhd])$/);
		if (!match || !match[1] || !match[2]) {
			throw new Error(`Invalid time window format: ${window}`);
		}

		const value = parseInt(match[1], 10);
		const unit = match[2];

		switch (unit) {
			case "m":
				return value * 60 * 1000;
			case "h":
				return value * 60 * 60 * 1000;
			case "d":
				return value * 24 * 60 * 60 * 1000;
			default:
				throw new Error(`Unknown time unit: ${unit}`);
		}
	}

	checkThreshold(value: number, threshold: number, operator: string): boolean {
		switch (operator) {
			case "gt":
				return value > threshold;
			case "gte":
				return value >= threshold;
			case "lt":
				return value < threshold;
			case "lte":
				return value <= threshold;
			case "eq":
				return value === threshold;
			default:
				return false;
		}
	}
}
