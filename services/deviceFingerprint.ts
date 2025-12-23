/**
 * Device Fingerprint Service
 * Generates a unique device identifier for license validation
 */

/**
 * Generate a device fingerprint based on hardware and system information
 * This creates a unique identifier that's hard to spoof
 */
export function generateDeviceFingerprint(): string {
  try {
    const parts: string[] = [];

    // Screen resolution (hardware-specific)
    if (typeof screen !== 'undefined') {
      parts.push(`${screen.width}x${screen.height}`);
      parts.push(`${screen.colorDepth || 24}`);
    }

    // User agent (browser/OS info)
    if (typeof navigator !== 'undefined') {
      parts.push(navigator.userAgent || '');
      parts.push(navigator.language || 'en');
      parts.push(navigator.platform || '');
      
      // Hardware concurrency (CPU cores)
      if ((navigator as any).hardwareConcurrency) {
        parts.push(`cores:${(navigator as any).hardwareConcurrency}`);
      }
      
      // Memory info (if available)
      if ((navigator as any).deviceMemory) {
        parts.push(`mem:${(navigator as any).deviceMemory}`);
      }
    }

    // Timezone
    try {
      parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch (e) {
      // Ignore
    }

    // Combine and hash
    const combined = parts.join('|');
    
    // Simple hash function (for client-side)
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to hex string
    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
    
    // Add timestamp component (first install time, stored in localStorage)
    const installTime = getOrSetInstallTime();
    const installHash = Math.abs(installTime).toString(16).padStart(8, '0');
    
    return `${hashStr}-${installHash}`.toUpperCase();
  } catch (error) {
    console.error('Error generating device fingerprint:', error);
    // Fallback to a random ID stored in localStorage
    return getOrCreateFallbackId();
  }
}

/**
 * Get or set the first install timestamp
 */
function getOrSetInstallTime(): number {
  const key = 'cleansnap_install_time';
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return parseInt(saved, 10);
    }
    const now = Date.now();
    localStorage.setItem(key, now.toString());
    return now;
  } catch (e) {
    return Date.now();
  }
}

/**
 * Fallback ID generation if fingerprint fails
 */
function getOrCreateFallbackId(): string {
  const key = 'cleansnap_device_id';
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return saved;
    }
    // Generate a random ID
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    localStorage.setItem(key, id);
    return id;
  } catch (e) {
    // Last resort: use timestamp
    return Date.now().toString(16).toUpperCase();
  }
}

/**
 * Get device fingerprint (cached)
 */
let cachedFingerprint: string | null = null;

export function getDeviceFingerprint(): string {
  if (!cachedFingerprint) {
    cachedFingerprint = generateDeviceFingerprint();
  }
  return cachedFingerprint;
}
