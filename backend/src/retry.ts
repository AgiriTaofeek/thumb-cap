export async function retry<T>(fn: () => Promise<T>, { retries = 3, baseMs = 200, factor = 2, jitter = true }: { retries?: number; baseMs?: number; factor?: number; jitter?: boolean } = {}): Promise<T> {
  let attempt = 0
  let lastErr: any
  while (attempt <= retries) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries) throw err
      const delay = Math.floor(baseMs * Math.pow(factor, attempt) * (jitter ? (0.7 + Math.random() * 0.6) : 1))
      await new Promise(r => setTimeout(r, delay))
      attempt++
    }
  }
  throw lastErr
}

