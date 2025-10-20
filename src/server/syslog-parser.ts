export interface SyslogMessage {
	facility: number;
	severity: number;
	version?: number;
	timestamp: Date;
	hostname: string;
	appName: string;
	procId?: string;
	msgId?: string;
	structuredData?: Record<string, Record<string, string>>;
	message: string;
	raw: string;
}

const SEVERITY_NAMES: Record<number, string> = {
	0: "Emergency",
	1: "Alert",
	2: "Critical",
	3: "Error",
	4: "Warning",
	5: "Notice",
	6: "Informational",
	7: "Debug",
};

export class SyslogParser {
	parse(rawMessage: string): SyslogMessage {
		rawMessage = rawMessage.trim();

		if (rawMessage.startsWith("<")) {
			const priEnd = rawMessage.indexOf(">");
			if (priEnd > 0) {
				const priValue = parseInt(rawMessage.substring(1, priEnd), 10);
				const facility = Math.floor(priValue / 8);
				const severity = priValue % 8;

				const messageContent = rawMessage.substring(priEnd + 1).trim();

				if (messageContent.startsWith("1 ")) {
					return this.parseRFC5424(
						rawMessage,
						facility,
						severity,
						messageContent.substring(2),
					);
				} else {
					return this.parseRFC3164(
						rawMessage,
						facility,
						severity,
						messageContent,
					);
				}
			}
		}

		return {
			facility: 16,
			severity: 6,
			timestamp: new Date(),
			hostname: "-",
			appName: "-",
			message: rawMessage,
			raw: rawMessage,
		};
	}

	private parseRFC5424(
		raw: string,
		facility: number,
		severity: number,
		content: string,
	): SyslogMessage {
		const parts = content.split(" ");

		const timestamp = this.parseTimestamp(parts[0] || "-");
		const hostname = parts[1] || "-";
		const appName = parts[2] || "-";
		const procId = parts[3] === "-" ? undefined : parts[3];
		const msgId = parts[4] === "-" ? undefined : parts[4];

		let structuredData: Record<string, Record<string, string>> | undefined;
		let messageStart = 6;

		if (parts[5] && parts[5] !== "-" && parts[5].startsWith("[")) {
			structuredData = this.parseStructuredData(parts, 5);
			messageStart = this.findMessageStart(parts, 5);
		}

		const message = parts.slice(messageStart).join(" ").trim();

		return {
			facility,
			severity,
			version: 1,
			timestamp,
			hostname,
			appName,
			procId,
			msgId,
			structuredData,
			message,
			raw,
		};
	}

	private parseRFC3164(
		raw: string,
		facility: number,
		severity: number,
		content: string,
	): SyslogMessage {
		const timestampMatch = content.match(
			/^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+/,
		);
		let timestamp = new Date();
		let remaining = content;

		if (timestampMatch) {
			const year = new Date().getFullYear();
			timestamp = new Date(`${timestampMatch[1]} ${year}`);
			remaining = content.substring(timestampMatch[0].length);
		}

		const hostAppMatch = remaining.match(
			/^([^\s]+)\s+([^[\s]+)(?:\[(\d+)\])?:\s*(.*)/s,
		);
		let hostname = "-";
		let appName = "-";
		let procId: string | undefined;
		let message = remaining;

		if (hostAppMatch) {
			hostname = hostAppMatch[1] || "-";
			appName = hostAppMatch[2] || "-";
			procId = hostAppMatch[3];
			message = hostAppMatch[4] || "";
		}

		return {
			facility,
			severity,
			timestamp,
			hostname,
			appName,
			procId,
			message,
			raw,
		};
	}

	private parseTimestamp(timestamp: string): Date {
		if (timestamp === "-") {
			return new Date();
		}

		const date = new Date(timestamp);
		return Number.isNaN(date.getTime()) ? new Date() : date;
	}

	private parseStructuredData(
		parts: string[],
		startIndex: number,
	): Record<string, Record<string, string>> | undefined {
		const result: Record<string, Record<string, string>> = {};
		let currentSD = "";
		let inSD = false;

		for (let i = startIndex; i < parts.length; i++) {
			const part = parts[i];
			if (!part) continue;

			if (part.startsWith("[") && !inSD) {
				inSD = true;
				currentSD = part;
			} else if (inSD) {
				currentSD += ` ${part}`;
			}

			if (inSD && currentSD.endsWith("]")) {
				const sdMatch = currentSD.match(/\[([^\s]+)([^\]]*)\]/);
				if (sdMatch?.[1]) {
					const sdId = sdMatch[1];
					const params = sdMatch[2] || "";
					result[sdId] = this.parseSDParams(params);
				}

				const nextPart = parts[i + 1];
				if (i + 1 < parts.length && nextPart && nextPart.startsWith("[")) {
					currentSD = "";
					inSD = false;
				} else {
					break;
				}
			}
		}

		return Object.keys(result).length > 0 ? result : undefined;
	}

	private parseSDParams(params: string): Record<string, string> {
		const result: Record<string, string> = {};
		const regex = /\s+([^=]+)="([^"]*)"/g;
		let match: RegExpExecArray | null = regex.exec(params);

		while (match !== null) {
			if (match[1] && match[2] !== undefined) {
				result[match[1]] = match[2];
			}
			match = regex.exec(params);
		}

		return result;
	}

	private findMessageStart(parts: string[], sdStart: number): number {
		for (let i = sdStart; i < parts.length; i++) {
			const part = parts[i];
			const nextPart = parts[i + 1];
			if (
				part?.endsWith("]") &&
				(i + 1 >= parts.length || !nextPart || !nextPart.startsWith("["))
			) {
				return i + 1;
			}
		}
		return parts.length;
	}

	getSeverityName(severity: number): string {
		return SEVERITY_NAMES[severity] || `severity${severity}`;
	}
}
