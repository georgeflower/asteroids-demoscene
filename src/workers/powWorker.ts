// Dedicated Web Worker for SHA-256 Proof-of-Work computation.
// Runs the PoW challenge on the worker thread to keep the main thread free.

self.onmessage = async (e: MessageEvent<{ challenge: string; difficulty: number }>) => {
  const { challenge, difficulty } = e.data;
  let nonce = 0;
  while (true) {
    const data = new TextEncoder().encode(challenge + nonce.toString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    let zeroBits = 0;
    let found = false;
    for (const byte of hashArray) {
      if (byte === 0) {
        zeroBits += 8;
      } else {
        for (let bit = 7; bit >= 0; bit--) {
          if ((byte & (1 << bit)) === 0) zeroBits++;
          else {
            found = true;
            break;
          }
        }
      }
      if (found || zeroBits >= difficulty) break;
    }
    if (zeroBits >= difficulty) {
      self.postMessage({ nonce });
      return;
    }
    nonce++;
  }
};
