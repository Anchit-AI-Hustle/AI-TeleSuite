"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect, useMemo } from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/icons/logo";
import { cn } from "@/lib/utils";
import { 
    Home, Lightbulb, MessageSquareReply, LayoutDashboard, Database, BookOpen, 
    ListChecks, Mic2, AreaChart, UserCircle, FileSearch, BarChart3, 
    Presentation, ListTree, Voicemail, Ear, Users as UsersIcon,
    Briefcase, Headset, CodeSquare, Settings2, PieChart, ShoppingBag, Activity, Server, Workflow, Bot, DownloadCloud, BarChartBig, Folder, LogOut
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useUserProfile } from '@/hooks/useUserProfile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useFeatureLogger } from '@/lib/feature-logger';
import { Button } from "@/components/ui/button";
import { USER_PROFILES } from "@/types";

interface AppSidebarProps {
  setIsPageLoading: (isLoading: boolean) => void;
}

type SidebarNavLeaf = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type SidebarNavItem = {
  type: 'item';
  href: string;
  label: string;
  icon: React.ElementType;
};

type SidebarNavGroup = {
  type: 'group';
  label: string;
  icon: React.ElementType;
  items: SidebarNavLeaf[];
};

type SidebarNavSeparator = { type: 'separator' };

type SidebarNavEntry = SidebarNavItem | SidebarNavGroup | SidebarNavSeparator;

const navStructure: SidebarNavEntry[] = [
  { type: 'item', href: "/home", label: "Home", icon: Home },
  { type: 'item', href: "/products", label: "Products", icon: ShoppingBag },
  { type: 'item', href: "/knowledge-base", label: "Knowledge Base", icon: Database },
  { type: 'separator' },
  { 
    type: 'group', 
    label: "Sales & Support Tools", 
    icon: Briefcase,
    items: [
      { href: "/pitch-generator", label: "AI Pitch Generator", icon: Lightbulb },
      { href: "/rebuttal-generator", label: "AI Rebuttal Assistant", icon: MessageSquareReply },
    ]
  },
  { 
    type: 'group', 
    label: "Analysis & Reporting", 
    icon: BarChartBig,
    items: [
      { href: "/transcription", label: "Audio Transcription", icon: Mic2 },
      { href: "/transcription-dashboard", label: "Transcription DB", icon: ListTree },
      { href: "/call-scoring", label: "AI Call Scoring", icon: ListChecks },
      { href: "/call-scoring-dashboard", label: "Call Scoring DB", icon: AreaChart },
      { href: "/combined-call-analysis", label: "Combined Call Analysis", icon: PieChart },
      { href: "/combined-call-analysis-dashboard", label: "Combined Analysis DB", icon: BarChart3 },
    ]
  },
   { 
    type: 'group', 
    label: "Voice Agents", 
    icon: Headset,
    items: [
      { href: "/voice-sales-agent", label: "AI Voice Sales Agent", icon: Voicemail },
      { href: "/voice-sales-dashboard", label: "Voice Sales DB", icon: LayoutDashboard },
      { href: "/voice-support-agent", label: "AI Voice Support Agent", icon: Ear },
      { href: "/voice-support-dashboard", label: "Voice Support DB", icon: LayoutDashboard },
    ]
  },
  { 
    type: 'group', 
    label: "Content & Data Tools", 
    icon: CodeSquare,
    items: [
      { href: "/create-training-deck", label: "Training Material Creator", icon: BookOpen },
      { href: "/training-material-dashboard", label: "Material DB", icon: Presentation },
      { href: "/data-analysis", label: "AI Data Analyst", icon: FileSearch },
      { href: "/data-analysis-dashboard", label: "Data Analysis DB", icon: BarChart3 },
      { href: "/batch-audio-downloader", label: "Batch Audio Downloader", icon: DownloadCloud },
    ]
  },
  { type: 'separator' },
  {
    type: 'group',
    label: "System",
    icon: Settings2,
    items: [
      { href: "/activity-dashboard", label: "Global Activity Log", icon: Activity },
      { href: "/clone-app", label: "Clone Full App", icon: Server },
      { href: "/n8n-workflow", label: "n8n Workflow", icon: Workflow },
    ]
  }
];

const getItemIsActive = (itemHref: string, currentPath: string): boolean => {
  const currentCleanPathname = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;
  const currentCleanItemHref = itemHref.endsWith('/') && itemHref.length > 1 ? itemHref.slice(0, -1) : itemHref;

  if (currentCleanItemHref === "/home") {
      return currentCleanPathname === currentCleanItemHref;
  }
  return currentCleanPathname === currentCleanItemHref || currentCleanPathname.startsWith(currentCleanItemHref + '/');
};


export function AppSidebar({ setIsPageLoading }: AppSidebarProps) {
  const pathname = usePathname();
  const [isTransitioningTo, setIsTransitioningTo] = useState<string | null>(null);
  const { currentProfile, setCurrentProfile } = useUserProfile();
  const { logNavigation, logComponent } = useFeatureLogger();

  const activeGroupLabel = useMemo(() => {
    if (!pathname) return null;
    const activeGroup = navStructure.find(group => 
        group.type === 'group' && group.items?.some(item => getItemIsActive(item.href, pathname))
    );
    return activeGroup?.label;
  }, [pathname]);

  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>(activeGroupLabel ? [activeGroupLabel] : []);
  
  useEffect(() => {
    if (activeGroupLabel && !openAccordionItems.includes(activeGroupLabel)) {
      setOpenAccordionItems(prev => [...prev, activeGroupLabel]);
    }
  }, [activeGroupLabel, openAccordionItems]);


  const handleLinkClick = (href: string) => {
    if (!pathname) return;
    
    const cleanPathname = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    const cleanHref = href.endsWith('/') && href.length > 1 ? href.slice(0, -1) : href;

    if (cleanPathname !== cleanHref) {
      // Log navigation event
      logNavigation(cleanPathname, cleanHref);
      
      // Log component interaction
      logComponent('AppSidebar', 'navigation', {
        fromPath: cleanPathname,
        toPath: cleanHref,
        userProfile: currentProfile,
      });
      
      setIsTransitioningTo(href); 
      setIsPageLoading(true);     
    } else {
      setIsTransitioningTo(null);
      setIsPageLoading(false); 
    }
  };

  const handleLogout = () => {
    if (pathname) {
      logNavigation(pathname, '/login');
    }
    logComponent('AppSidebar', 'logout', {
      userProfile: currentProfile,
      fromPath: pathname,
    });
    setIsTransitioningTo(null);
    setIsPageLoading(true);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('aiTeleSuiteActiveUserProfile');
    }
    setCurrentProfile(USER_PROFILES[0] ?? "Anchit");
    // Clear the httpOnly session cookie on the server, then load the sign-in
    // page fresh so no cached signed-in page survives.
    void fetch('/api/auth', { method: 'DELETE' })
      .catch(() => undefined)
      .finally(() => window.location.assign('/login'));
  };

  const renderNavItem = (item: SidebarNavLeaf, isSubItem = false) => {
    if (!pathname) return null;
    
    const isActiveForStyling = getItemIsActive(item.href, pathname);
    const showItemSpecificLoading = isTransitioningTo === item.href;

    const commonButtonProps = {
      isActive: isActiveForStyling,
      tooltip: { children: item.label, className: "bg-card text-card-foreground border-border" },
      className: cn(
        "justify-start w-full",
        showItemSpecificLoading ? "opacity-70 cursor-wait" : "",
        "transition-colors duration-150 ease-in-out",
        isSubItem ? "text-xs py-1.5 pl-8 pr-2 hover:bg-sidebar-accent/70" : "",
        isActiveForStyling && isSubItem ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : ""
      ),
    };
    
    const content = (
        <>
            {showItemSpecificLoading ? (
                <LoadingSpinner size={16} className="shrink-0 text-primary" />
            ) : (
                <item.icon className={cn("shrink-0", isSubItem ? "h-3.5 w-3.5" : "h-4 w-4")} />
            )}
            <span>{item.label}</span>
        </>
    );

    return (
      <SidebarMenuItem key={item.href}>
        <Link href={item.href} onClick={() => handleLinkClick(item.href)} className="w-full block">
          {isSubItem ? (
            <div
              className={cn(
                "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[color,background-color] duration-150 ease-in-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50",
                commonButtonProps.className
              )}
              data-active={isActiveForStyling}
            >
              {content}
            </div>
          ) : (
            <SidebarMenuButton {...commonButtonProps}>
              {content}
            </SidebarMenuButton>
          )}
        </Link>
      </SidebarMenuItem>
    );
  };
  
  return (
    <Sidebar variant="sidebar" collapsible="icon" side="left">
      <SidebarHeader className="p-4 items-center">
        <Link href="/home" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center" onClick={() => handleLinkClick("/home")}>
          <Logo className="shrink-0" />
          <span className="font-semibold text-lg text-primary group-data-[collapsible=icon]:hidden">
            AI_TeleSuite
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
            <Accordion 
                type="multiple" 
                value={openAccordionItems} 
                onValueChange={setOpenAccordionItems} 
                className="w-full group-data-[collapsible=icon]:hidden"
            >
            {navStructure.map((navSection, idx) => {
                if (navSection.type === 'separator') {
                    return <SidebarSeparator key={`sep-${idx}`} className="my-1 group-data-[collapsible=icon]:hidden"/>
                }
                if (navSection.type === 'item') {
                    return renderNavItem(navSection);
                }
                if (navSection.type === 'group') {
                    const GroupIcon = navSection.icon;
                    return (
                        <AccordionItem value={navSection.label || ''} key={navSection.label} className="border-b-0">
                            <AccordionTrigger className="py-2 px-2 hover:no-underline hover:bg-sidebar-accent/50 rounded-md text-sm font-medium text-sidebar-foreground/90 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-2 [&>svg]:ml-auto">
                                <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                                    <Folder className="shrink-0 h-4 w-4" />
                                    <span>{navSection.label}</span>
                                </div>
                                <Folder className="shrink-0 h-5 w-5 hidden group-data-[collapsible=icon]:block" />
                            </AccordionTrigger>
                            <AccordionContent className="pt-1 pb-0 pl-1 group-data-[collapsible=icon]:hidden">
                                <SidebarMenu className="ml-2 border-l border-sidebar-border/50 pl-3 py-1">
                                    {navSection.items?.map(item => renderNavItem(item, true))}
                                </SidebarMenu>
                            </AccordionContent>
                        </AccordionItem>
                    );
                }
                return null;
            })}
            </Accordion>
            
            <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
                 {navStructure.map((navSection, idx) => {
                    if(navSection.type === 'separator') return <SidebarSeparator key={`isep-${idx}`} />;
                    if (navSection.type === 'item') {
                        return renderNavItem(navSection);
                    }
                    if (navSection.type === 'group') {
                        return (
                            <React.Fragment key={`${navSection.label}-collapsed-group`}>
                                {navSection.items?.map(item => renderNavItem(item))}
                            </React.Fragment>
                        );
                    }
                    return null;
                })}
            </div>

        </SidebarMenu>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-2 space-y-2">
        <div className="group-data-[collapsible=icon]:hidden px-2 py-1 space-y-1">
          <Label className="text-xs text-sidebar-foreground/80 flex items-center gap-1.5">
              <UserCircle size={14} />
              Profile: {currentProfile}
          </Label>
        </div>
        <div className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center hidden">
          <UserCircle size={20} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2 text-sm"
          onClick={handleLogout}
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
