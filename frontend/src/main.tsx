import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { I18nProvider, applyLanguageToDocument, resolveInitialLanguage } from '@/context/I18nContext';
import { ToastProvider } from '@/components/ui/Toast';

const initialLanguage = resolveInitialLanguage();
applyLanguageToDocument(initialLanguage);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider initialLanguage={initialLanguage}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </StrictMode>
);
