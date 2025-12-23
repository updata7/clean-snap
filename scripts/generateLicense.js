/**
 * License Key Generator
 * Run this script to generate valid license keys
 * 
 * Usage: node scripts/generateLicense.js [deviceId] [type]
 * 
 * Examples:
 *   node scripts/generateLicense.js                    # Generate for current device
 *   node scripts/generateLicense.js UNIVERSAL          # Generate universal key (any device)
 *   node scripts/generateLicense.js ABC123 universal    # Generate for specific device
 */

const crypto = require('crypto');

// Must match the secret in licenseService.ts
const LICENSE_SECRET = 'CLEANSNAP_SECRET_2024_V1';

function hashLicenseData(data, secret) {
  let hash = 0;
  const combined = data + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

function generateLicenseKey(deviceId, timestamp) {
  const targetDevice = deviceId || 'UNIVERSAL';
  const ts = timestamp || Date.now();
  const data = `CLEANSNAP-${targetDevice}-${ts}`;
  const checksum = hashLicenseData(data, LICENSE_SECRET);
  
  return `CLEANSNAP-${targetDevice}-${ts}-${checksum}`;
}

// Get arguments
const args = process.argv.slice(2);
const deviceId = args[0] || 'UNIVERSAL';
const timestamp = args[1] ? parseInt(args[1], 10) : Date.now();

const licenseKey = generateLicenseKey(deviceId, timestamp);

console.log('\n=== License Key Generated ===');
console.log('License Key:', licenseKey);
console.log('Device ID:', deviceId);
console.log('Timestamp:', new Date(timestamp).toISOString());
console.log('\nCopy this key and provide it to users for activation.\n');
