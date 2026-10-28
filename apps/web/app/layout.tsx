import type { Metadata } from 'next';
import './globals.css';
import { ServiceWorker } from './service-worker';

export const metadata: Metadata = { title: 'Nexo ENEM', description: 'Preparação inteligente e cuidadosa para o ENEM.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: 'Nexo ENEM' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><main>{children}</main><ServiceWorker /></body></html>; }
