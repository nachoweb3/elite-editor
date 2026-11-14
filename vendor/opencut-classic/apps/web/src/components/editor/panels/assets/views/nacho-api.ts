// Client for the local Elite engine, proxied by Next at /nacho-api.
export async function nachoApi<T>(path: string, data?: unknown): Promise<T> {
	const headers: Record<string, string> = {};
	if (data !== undefined) {
		const session = await fetch("/nacho-api/session");
		if (!session.ok) throw Error("El motor local no responde");
		headers["x-studio-token"] = (await session.json()).token;
		headers["Content-Type"] = "application/json";
	}
	const response = await fetch("/nacho-api" + path, {
		method: data === undefined ? "GET" : "POST",
		headers,
		body: data === undefined ? undefined : JSON.stringify(data),
	});
	const result = await response.json();
	if (!response.ok)
		throw Error(result.error || "No se pudo completar la operación");
	return result;
}

export const clock = (seconds: number) => {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

export const minutes = (seconds: number) => {
	const s = Math.max(0, Math.round(seconds));
	const m = Math.floor(s / 60);
	return m ? `${m} min ${s % 60} s` : `${s} s`;
};

export async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
