import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
	STATE_DIR,
	FILE_MODE_PRIVATE,
	FILE_MODE_PUBLIC,
	DIR_MODE,
} from "./constants.js";

const ADMIN_FILE = "admin.json";
const OPERATOR_FILE = "operator.json";
const CREDENTIALS_DIR = "credentials";

export interface AdminConfig {
	adminSecretHex: string;
	createdAt: string;
}

export interface OperatorConfig {
	operatorSecretHex: string;
	createdAt: string;
}

export interface CredentialFile {
	id: string;
	credentialSecretHex: string;
	leafHex: string;
	createdAt: string;
}

function stateDir(): string {
	const dir = path.join(process.cwd(), STATE_DIR);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
	}
	return dir;
}

function readJson<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) return null;
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJsonPrivate(filePath: string, data: unknown): void {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`, {
		mode: FILE_MODE_PRIVATE,
	});
}

function writeJsonPublic(filePath: string, data: unknown): void {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, "\t")}\n`, {
		mode: FILE_MODE_PUBLIC,
	});
}

export function randomSecretHex(): string {
	return crypto.randomBytes(32).toString("hex");
}

export function hexToBytes32(hex: string): Uint8Array {
	const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (cleaned.length !== 64) throw new Error(`expected 32-byte hex, got ${cleaned.length / 2} bytes`);
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		out[i] = Number.parseInt(cleaned.substr(i * 2, 2), 16);
	}
	return out;
}

export function bytesToHex(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
	return s;
}

export function loadAdmin(): AdminConfig | null {
	return readJson<AdminConfig>(path.join(stateDir(), ADMIN_FILE));
}

export function saveAdmin(adminSecretHex: string): AdminConfig {
	const cfg: AdminConfig = { adminSecretHex, createdAt: new Date().toISOString() };
	writeJsonPrivate(path.join(stateDir(), ADMIN_FILE), cfg);
	return cfg;
}

export function loadOperator(): OperatorConfig | null {
	return readJson<OperatorConfig>(path.join(stateDir(), OPERATOR_FILE));
}

export function saveOperator(operatorSecretHex: string): OperatorConfig {
	const cfg: OperatorConfig = { operatorSecretHex, createdAt: new Date().toISOString() };
	writeJsonPrivate(path.join(stateDir(), OPERATOR_FILE), cfg);
	return cfg;
}

export function credentialsDir(): string {
	const dir = path.join(stateDir(), CREDENTIALS_DIR);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
	return dir;
}

export function saveCredential(cred: CredentialFile): string {
	const file = path.join(credentialsDir(), `${cred.id}.json`);
	writeJsonPublic(file, cred);
	return file;
}

export function loadCredential(filePath: string): CredentialFile {
	const cred = readJson<CredentialFile>(filePath);
	if (!cred) throw new Error(`credential file not found: ${filePath}`);
	return cred;
}

export function listCredentialFiles(): string[] {
	const dir = credentialsDir();
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => path.join(dir, f))
		.sort();
}
