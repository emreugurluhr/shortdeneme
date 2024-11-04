export async function saveToFile(content: string, path: string): Promise<void> {
  try {
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    await ensureDirectory(dirPath);

    const blob = new Blob([content], { type: 'text/plain' });
    await saveBlob(blob, path);
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error(
      `Failed to save file to ${path}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function saveBase64Image(
  base64Data: string,
  path: string
): Promise<void> {
  try {
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    await ensureDirectory(dirPath);

    const response = await fetch(base64Data);
    const blob = await response.blob();
    await saveBlob(blob, path);
  } catch (error) {
    console.error('Error saving image:', error);
    throw new Error(
      `Failed to save image to ${path}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function saveAudio(audioUrl: string, path: string): Promise<void> {
  try {
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    await ensureDirectory(dirPath);

    const response = await fetch(audioUrl);
    const blob = await response.blob();
    await saveBlob(blob, path);
  } catch (error) {
    console.error('Error saving audio:', error);
    throw new Error(
      `Failed to save audio to ${path}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

async function saveBlob(blob: Blob, path: string): Promise<void> {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error saving blob:', error);
    throw error;
  }
}

async function ensureDirectory(path: string): Promise<void> {
  // In browser environment, we don't need to create directories
  // as we're downloading files directly
  return Promise.resolve();
}

export async function ensureDirectories(): Promise<void> {
  // In browser environment, we don't need to create directories
  return Promise.resolve();
}
