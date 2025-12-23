import React from 'react';
import ReactDOM from 'react-dom/client';
import PreviewWindow from './components/PreviewWindow';

const urlParams = new URLSearchParams(window.location.search);
const imagePath = urlParams.get('imagePath') || '';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <PreviewWindow
      imageSrc={imagePath}
      onClose={() => {
        if (window.electronAPI) {
          // Close window via Electron
          window.close();
        }
      }}
      onEdit={() => {
        // Handle edit action
      }}
    />
  </React.StrictMode>
);

