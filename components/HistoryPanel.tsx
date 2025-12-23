import React from 'react';
import { CaptureHistory } from '../types';
import { IconX, IconTrash } from './Icons';
import { useLanguage } from './i18n/LanguageContext';

interface HistoryPanelProps {
  history: CaptureHistory[];
  onClose: () => void;
  onSelect: (item: CaptureHistory) => void;
  onDelete: (id: string) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onClose, onSelect, onDelete }) => {
  const { t } = useLanguage();
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('history.just_now');
    if (minutes < 60) return t('history.minutes_ago').replace('%s', minutes.toString());
    if (hours < 24) return t('history.hours_ago').replace('%s', hours.toString());
    if (days < 7) return t('history.days_ago').replace('%s', days.toString());
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">{t('history.title')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <IconX className="w-6 h-6" />
          </button>
        </div>

        {/* History Grid */}
        <div className="flex-1 overflow-auto p-6">
          {history.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <p>{t('history.no_captures')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="group relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-blue-500 transition-all cursor-pointer"
                  onClick={() => onSelect(item)}
                >
                  <img
                    src={item.imageData}
                    alt={`Capture ${item.id}`}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                      {t('history.click_to_edit')}
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      className="bg-red-600/80 hover:bg-red-600 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="text-white text-xs">{formatDate(item.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;

