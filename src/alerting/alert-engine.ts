import type { AlertRule, ConfigManager } from "../config/config";
import type { LogDatabase } from "../storage/database";
import { WebhookNotifier } from "./webhook";

export class AlertEngine {
	private configManager: ConfigManager;
	private webhookNotifier: WebhookNotifier;
	private db: LogDatabase;
	private checkInterval: NodeJS.Timeout | null = null;
	private lastAlertTimes: Map<string, Date> = new Map();
	private isRunning: boolean = false;

	constructor(configManager: ConfigManager, database: LogDatabase) {
		this.configManager = configManager;
		this.db = database;
		this.webhookNotifier = new WebhookNotifier();
	}

	start(): void {
		const config = this.configManager.getConfig();

		if (!config.alerting.enabled) {
			console.log("Alerting is disabled in configuration");
			return;
		}

		const intervalMs = config.alerting.checkInterval * 1000;

		this.checkInterval = setInterval(() => {
			if (!this.isRunning) {
				this.runChecks().catch((error) => {
					console.error("Error during alert checks:", error);
				});
			}
		}, intervalMs);

		console.log(
			`Alert engine started, checking every ${config.alerting.checkInterval} seconds`,
		);
	}

	stop(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
			console.log("Alert engine stopped");
		}
	}

	private async runChecks(): Promise<void> {
		this.isRunning = true;

		try {
			const rules = this.configManager.getAlertRules();
			const config = this.configManager.getConfig();

			if (rules.length === 0) {
				return;
			}

			if (config.debug) {
				console.log(`Running ${rules.length} alert checks...`);
			}

			for (const rule of rules) {
				try {
					await this.checkRule(rule);
				} catch (error) {
					console.error(`Error checking rule "${rule.name}":`, error);
				}
			}
		} finally {
			this.isRunning = false;
		}
	}

	private async checkRule(rule: AlertRule): Promise<void> {
		if (this.isInCooldown(rule)) {
			return;
		}

		const windowMs = this.configManager.parseTimeWindow(rule.window);
		const endTime = new Date();
		const startTime = new Date(endTime.getTime() - windowMs);

		const count = this.db.runAlertQuery(rule.query, startTime, endTime);

		const shouldAlert = this.configManager.checkThreshold(
			count,
			rule.threshold,
			rule.operator || "gt",
		);

		if (shouldAlert) {
			console.log(
				`⚠️  Alert triggered: "${rule.name}" - Count: ${count}, Threshold: ${rule.threshold}`,
			);

			const success = await this.webhookNotifier.sendAlert(
				rule,
				count,
				startTime,
				endTime,
				{},
			);

			if (success) {
				this.lastAlertTimes.set(rule.name, new Date());

				this.db.insertAlertHistory({
					alertName: rule.name,
					count,
					windowStart: startTime,
					windowEnd: endTime,
				});
			}
		}
	}

	private isInCooldown(rule: AlertRule): boolean {
		const lastAlert = this.lastAlertTimes.get(rule.name);
		if (!lastAlert) {
			return false;
		}

		const cooldownMs = this.configManager.parseTimeWindow(
			rule.cooldown || "5m",
		);
		const cooldownEnd = new Date(lastAlert.getTime() + cooldownMs);

		return new Date() < cooldownEnd;
	}
}
