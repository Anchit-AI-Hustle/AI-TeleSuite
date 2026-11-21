import type {Metadata} from 'next';
import Script from 'next/script';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@/styles/transcript.css'; // Import transcript styles
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProductProvider } from '@/hooks/useProductContext';
import { UserProfileProvider } from '@/hooks/useUserProfile';
import { KnowledgeBaseProvider } from '@/hooks/use-knowledge-base';
import { ActivityLogProvider } from '@/hooks/use-activity-logger';
import { AppVersionProvider } from '@/context/app-version-context';

const PORTFOLIO_ASSETS = 'https://anchit-tandon.com/assets';

export const metadata: Metadata = {
  title: 'AI_TeleSuite',
  description: 'AI-powered Sales and Support Suite',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '64x64' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Shared portfolio navigation + project-level SkillTree / prompt library. */}
        <link rel="stylesheet" href={`${PORTFOLIO_ASSETS}/app-skill-map.css`} />
        <link rel="stylesheet" href={`${PORTFOLIO_ASSETS}/project-playbooks.css`} />
      </head>
      <body className={`font-sans antialiased`}>
        {/* Public demo sample data. It has to run before the app reads the browser's storage. */}
        <Script src="/demo-seed.js" strategy="beforeInteractive" />
        <AppVersionProvider>
          <UserProfileProvider>
           <ProductProvider>
            <KnowledgeBaseProvider>
             <ActivityLogProvider>
              <SidebarProvider defaultOpen={true}>
                {children}
              </SidebarProvider>
             </ActivityLogProvider>
            </KnowledgeBaseProvider>
           </ProductProvider>
          </UserProfileProvider>
        </AppVersionProvider>
        <Toaster />
        <Script src={`${PORTFOLIO_ASSETS}/app-skill-map.js`} strategy="afterInteractive" />
        <Script src={`${PORTFOLIO_ASSETS}/project-playbooks.js`} strategy="afterInteractive" />
      </body>
    </html>
  );
}
