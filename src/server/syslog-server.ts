import type { Socket, TCPSocketListener } from "bun";
import { LogDatabase } from "../storage/database";
import { SyslogParser } from "./syslog-parser";

export class SyslogServer {
	private parser: SyslogParser;
	private db: LogDatabase;
	private server: TCPSocketListener<undefined> | null = null;
	private connections: Set<Socket> = new Set();
	private messageBuffers: Map<Socket, string> = new Map();
	private debug: boolean;

	constructor(
		private port: number = 6514,
		private host: string = "0.0.0.0",
		debug: boolean = false,
	) {
		this.parser = new SyslogParser();
		this.db = new LogDatabase();
		this.debug = debug;
	}

	async start(): Promise<void> {
		this.server = Bun.listen({
			hostname: this.host,
			port: this.port,
			socket: {
				open: (socket) => {
					this.connections.add(socket);
					this.messageBuffers.set(socket, "");
					console.log(`New connection from ${socket.remoteAddress}`);
				},

				data: (socket, data) => {
					if (this.debug) {
						console.log(
							`📨 Received ${data.byteLength} bytes from ${socket.remoteAddress}`,
						);
					}

					const existing = this.messageBuffers.get(socket) || "";
					const text = existing + new TextDecoder().decode(data);

					if (this.debug) {
						console.log(
							`📦 Buffer content (${text.length} chars): ${text.substring(0, 200)}`,
						);
					}

					const lines = text.split(/\r?\n/);

					if (lines.length > 1) {
						const complete = lines.slice(0, -1);
						const lastLine = lines[lines.length - 1];
						this.messageBuffers.set(socket, lastLine || "");

						if (this.debug) {
							console.log(`📄 Processing ${complete.length} complete lines`);
						}

						for (const line of complete) {
							if (line.trim()) {
								this.processMessage(line.trim(), socket);
							}
						}
					} else {
						this.messageBuffers.set(socket, text);

						if (text.includes("\0")) {
							const messages = text.split("\0");
							const lastMessage = messages[messages.length - 1];
							this.messageBuffers.set(socket, lastMessage || "");

							if (this.debug) {
								console.log(
									`📄 Processing ${messages.length - 1} null-terminated messages`,
								);
							}

							for (let i = 0; i < messages.length - 1; i++) {
								const msg = messages[i];
								if (msg?.trim()) {
									this.processMessage(msg.trim(), socket);
								}
							}
						} else if (this.debug) {
							console.log(
								`⏳ Buffering message (no newline or null terminator yet)`,
							);
						}
					}
				},

				close: (socket) => {
					const remaining = this.messageBuffers.get(socket);
					if (remaining?.trim()) {
						this.processMessage(remaining.trim(), socket);
					}

					this.connections.delete(socket);
					this.messageBuffers.delete(socket);
					console.log(`Connection closed from ${socket.remoteAddress}`);
				},

				error: (socket, error) => {
					console.error(`Socket error from ${socket.remoteAddress}:`, error);
					this.connections.delete(socket);
					this.messageBuffers.delete(socket);
				},
			},
		});

		console.log(`Syslog TCP server listening on ${this.host}:${this.port}`);
	}

	private processMessage(rawMessage: string, _: Socket): void {
		try {
			if (this.debug) {
				console.log(
					`🔍 Processing raw message: ${rawMessage.substring(0, 100)}${rawMessage.length > 100 ? "..." : ""}`,
				);
			}

			const parsed = this.parser.parse(rawMessage);

			if (this.debug) {
				console.log(
					`📋 Parsed: severity=${parsed.severity}, host=${parsed.hostname}, app=${parsed.appName}`,
				);
			}

			const logEntry = {
				timestamp: parsed.timestamp,
				facility: parsed.facility,
				severity: parsed.severity,
				hostname: parsed.hostname,
				appName: parsed.appName,
				procId: parsed.procId,
				msgId: parsed.msgId,
				message: parsed.message,
				raw: rawMessage,
			};

			const logId = this.db.insertLog(logEntry);

			if (this.debug) {
				console.log(
					`✅ Ingested log #${logId}: [${this.parser.getSeverityName(parsed.severity).toUpperCase()}] ${parsed.hostname}/${parsed.appName}: ${parsed.message}`,
				);
			}
		} catch (error) {
			console.error("❌ Error processing syslog message:", error);
			console.error("Raw message:", rawMessage);
		}
	}

	async stop(): Promise<void> {
		if (this.server) {
			for (const socket of this.connections) {
				socket.end();
			}
			this.server.stop();
			this.db.close();
			console.log("Syslog server stopped");
		}
	}

	getDatabase(): LogDatabase {
		return this.db;
	}
}
