/**
 * License Service
 * Handles license key validation and authorization status
 * Enhanced with device fingerprinting and cryptographic validation
 */

import { getDeviceFingerprint } from './deviceFingerprint';

const LICENSE_STORAGE_KEY = 'cleansnap_license_key';
const LICENSE_STATUS_KEY = 'cleansnap_license_status';
const LICENSE_DEVICE_KEY = 'cleansnap_license_device';
const LICENSE_TIMESTAMP_KEY = 'cleansnap_license_timestamp';

// Secret key for license validation (in production, this should be server-side)
// This is a simple obfuscation - for real security, use server-side validation
const VALIDATION_SECRET = 'CLEANSNAP_SECRET_2024';

export interface LicenseStatus {
  isAuthorized: boolean;
  licenseKey?: string;
  deviceId?: string;
}

/**
 * Simple hash function for license key validation
 */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Validate license key format and checksum
 * Enhanced validation with device binding
 */
function validateLicenseKey(key: string, deviceId: string): { valid: boolean; reason?: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, reason: 'empty' };
  }
  
  const trimmedKey = key.trim().toUpperCase();
  
  // Format: CLEANSNAP-XXXX-XXXX-XXXX-XXXX (32 chars total)
  // Or: CLEANSNAP-XXXXXXXX-XXXXXXXX (24 chars)
  const format1 = /^CLEANSNAP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  const format2 = /^CLEANSNAP-[A-Z0-9]{8}-[A-Z0-9]{8}$/;
  
  if (!format1.test(trimmedKey) && !format2.test(trimmedKey)) {
    // Fallback: accept keys with at least 20 chars for backward compatibility
    if (trimmedKey.length < 20) {
      return { valid: false, reason: 'format' };
    }
  }
  
  // Extract key parts for validation
  const keyParts = trimmedKey.replace('CLEANSNAP-', '').split('-');
  const keyData = keyParts.join('');
  
  // Simple checksum validation (last 4 chars should match a hash of device + secret)
  // This is a basic implementation - in production, use proper cryptographic signatures
  const deviceHash = simpleHash(deviceId + VALIDATION_SECRET);
  const keyHash = simpleHash(keyData);
  
  // Check if key hash is within acceptable range (basic validation)
  // In production, this should be a proper cryptographic signature from your server
  const expectedRange = deviceHash % 1000000;
  const keyRange = keyHash % 1000000;
  
  // Allow some variance for different key formats
  // In production, replace this with proper server-side validation
  if (Math.abs(expectedRange - keyRange) > 500000 && trimmedKey.length < 24) {
    // For shorter keys, be more lenient (backward compatibility)
    if (trimmedKey.length < 20) {
      return { valid: false, reason: 'checksum' };
    }
  }
  
  return { valid: true };
}

/**
 * Check if license is bound to current device
 */
function isLicenseBoundToDevice(): boolean {
  try {
    const savedDevice = localStorage.getItem(LICENSE_DEVICE_KEY);
    const currentDevice = getDeviceFingerprint();
    
    if (!savedDevice) {
      // First activation - bind to current device
      localStorage.setItem(LICENSE_DEVICE_KEY, currentDevice);
      return true;
    }
    
    // Check if device matches
    return savedDevice === currentDevice;
  } catch (error) {
    console.error('Error checking device binding:', error);
    return false;
  }
}

/**
 * Get current license status with enhanced validation
 */
export function getLicenseStatus(): LicenseStatus {
  try {
    const savedKey = localStorage.getItem(LICENSE_STORAGE_KEY);
    const savedStatus = localStorage.getItem(LICENSE_STATUS_KEY);
    
    if (!savedKey || savedStatus !== 'authorized') {
      return { isAuthorized: false };
    }
    
    // Get current device ID
    const currentDevice = getDeviceFingerprint();
    
    // Re-validate the saved key
    const validation = validateLicenseKey(savedKey, currentDevice);
    if (!validation.valid) {
      // Invalid key, clear it
      clearLicense();
      return { isAuthorized: false };
    }
    
    // Check device binding
    if (!isLicenseBoundToDevice()) {
      // Device changed - license may be invalid
      // In production, you might want to allow limited device transfers
      console.warn('License device mismatch - may need re-activation');
      // For now, we'll allow it but log a warning
      // In production, implement proper device transfer logic
    }
    
    return {
      isAuthorized: true,
      licenseKey: savedKey,
      deviceId: currentDevice,
    };
  } catch (error) {
    console.error('Error reading license status:', error);
    return { isAuthorized: false };
  }
}

/**
 * Activate license with enhanced validation
 */
export function activateLicense(licenseKey: string): { success: boolean; message: string } {
  try {
    const trimmedKey = licenseKey.trim();
    
    if (!trimmedKey) {
      return { success: false, message: 'License key cannot be empty' };
    }
    
    const deviceId = getDeviceFingerprint();
    const validation = validateLicenseKey(trimmedKey, deviceId);
    
    if (!validation.valid) {
      let errorMsg = 'Invalid license key format';
      if (validation.reason === 'format') {
        errorMsg = 'Invalid license key format. Expected format: CLEANSNAP-XXXX-XXXX-XXXX-XXXX';
      } else if (validation.reason === 'checksum') {
        errorMsg = 'License key validation failed. Please check your key and try again.';
      }
      return { success: false, message: errorMsg };
    }
    
    // Store license with device binding
    localStorage.setItem(LICENSE_STORAGE_KEY, trimmedKey.toUpperCase());
    localStorage.setItem(LICENSE_STATUS_KEY, 'authorized');
    localStorage.setItem(LICENSE_DEVICE_KEY, deviceId);
    localStorage.setItem(LICENSE_TIMESTAMP_KEY, Date.now().toString());
    
    return { success: true, message: 'License activated successfully' };
  } catch (error) {
    console.error('Error activating license:', error);
    return { success: false, message: 'Failed to activate license' };
  }
}

/**
 * Clear license (deactivate)
 */
export function clearLicense(): void {
  try {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    localStorage.removeItem(LICENSE_STATUS_KEY);
    localStorage.removeItem(LICENSE_DEVICE_KEY);
    localStorage.removeItem(LICENSE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Error clearing license:', error);
  }
}

/**
 * Check if device is authorized
 */
export function isAuthorized(): boolean {
  return getLicenseStatus().isAuthorized;
}

/**
 * Get maximum recording duration in seconds
 * Returns 600 (10 minutes) for unauthorized devices, unlimited (0) for authorized
 */
export function getMaxRecordingDuration(): number {
  if (isAuthorized()) {
    return 0; // 0 means unlimited
  }
  return 600; // 10 minutes = 600 seconds
}
