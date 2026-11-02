import type { Metadata, Viewport } from 'next';
import './globals.css';
import './refinements.css';
import './quiz-session.css';
import './quiz-navigator.css';
import './question-assets.css';
import './quiz-history.css';
import './exam-selector.css';
import './transcription-fidelity.css';
import './essay-evaluation.css';
import './evaluation-background.css';
import './essay-feedback-guidance.css';
import './mobile-usability.css';
import { ServiceWorker } from './service-worker';
import { AuthProvider } from '../components/auth-provider';

export const metadata: Metadata = { title: 'Nexo ENEM', description: 'Preparação inteligente e cuidadosa para o ENEM.', manifest: '/manifest.webmanifest', icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' }, appleWebApp: { capable: true, title: 'Nexo ENEM' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#18213d' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><AuthProvider><main>{children}</main></AuthProvider><ServiceWorker /></body></html>; }
