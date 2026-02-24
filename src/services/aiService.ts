// Client-side wrapper that communicates with our server-side Llama-powered AI endpoints.
// This replaces the previous Gemini-based implementation; it's still used in the React
// app but now routes requests to the Express API, which in turn uses node-llama-cpp.

const CACHE_KEY = 'ftcNewsCache';
const TS_KEY = 'ftcNewsTimestamp';

async function postJSON(endpoint: string, body: any = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function fetchFTCNews(force: boolean = false) {
  // keep the same localStorage caching logic that existed previously
  if (!force && typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(TS_KEY);
    if (cached && ts) {
      const age = Date.now() - parseInt(ts, 10);
      if (age < 24 * 60 * 60 * 1000) {
        return cached;
      }
    }
  }

  try {
    const { result } = await postJSON('/api/ai/fetch-news', { force });
    const value = result || 'No news found at the moment.';

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, value);
      localStorage.setItem(TS_KEY, Date.now().toString());
    }

    return value;
  } catch (error) {
    console.error('Error fetching AI news:', error);
    return 'Failed to fetch latest news. Please check your connection.';
  }
}

// streaming variant using fetch body's readable stream
export async function streamFTCNews(
  force: boolean = false,
  onChunk: (chunk: string) => void
) {
  const res = await fetch(`/api/ai/fetch-news?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode()); // flush
}

export async function getAttendanceInsights(records: any[], members: any[]) {
  try {
    const { result } = await postJSON('/api/ai/attendance', { records, members });
    return result || 'No insights available.';
  } catch (error) {
    console.error('Error getting insights:', error);
    return 'Insights unavailable.';
  }
}

export async function streamAttendanceInsights(
  records: any[],
  members: any[],
  onChunk: (chunk: string) => void
) {
  const res = await fetch(`/api/ai/attendance?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, members }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode()); // flush
}

export async function checkExcuse(reason: string, criteria: string) {
  try {
    const { result } = await postJSON('/api/ai/check-excuse', { reason, criteria });
    return result || 'UNEXCUSED - AI failed to analyze.';
  } catch (error) {
    console.error('Error checking excuse:', error);
    return 'UNEXCUSED - AI error.';
  }
}

export async function streamCheckExcuse(
  reason: string,
  criteria: string,
  onChunk: (chunk: string) => void
) {
  const res = await fetch(`/api/ai/check-excuse?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, criteria }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode()); // flush
}

export async function getActivitySummary(data: any) {
  try {
    const { result } = await postJSON('/api/ai/activity-summary', data);
    return result || 'No summary available.';
  } catch (error) {
    console.error('Error getting activity summary:', error);
    return 'Summary unavailable.';
  }
}

export async function streamActivitySummary(
  data: any,
  onChunk: (chunk: string) => void
) {
  const res = await fetch(`/api/ai/activity-summary?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode()); // flush
}
