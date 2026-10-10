"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { PageTitle } from "@/components/common/page-title";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";

interface PageHeaderProps {
  title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-xs px-4 md:px-6">
      {isMobile && (
        <SidebarTrigger variant="ghost" size="icon" className="md:hidden -ml-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </SidebarTrigger>
      )}
      <PageTitle text={title} className="flex-1" />
      {/* Add any other header actions here if needed, e.g. User Profile Dropdown */}
    </header>
  );
}
