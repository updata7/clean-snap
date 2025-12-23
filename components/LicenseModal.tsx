import React, { useState, useEffect } from 'react';
import { IconX, IconCheck } from './Icons';
import { useLanguage } from './i18n/LanguageContext';
import { getLicenseStatus, activateLicense, clearLicense } from '../services/licenseService';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LicenseModal: React.FC<LicenseModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseStatus, setLicenseStatus] = useState(() => getLicenseStatus());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLicenseStatus(getLicenseStatus());
      setLicenseKeyInput('');
      setMessage(null);
    }
  }, [isOpen]);

  const handleActivate = () => {
    const result = activateLicense(licenseKeyInput);
    if (result.success) {
      setLicenseStatus(getLicenseStatus());
      setLicenseKeyInput('');
      setMessage({ type: 'success', text: t('license.activated') });
      setTimeout(() => {
        setMessage(null);
        onClose();
      }, 2000);
    } else {
      // Map error messages to translation keys
      let errorText = result.message;
      if (result.message.includes('empty')) {
        errorText = t('license.key_empty');
      } else if (result.message.includes('Invalid') || result.message.includes('format')) {
        errorText = t('license.key_invalid');
      } else if (result.message.includes('Failed')) {
        errorText = t('license.activation_failed');
      }
      setMessage({ type: 'error', text: errorText });
    }
  };

  const handleDeactivate = () => {
    clearLicense();
    setLicenseStatus({ isAuthorized: false });
    setMessage({ type: 'success', text: t('license.deactivated') });
    setTimeout(() => setMessage(null), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-[420px] max-w-[90vw] max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white tracking-tight">
            {licenseStatus.isAuthorized ? t('license.pro_active') : t('license.upgrade_to_pro')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status Display */}
          {licenseStatus.isAuthorized ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
              <div className="flex items-center gap-2 text-green-400 font-medium mb-1.5 text-sm">
                <IconCheck className="w-4 h-4" />
                <span>{t('license.device_authorized')}</span>
              </div>
              <p className="text-xs text-white/70">
                {t('license.unlimited_recording')}
              </p>
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
              <div className="text-yellow-400 font-medium mb-1.5 text-sm">{t('license.free_limitations')}</div>
              <ul className="text-xs text-white/70 space-y-1 list-disc list-inside">
                <li>{t('license.max_duration')}</li>
                <li>{t('license.auto_stop')}</li>
              </ul>
            </div>
          )}

          {/* License Key Input */}
          {!licenseStatus.isAuthorized && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1.5">
                  {t('license.enter_key')}
                </label>
                <input
                  type="text"
                  value={licenseKeyInput}
                  onChange={(e) => {
                    setLicenseKeyInput(e.target.value);
                    setMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleActivate();
                    }
                  }}
                  placeholder={t('license.enter_key_placeholder')}
                  className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  autoFocus
                />
              </div>

              {message && (
                <div className={`p-2.5 rounded-lg text-xs ${
                  message.type === 'success' 
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                  {message.text}
                </div>
              )}

              <button
                onClick={handleActivate}
                disabled={!licenseKeyInput.trim()}
                className="w-full px-3 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {t('license.activate')}
              </button>
            </div>
          )}

          {/* Deactivate Button */}
          {licenseStatus.isAuthorized && (
            <button
              onClick={handleDeactivate}
              className="w-full px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-white/10"
            >
              {t('license.deactivate')}
            </button>
          )}

          {/* Info Section */}
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-white/90 mb-1.5">{t('license.pro_features')}</h3>
              <ul className="text-xs text-white/70 space-y-1">
                <li className="flex items-center gap-2">
                  <IconCheck className="w-3.5 h-3.5 text-green-400" />
                  <span>{t('license.unlimited_duration')}</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck className="w-3.5 h-3.5 text-green-400" />
                  <span>{t('license.priority_support')}</span>
                </li>
                <li className="flex items-center gap-2">
                  <IconCheck className="w-3.5 h-3.5 text-green-400" />
                  <span>{t('license.future_updates')}</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-white/90 mb-1.5">{t('license.contact_us')}</h3>
              <div className="text-xs text-white/70 space-y-1">
                <p>{t('license.need_help')}</p>
                <p className="text-blue-400">
                  {t('license.email')}: <a href="mailto:support@cleansnap.app" className="hover:underline">support@cleansnap.app</a>
                </p>
                <p className="text-blue-400">
                  {t('license.website')}: <a href="https://cleansnap.app" target="_blank" rel="noopener noreferrer" className="hover:underline">cleansnap.app</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LicenseModal;
