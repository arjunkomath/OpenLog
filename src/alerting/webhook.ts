import type { AlertRule } from "../config/config";

export interface WebhookPayload {
	alertName: string;
	severity: "info" | "warning" | "critical";
	timestamp: string;
	window: {
		start: string;
		end: string;
		duration: string;
	};
	trigger: {
		query: string;
		threshold: number;
		operator: string;
		actualValue: number;
	};
	message: string;
	metadata?: Record<string, unknown>;
}

export class WebhookNotifier {
	async sendAlert(
		rule: AlertRule,
		actualValue: number,
		windowStart: Date,
		windowEnd: Date,
		additionalData?: Record<string, unknown>,
	): Promise<boolean> {
		const payload: WebhookPayload = {
			alertName: rule.name,
			severity: this.getSeverity(actualValue, rule.threshold),
			timestamp: new Date().toISOString(),
			window: {
				start: windowStart.toISOString(),
				end: windowEnd.toISOString(),
				duration: rule.window,
			},
			trigger: {
				query: rule.query,
				threshold: rule.threshold,
				operator: rule.operator || "gt",
				actualValue,
			},
			message: this.buildMessage(rule, actualValue),
			metadata: additionalData,
		};

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				"User-Agent": "OpenLog/1.0",
				...rule.headers,
			};

			const response = await fetch(rule.webhook, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(30000),
			});

			if (response.ok) {
				console.log(
					`✓ Alert "${rule.name}" sent successfully to ${rule.webhook}`,
				);
				return true;
			} else {
				console.error(
					`✗ Failed to send alert "${rule.name}": ${response.status} ${response.statusText}`,
				);

				const body = await response.text().catch(() => "");
				if (body) {
					console.error("Response body:", body);
				}

				return false;
			}
		} catch (error) {
			console.error(`✗ Error sending alert "${rule.name}":`, error);
			return false;
		}
	}

	private getSeverity(
		actualValue: number,
		threshold: number,
	): "info" | "warning" | "critical" {
		const ratio = actualValue / threshold;

		if (ratio >= 2) {
			return "critical";
		} else if (ratio >= 1.5) {
			return "warning";
		} else {
			return "info";
		}
	}

	private buildMessage(rule: AlertRule, actualValue: number): string {
		const operator = rule.operator || "gt";
		const operatorText =
			{
				gt: "greater than",
				gte: "greater than or equal to",
				lt: "less than",
				lte: "less than or equal to",
				eq: "equal to",
			}[operator] || operator;

		return `Alert "${rule.name}" triggered: Count (${actualValue}) is ${operatorText} threshold (${rule.threshold}) in the last ${rule.window}`;
	}

	async testWebhook(
		url: string,
		headers?: Record<string, string>,
	): Promise<boolean> {
		const testPayload: WebhookPayload = {
			alertName: "Test Alert",
			severity: "info",
			timestamp: new Date().toISOString(),
			window: {
				start: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
				end: new Date().toISOString(),
				duration: "15m",
			},
			trigger: {
				query: "test",
				threshold: 10,
				operator: "gt",
				actualValue: 15,
			},
			message: "This is a test alert from OpenLog",
			metadata: {
				test: true,
			},
		};

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "OpenLog/1.0",
					...headers,
				},
				body: JSON.stringify(testPayload),
				signal: AbortSignal.timeout(10000),
			});

			return response.ok;
		} catch (error) {
			console.error("Webhook test failed:", error);
			return false;
		}
	}
}
