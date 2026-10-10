
"use client";

import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { AppVersionSwitcher } from '@/components/layout/app-version-switcher';
import { useAppVersion } from '@/context/app-version-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Access is enforced on the server by src/middleware.ts: no page under this
// layout is served without a valid PIN session cookie.

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The state for the loading overlay is being removed.
  // A simple state is kept for the sidebar's setIsPageLoading prop, though it won't have a visible effect anymore.
  const [isPageLoading, setIsPageLoading] = useState(false);
  const { appVersion } = useAppVersion();

  return (
    <>
      <AppSidebar setIsPageLoading={setIsPageLoading} />
      <SidebarInset className="bg-background relative">
        <div className="sticky top-0 z-30 flex flex-col gap-0 border-b bg-background/95 px-4 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-muted-foreground">
              Select which build of the app you want to use.
            </div>
            <AppVersionSwitcher />
          </div>
          {appVersion === 'open-source' && (
            <Alert className="mt-2 border-amber-300 bg-amber-50 text-amber-900">
              <Info className="h-4 w-4" />
              <AlertTitle>Open Source Mode</AlertTitle>
              <AlertDescription>
                Paid AI services are disabled. Features such as voice agents and call scoring run in read-only/demo mode using only open-source libraries.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="p-4">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}
