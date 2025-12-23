import React from 'react';
import { IconX, IconDownload, IconCopy, IconPen } from './Icons';
import { CaptureService } from '../services/captureService';

interface PreviewWindowProps {
  imageSrc: string;
  onClose: () => void;
  onEdit: () => void;
}

const PreviewWindow: React.FC<PreviewWindowProps> = ({ imageSrc, onClose, onEdit }) => {
  const handleCopy = async () => {
    await CaptureService.copyToClipboard(imageSrc);
    onClose();
  };

  const handleSave = async () => {
    await CaptureService.saveImage(imageSrc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-white font-semibold">Preview</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950">
          <img
            src={imageSrc}
            alt="Preview"
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 p-4 border-t border-slate-700">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <IconCopy className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <IconPen className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <IconDownload className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewWindow;

