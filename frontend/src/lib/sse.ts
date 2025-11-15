export function connectStatusStream(videoId: string, onMessage: (data: any) => void) {
  const es = new EventSource(`/status/${videoId}/stream`)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onMessage(data)
    } catch {}
  }
  return es
}

