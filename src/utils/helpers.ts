export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function splitScriptIntoSegments(
  script: string,
  numSegments: number
): string[] {
  // First, split the script into sentences
  const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];

  if (sentences.length <= numSegments) {
    // If we have fewer sentences than needed segments, pad with empty strings
    return [...sentences, ...Array(numSegments - sentences.length).fill('')];
  }

  // Calculate the ideal length for each segment
  const totalLength = sentences.length;
  const segmentSize = Math.ceil(totalLength / numSegments);

  const segments: string[] = [];
  let currentSegment: string[] = [];
  let currentLength = 0;

  sentences.forEach((sentence, index) => {
    currentSegment.push(sentence.trim());
    currentLength++;

    // Check if we should create a new segment
    if (currentLength >= segmentSize || index === sentences.length - 1) {
      segments.push(currentSegment.join(' '));
      currentSegment = [];
      currentLength = 0;
    }
  });

  // Pad with empty strings if we don't have enough segments
  while (segments.length < numSegments) {
    segments.push('');
  }

  return segments;
}
