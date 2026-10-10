
"use client";

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Home, Lightbulb, MessageSquareReply, LayoutDashboard, Database, BookOpen, 
    ListChecks, Mic2, AreaChart, UserCircle, FileSearch, BarChart3, 
    Presentation, ListTree, Voicemail, Ear, Users as UsersIcon, BarChartHorizontalIcon,
    Briefcase, Headset, FileLock2, BarChartBig, Activity, ChevronDown, DownloadCloud, PieChart, ShoppingBag, CodeSquare, Server, Workflow
} from "lucide-react";
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import { useFeatureLogger } from '@/lib/feature-logger';
import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type {
    ActivityLogEntry,
    GeneratePitchOutput,
    ScoreCallOutput,
    TranscriptionOutput,
    GenerateTrainingDeckOutput,
    DataAnalysisReportOutput,
    KnowledgeFile,
    ProductObject,
} from '@/types';
import { useProductContext } from '@/hooks/useProductContext';


interface FeatureWidgetConfig {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  moduleMatcher?: string | string[];
  dataFetcher: (
    activities: ActivityLogEntry[],
    knowledgeBaseFiles: KnowledgeFile[],
    products: ProductObject[]
  ) => {
    stats: Array<{ label: string; value: string | number; icon?: React.ElementType }>;
    lastActivity?: string;
  } | null;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

// Order matches the new sidebar navigation with dashboards after respective features
const featureWidgetsConfig: FeatureWidgetConfig[] = [
  {
    href: "/products",
    icon: ShoppingBag,
    title: "Products",
    description: "Manage your product catalog.",
    moduleMatcher: "Products",
    dataFetcher: (activities, kbFiles, products) => {
      return {
        stats: [{ label: "Products Defined", value: products.length, icon: ShoppingBag }],
        lastActivity: `Currently managing ${products.length} products.`
      };
    }
  },
  {
    href: "/knowledge-base",
    icon: Database,
    title: "Knowledge Base",
    description: "Manage sales enablement documents.",
    moduleMatcher: "Knowledge Base Management",
    dataFetcher: (activities, kbFiles) => {
      const count = kbFiles.length;
      const lastKbActivity = activities.filter(a => a.module === "Knowledge Base Management")[0];
      let lastAction = "No recent KB activity";
      const kbDetails = asRecord(lastKbActivity?.details);
      if (kbDetails) {
          const action = getString(kbDetails.action);
          if (action === 'add' || action === 'add_batch') {
            const fileDataName =
              getString(asRecord(kbDetails.fileData)?.name) ||
              (Array.isArray(kbDetails.filesData) && kbDetails.filesData.length > 0
                ? getString(asRecord(kbDetails.filesData[0])?.name)
                : undefined);
            lastAction = `Added: ${getString(kbDetails.name) || fileDataName || 'entry'}`;
          } else if (action === 'delete') {
            lastAction = 'Deleted an entry';
          } else if (action === 'clear_all') {
            const clearedCount = getNumber(kbDetails.countCleared);
            lastAction = `Cleared ${clearedCount ?? 'multiple'} entries`;
          } else if (action === 'download_full_prompts') {
            lastAction = 'Downloaded AI Prompts';
          }

          if (lastAction.length > 30) lastAction = lastAction.substring(0,27) + "...";

      } else if (count > 0 && kbFiles[0]) {
         lastAction = `Last entry: ${kbFiles.sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())[0].name.substring(0,20)}...`;
      }
      return {
        stats: [{ label: "Total Entries", value: count, icon: Database }],
        lastActivity: lastAction
      };
    }
  },
  {
    href: "/pitch-generator",
    icon: Lightbulb,
    title: "AI Pitch Generator",
    description: "Craft tailored sales pitches.",
    moduleMatcher: "Pitch Generator",
    dataFetcher: (activities) => {
      const pitchActivities = activities.filter(a =>
        a.module === "Pitch Generator" &&
        a.details && typeof a.details === 'object' && 'pitchOutput' in a.details
      );
      const count = pitchActivities.length;
      const lastPitch = pitchActivities[0]?.details as { pitchOutput?: GeneratePitchOutput };
      return {
        stats: [{ label: "Pitches Generated", value: count, icon: Lightbulb }],
        lastActivity: lastPitch?.pitchOutput?.pitchTitle ? `Last: ${lastPitch.pitchOutput.pitchTitle.substring(0, 25)}...` : (count > 0 ? "Recent activity" : "No pitches generated yet")
      };
    }
  },
  {
    href: "/rebuttal-generator",
    icon: MessageSquareReply,
    title: "AI Rebuttal Assistant",
    description: "Get intelligent suggestions for objections.",
    moduleMatcher: "Rebuttal Generator",
    dataFetcher: (activities) => {
      const rebuttalActivities = activities.filter(a => a.module === "Rebuttal Generator");
      const count = rebuttalActivities.length;
      const lastRebuttalInput = rebuttalActivities[0]?.details as { inputData?: { objection?: string } };
      return {
        stats: [{ label: "Rebuttals Generated", value: count, icon: MessageSquareReply }],
        lastActivity: lastRebuttalInput?.inputData?.objection ? `Last for: "${lastRebuttalInput.inputData.objection.substring(0, 20)}..."` : (count > 0 ? "Recent activity" : "No rebuttals generated")
      };
    }
  },
  {
    href: "/transcription",
    icon: Mic2,
    title: "Audio Transcription",
    description: "Transcribe audio files with diarization.",
    moduleMatcher: "Transcription",
    dataFetcher: (activities) => {
      const transcriptionActivities = activities.filter(a => a.module === "Transcription" && a.details && typeof a.details === 'object' && 'transcriptionOutput' in a.details && 'fileName' in a.details);
      const count = transcriptionActivities.length;
      const lastTranscription = transcriptionActivities[0]?.details as { fileName?: string, transcriptionOutput?: TranscriptionOutput };
      return {
        stats: [{ label: "Files Transcribed", value: count, icon: Mic2 }],
        lastActivity: lastTranscription?.fileName ? `Last: ${lastTranscription.fileName}` : (count > 0 ? "Recent activity" : "No transcriptions yet")
      };
    }
  },
  {
    href: "/transcription-dashboard",
    icon: ListTree,
    title: "Transcript Dashboard",
    description: "Review historical transcriptions.",
    moduleMatcher: "Transcription", // Matches parent module for activity count
    dataFetcher: (activities) => {
      const count = activities.filter(a => a.module === "Transcription").length;
      return {
        stats: [{ label: "Total Transcripts", value: count, icon: ListTree }],
        lastActivity: count > 0 ? `View all ${count} transcripts` : "No transcripts in history."
      };
    }
  },
  {
    href: "/call-scoring",
    icon: ListChecks,
    title: "AI Call Scoring",
    description: "Analyze call recordings for metrics.",
    moduleMatcher: "Call Scoring",
    dataFetcher: (activities) => {
      const scoringActivities = activities.filter(a => (a.module === "Call Scoring" || a.module.includes("Voice")) && a.details && typeof a.details === 'object' && ('scoreOutput' in a.details || 'finalScore' in a.details));
      const count = scoringActivities.length;
      const lastScored = scoringActivities[0]?.details as { fileName?: string, scoreOutput?: ScoreCallOutput, finalScore?: ScoreCallOutput };
      const lastScoredFileName = lastScored?.fileName || (lastScored?.finalScore ? 'Voice Agent Call' : undefined);
      
      const recentScores = scoringActivities.slice(0, 5).map(a => {
        const detailsRecord = asRecord(a.details);
        if (!detailsRecord) {
          return 0;
        }
        const directScore = getNumber(asRecord(detailsRecord.scoreOutput)?.overallScore);
        if (typeof directScore === 'number') {
          return directScore;
        }
        const finalScore = getNumber(asRecord(detailsRecord.finalScore)?.overallScore);
        return finalScore ?? 0;
      }).filter(s => s > 0);
      
      const avgScore = recentScores.length > 0 ? (recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length).toFixed(1) : "N/A";
      return {
        stats: [
          { label: "Calls Scored", value: count, icon: ListChecks },
          { label: "Avg. Score (Last 5)", value: avgScore, icon: Activity }
        ],
        lastActivity: lastScoredFileName ? `Last: ${lastScoredFileName}` : (count > 0 ? "Recent activity" : "No calls scored yet")
      };
    }
  },
  {
    href: "/call-scoring-dashboard",
    icon: AreaChart,
    title: "Call Scoring Dashboard",
    description: "Review historical call scoring reports.",
    moduleMatcher: ["Call Scoring", "AI Voice Sales Agent", "Browser Voice Agent"],
    dataFetcher: (activities) => {
      const count = activities.filter(a => {
        const isStandardScore = a.module === "Call Scoring" && a.details?.scoreOutput;
        const isVoiceScore = (a.module === "AI Voice Sales Agent" || a.module === "Browser Voice Agent") && a.details?.finalScore;
        return isStandardScore || isVoiceScore;
      }).length;
      return {
        stats: [{ label: "Total Scored Reports", value: count, icon: AreaChart }],
        lastActivity: count > 0 ? `View all ${count} reports` : "No scoring reports in history."
      };
    }
  },
   {
    href: "/combined-call-analysis",
    icon: PieChart,
    title: "Combined Call Analysis",
    description: "Aggregate multiple call scores for trends.",
    moduleMatcher: "Combined Call Analysis",
    dataFetcher: (activities) => {
      const count = activities.filter(a => a.module === "Combined Call Analysis").length;
      return {
        stats: [{ label: "Combined Reports", value: count, icon: PieChart }],
        lastActivity: count > 0 ? "Recent combined analysis run." : "No combined analyses yet."
      };
    }
  },
  {
    href: "/combined-call-analysis-dashboard",
    icon: BarChartBig,
    title: "Combined Analysis DB",
    description: "Review past combined analyses.",
    moduleMatcher: "Combined Call Analysis",
    dataFetcher: (activities) => {
        const count = activities.filter(a => a.module === "Combined Call Analysis").length;
        return {
            stats: [{label: "Total Reports", value: count, icon: BarChartBig}],
            lastActivity: count > 0 ? `View all ${count} reports` : "No combined analyses yet."
        }
    }
  },
  {
    href: "/voice-sales-agent",
    icon: Voicemail,
    title: "AI Voice Sales Agent",
    description: "Engage users with AI-driven voice sales.",
    moduleMatcher: ["Voice Sales Agent", "AI Voice Sales Agent", "Browser Voice Agent"],
    dataFetcher: (activities) => {
      const agentActivities = activities.filter(a => a.module === "AI Voice Sales Agent" || a.module === "Browser Voice Agent");
      const count = agentActivities.length;
      return {
        stats: [{ label: "Sales Calls Initiated", value: count, icon: Voicemail }],
        lastActivity: count > 0 ? "Recent sales call activity" : "No voice sales calls yet"
      };
    }
  },
   {
    href: "/voice-sales-dashboard",
    icon: LayoutDashboard,
    title: "Voice Sales Dashboard",
    description: "Review sales call logs & recordings.",
    moduleMatcher: "AI Voice Sales Agent",
     dataFetcher: (activities) => {
        const count = activities.filter(a => a.module === "AI Voice Sales Agent" || a.module === "Browser Voice Agent").length;
        return {
            stats: [{label: "Total Sales Calls", value: count, icon: LayoutDashboard}],
            lastActivity: count > 0 ? `View all ${count} sales calls` : "No sales calls logged."
        }
    }
  },
  {
    href: "/voice-support-agent",
    icon: Ear,
    title: "AI Voice Support Agent",
    description: "Provide voice-based customer support.",
    moduleMatcher: "AI Voice Support Agent",
    dataFetcher: (activities) => {
      const supportActivities = activities.filter(a => a.module === "AI Voice Support Agent");
      const count = supportActivities.length;
      return {
        stats: [{ label: "Support Interactions", value: count, icon: Ear }],
        lastActivity: count > 0 ? "Recent support activity" : "No voice support interactions"
      };
    }
  },
   {
    href: "/voice-support-dashboard",
    icon: LayoutDashboard,
    title: "Voice Support Dashboard",
    description: "Review support call logs.",
    moduleMatcher: "AI Voice Support Agent",
     dataFetcher: (activities) => {
        const count = activities.filter(a => a.module === "AI Voice Support Agent").length;
        return {
            stats: [{label: "Total Support Calls", value: count, icon: LayoutDashboard}],
            lastActivity: count > 0 ? `View all ${count} support calls` : "No support calls logged."
        }
    }
  },
  {
    href: "/create-training-deck",
    icon: BookOpen,
    title: "Training Material Creator",
    description: "Generate training decks or brochures.",
    moduleMatcher: "Create Training Material",
    dataFetcher: (activities) => {
      const materialActivities = activities.filter(a => a.module === "Create Training Material" && a.details && typeof a.details === 'object' && 'materialOutput' in a.details);
      const count = materialActivities.length;
      const lastMaterial = materialActivities[0]?.details as { materialOutput?: GenerateTrainingDeckOutput };
      return {
        stats: [{ label: "Materials Created", value: count, icon: Presentation }],
        lastActivity: lastMaterial?.materialOutput?.deckTitle ? `Last: ${lastMaterial.materialOutput.deckTitle.substring(0, 20)}...` : (count > 0 ? "Recent activity" : "No materials created")
      };
    }
  },
  {
    href: "/training-material-dashboard",
    icon: Presentation,
    title: "Material Dashboard",
    description: "View generated training materials.",
    moduleMatcher: "Create Training Material", // Matches parent module for activity count
    dataFetcher: (activities) => {
      const count = activities.filter(a => a.module === "Create Training Material").length;
      return {
        stats: [{ label: "Total Materials Logged", value: count, icon: Presentation }],
        lastActivity: count > 0 ? `View all ${count} materials` : "No materials in history."
      };
    }
  },
   {
    href: "/data-analysis",
    icon: FileSearch,
    title: "AI Data Analyst",
    description: "Analyze telecalling data for insights.",
    moduleMatcher: "Data Analysis",
    dataFetcher: (activities) => {
      const analysisActivities = activities.filter(a => a.module === "Data Analysis" && a.details && typeof a.details === 'object' && 'analysisOutput' in a.details);
      const count = analysisActivities.length;
      const lastAnalysis = analysisActivities[0]?.details as { analysisOutput?: DataAnalysisReportOutput, inputData?: { userAnalysisPrompt?: string } };
      return {
        stats: [{ label: "Analyses Generated", value: count, icon: BarChart3 }],
        lastActivity: lastAnalysis?.analysisOutput?.reportTitle ? `Last: ${lastAnalysis.analysisOutput.reportTitle.substring(0,20)}...` : (count > 0 ? "Recent activity" : "No analyses performed")
      };
    }
  },
  {
    href: "/data-analysis-dashboard",
    icon: BarChart3,
    title: "Analysis Dashboard",
    description: "View historical data analysis reports.",
    moduleMatcher: "Data Analysis", // Matches parent module for activity count
    dataFetcher: (activities) => {
      const count = activities.filter(a => a.module === "Data Analysis").length;
      return {
        stats: [{ label: "Total Reports Logged", value: count, icon: BarChart3 }],
        lastActivity: count > 0 ? `View all ${count} reports` : "No analysis reports in history."
      };
    }
  },
  {
    href: "/batch-audio-downloader",
    icon: DownloadCloud,
    title: "Batch Audio Downloader",
    description: "Download multiple audio files as a ZIP.",
    moduleMatcher: "Batch Audio Downloader",
    dataFetcher: (activities) => {
      const downloadActivities = activities.filter(a => a.module === "Batch Audio Downloader");
      const successfulDownloads = downloadActivities.filter(a => a.details?.action === "download_success");
      const count = successfulDownloads.length;
      return {
        stats: [{ label: "Successful Batches", value: count, icon: DownloadCloud }],
        lastActivity: count > 0 ? "Recent batch download activity" : "No batches downloaded yet."
      };
    }
  },
  {
    href: "/activity-dashboard",
    icon: Activity,
    title: "Global Activity Log",
    description: "Monitor all user activities.",
    dataFetcher: (activities) => ({
      stats: [{ label: "Total Logged Activities", value: activities.length, icon: Activity }],
      lastActivity: activities.length > 0 ? `Last activity: ${formatDistanceToNow(parseISO(activities[0].timestamp), { addSuffix: true })}` : "No activities logged."
    })
  },
   {
    href: "/clone-app",
    icon: Server,
    title: "Clone Full App",
    description: "Download source code & replication prompt.",
    dataFetcher: () => null,
  },
  {
    href: "/n8n-workflow",
    icon: Workflow,
    title: "n8n Workflow",
    description: "Download a workflow file for n8n.",
    dataFetcher: () => null,
  },
];


export default function HomePage() {
  const { activities } = useActivityLogger();
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const { availableProducts } = useProductContext();
  const { logFeature } = useFeatureLogger();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Log page view
    logFeature({
      featureName: 'HomePage',
      moduleType: 'page',
      action: 'view',
      details: {
        totalActivities: activities.length,
        kbFiles: knowledgeBaseFiles.length,
        availableProducts: availableProducts.length,
      }
    });
  }, [activities.length, knowledgeBaseFiles.length, availableProducts.length, logFeature]);

  // Data for the main "Home" overview at the top
  const homeOverviewData = useMemo(() => {
    if (!isClient) return null;
    
    const overviewData = {
        stats: [
            { label: "KB Entries", value: knowledgeBaseFiles.length, icon: Database },
            { label: "Modules Used", value: new Set(activities.map(a => a.module)).size, icon: Briefcase }
        ],
        lastActivity: activities.length > 0 ? `Last system activity: ${formatDistanceToNow(parseISO(activities[0].timestamp), { addSuffix: true })}` : "No activities logged."
    };

    // Log overview data computation
    logFeature({
      featureName: 'HomeOverview',
      moduleType: 'component',
      action: 'view',
      details: {
        kbEntries: knowledgeBaseFiles.length,
        modulesUsed: new Set(activities.map(a => a.module)).size,
        totalActivities: activities.length,
        hasRecentActivity: activities.length > 0,
      }
    });

    return overviewData;
  }, [isClient, activities, knowledgeBaseFiles, logFeature]);


  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI_TeleSuite Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="container mx-auto">
          <Card className="mb-8 shadow-lg border-primary/20 bg-transparent bg-linear-to-br/srgb from-background to-primary/10">
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-primary flex items-center">
                <Home className="h-8 w-8 mr-3 text-accent" />
                Welcome to AI_TeleSuite!
              </CardTitle>
              <CardDescription className="text-lg text-muted-foreground">
                Your intelligent partner for boosting telesales productivity and effectiveness. Explore your tools and insights below.
              </CardDescription>
            </CardHeader>
            {isClient && homeOverviewData ? (
                 <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 pb-6">
                    {homeOverviewData.stats.map((stat, index) => {
                        const StatIcon = stat.icon;
                        return (
                            <div 
                              key={index} 
                              className="flex items-center p-3 bg-background/50 rounded-lg shadow-xs border border-border/50 cursor-pointer hover:bg-background/70 transition-colors"
                              onClick={() => {
                                logFeature({
                                  featureName: 'OverviewStat',
                                  moduleType: 'component',
                                  action: 'interaction',
                                  details: {
                                    statLabel: stat.label,
                                    statValue: stat.value,
                                    statIndex: index,
                                  }
                                });
                              }}
                            >
                                <StatIcon className="mr-3 h-6 w-6 text-primary" />
                                <div>
                                    <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                                </div>
                            </div>
                        );
                    })}
                    <div 
                      className="flex items-center p-3 bg-background/50 rounded-lg shadow-xs border border-border/50 col-span-1 sm:col-span-2 lg:col-span-1 lg:col-start-3 cursor-pointer hover:bg-background/70 transition-colors"
                      onClick={() => {
                        logFeature({
                          featureName: 'SystemStatus',
                          moduleType: 'component',
                          action: 'interaction',
                          details: {
                            lastActivity: homeOverviewData.lastActivity,
                            hasActivity: activities.length > 0,
                          }
                        });
                      }}
                    >
                        <Activity className="mr-3 h-6 w-6 text-primary" />
                         <div>
                            <p className="text-sm font-medium text-foreground truncate" title={homeOverviewData.lastActivity}>{homeOverviewData.lastActivity}</p>
                            <p className="text-xs text-muted-foreground">System Status</p>
                        </div>
                    </div>
                </CardContent>
            ) : (
                <CardContent className="pt-2 pb-6">
                    <Skeleton className="h-10 w-3/4" />
                    <Skeleton className="h-8 w-1/2 mt-2" />
                </CardContent>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureWidgetsConfig.map((feature) => {
              const summaryData = isClient ? feature.dataFetcher(activities, knowledgeBaseFiles, availableProducts) : null;
              const FeatureIcon = feature.icon;

              const handleFeatureClick = () => {
                // Log feature usage
                logFeature({
                  featureName: feature.title,
                  moduleType: 'component',
                  action: 'interaction',
                  details: {
                    href: feature.href,
                    description: feature.description,
                    hasData: !!summaryData,
                    stats: summaryData?.stats || [],
                  }
                });

                // Log widget interaction
                logFeature({
                  featureName: 'FeatureWidget',
                  moduleType: 'component',
                  action: 'navigation',
                  details: {
                    featureName: feature.title,
                    targetHref: feature.href,
                    widgetStats: summaryData?.stats || [],
                    lastActivity: summaryData?.lastActivity || 'None',
                  }
                });
              };

              return (
                <Link 
                  key={feature.href} 
                  href={feature.href} 
                  className="hover:no-underline flex group"
                  onClick={handleFeatureClick}
                >
                  <Card className="hover:shadow-xl transition-all duration-300 w-full flex flex-col hover:border-primary/50 transform hover:-translate-y-1 bg-card hover:bg-secondary/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center text-lg font-semibold text-primary group-hover:text-accent transition-colors">
                          <FeatureIcon className="mr-3 h-5 w-5 shrink-0 text-primary group-hover:text-accent transition-colors" />
                          {feature.title}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs text-muted-foreground pt-1 h-10 line-clamp-2">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grow pt-2 space-y-2">
                      {!isClient ? (
                        <>
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </>
                      ) : summaryData ? (
                        <>
                          {summaryData.stats.map((stat, index) => {
                            const StatIcon = stat.icon;
                            return (
                              <div key={index} className="flex items-center text-sm text-foreground">
                                {StatIcon && <StatIcon className="mr-2 h-4 w-4 text-muted-foreground"/>}
                                <span className="font-medium">{stat.value}</span>
                                <span className="text-muted-foreground ml-1.5 text-xs">{stat.label}</span>
                              </div>
                            );
                          })}
                          {summaryData.lastActivity && (
                            <div className="flex items-center text-xs text-muted-foreground pt-1 border-t border-border/50 mt-2">
                              <Activity className="mr-1.5 h-3.5 w-3.5"/>
                              <span className="truncate" title={summaryData.lastActivity}>{summaryData.lastActivity}</span>
                            </div>
                          )}
                        </>
                      ) : (
                         <p className="text-xs text-muted-foreground italic">No data available for this widget.</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
           <div className="mt-12 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} AI_TeleSuite. Empowering Sales Teams.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
