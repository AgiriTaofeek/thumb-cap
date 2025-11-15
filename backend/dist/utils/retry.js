export async function retry(fn, { retries = 3, baseMs = 200, factor = 2, jitter = true } = {}) {
    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (attempt === retries)
                throw err;
            const delay = Math.floor(baseMs * Math.pow(factor, attempt) * (jitter ? (0.7 + Math.random() * 0.6) : 1));
            await new Promise(r => setTimeout(r, delay));
            attempt++;
        }
    }
    throw lastErr;
}
