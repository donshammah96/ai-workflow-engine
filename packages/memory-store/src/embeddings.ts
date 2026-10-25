export async function generateEmbedding(
  text: string,
  dimensions = 1536
): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && process.env.USE_MOCK_LLM !== 'true') {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000),
          dimensions,
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
        if (json.data?.[0]?.embedding) {
          return json.data[0].embedding;
        }
      }
    } catch (e) {
      console.warn('[generateEmbedding] OpenAI API call failed, falling back to deterministic embedding:', e);
    }
  }

  // Deterministic 1536-dim embedding generator
  // Generates consistent semantic representation based on character and n-gram hash buckets
  const vector = new Array<number>(dimensions).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    let hash = 0;
    for (let c = 0; c < word.length; c++) {
      hash = (hash << 5) - hash + word.charCodeAt(c);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vector[idx] = (vector[idx] ?? 0) + 1.0;

    // 2-gram hash
    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      let bHash = 0;
      for (let c = 0; c < bigram.length; c++) {
        bHash = (bHash << 5) - bHash + bigram.charCodeAt(c);
        bHash |= 0;
      }
      const bIdx = Math.abs(bHash) % dimensions;
      vector[bIdx] = (vector[bIdx] ?? 0) + 0.5;
    }
  }

  // L2 Normalize vector
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += (vector[i] ?? 0) * (vector[i] ?? 0);
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  for (let i = 0; i < dimensions; i++) {
    vector[i] = (vector[i] ?? 0) / norm;
  }

  return vector;
}
