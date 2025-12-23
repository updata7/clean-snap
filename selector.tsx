import React from 'react';
import ReactDOM from 'react-dom/client';
import AreaSelector from './components/AreaSelector';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AreaSelector />
  </React.StrictMode>
);
