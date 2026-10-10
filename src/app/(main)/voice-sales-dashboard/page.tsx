
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useActivityLogger, MAX_ACTIVITIES_TO_STORE } from '@/hooks/use-activity-logger';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from '@/components/ui/skeleton';
import { CallScoringResultsCard } from '@/components/features/call-scoring/call-scoring-results-card';
import { exportToCsv, exportTableDataToPdf, exportTableDataForDoc, exportPlainTextFile, downloadDataUriFile } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { Eye, List, FileSpreadsheet, FileText, AlertCircleIcon, Info, Copy, Download, FileAudio, RadioTower, CheckCircle, Star, Loader2, PlayCircle, PauseCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityLogEntry, VoiceSalesAgentActivityDetails, ScoreCallOutput, Product, ConversationTurn, KnowledgeFile, ProductObject, CustomerCohort } from '@/types';
import { useProductContext } from '@/hooks/useProductContext';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { normalizeTranscript } from '@/lib/transcript/normalize';

interface HistoricalSalesCallItem extends Omit<ActivityLogEntry, 'details'> {
  details: VoiceSalesAgentActivityDetails;
}

const VOICE_SALES_MODULE = 'AI Voice Sales Agent';
const BACKFILL_COHORT: CustomerCohort = 'Universal';
const CALL_SCORING_MODULE = 'Call Scoring';

const prepareKnowledgeBaseContext = (
  knowledgeBaseFiles: KnowledgeFile[],
  productObject: ProductObject,
  customerCohort?: string,
): string => {
  if (!knowledgeBaseFiles || !Array.isArray(knowledgeBaseFiles)) {
    return "Knowledge Base not yet loaded or is empty.";
  }
  const productSpecificFiles = knowledgeBaseFiles.filter(f => f.product === productObject.name);
  if (productSpecificFiles.length === 0) return "No specific knowledge base content found for this product.";
  
  const MAX_CONTEXT_LENGTH = 30000;
  let combinedContext = `Knowledge Base Context for Product: ${productObject.displayName}\n---\n`;
  for (const file of productSpecificFiles) {
    let contentToInclude = `(File: ${file.name}, Type: ${file.type}. Content not directly viewed for non-text or large files; AI should use name/type as context.)`;
    if (file.isTextEntry && file.textContent) {
        contentToInclude = file.textContent;
    }
    const itemContent = `Item: ${file.name}\nType: ${file.isTextEntry ? 'Text Entry' : 'File'}\nContent Summary/Reference:\n${contentToInclude}\n---\n`;
    if (combinedContext.length + itemContent.length > MAX_CONTEXT_LENGTH) {
        combinedContext += "... (Knowledge Base truncated due to length limit for AI context)\n";
        break;
    }
    combinedContext += itemContent;
  }
  return combinedContext.substring(0, MAX_CONTEXT_LENGTH);
};

export default function VoiceSalesDashboardPage() {
  const { activities, updateActivity, logBatchActivities } = useActivityLogger();
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [selectedCall, setSelectedCall] = useState<HistoricalSalesCallItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { availableProducts, getProductByName } = useProductContext();
  const [productFilter, setProductFilter] = useState<string>("All");
  const [scoringInProgress, setScoringInProgress] = useState<string | null>(null);
  
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const handlePlayAudio = useCallback((item: HistoricalSalesCallItem) => {
    if (currentlyPlayingId === item.id) {
        audioPlayerRef.current?.pause();
        setCurrentlyPlayingId(null);
    } else if (item.details.fullCallAudioDataUri && audioPlayerRef.current) {
        audioPlayerRef.current.src = item.details.fullCallAudioDataUri;
        audioPlayerRef.current.play().catch(e => toast({ variant: 'destructive', title: 'Playback Error', description: (e as Error).message }));
        setCurrentlyPlayingId(item.id);
    } else {
        toast({ variant: 'destructive', title: 'Playback Error', description: 'Audio data is not available for this call.'});
    }
  }, [currentlyPlayingId, toast]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    const onEnded = () => setCurrentlyPlayingId(null);
    player?.addEventListener('ended', onEnded);
    player?.addEventListener('pause', onEnded);
    return () => {
      player?.removeEventListener('ended', onEnded);
      player?.removeEventListener('pause', onEnded);
    };
  }, []);


  useEffect(() => {
    setIsClient(true);
  }, []);

  const convertVoiceActivity = useCallback((activity: ActivityLogEntry): HistoricalSalesCallItem | null => {
    if (!activity.details || typeof activity.details !== 'object') return null;
    if (!('input' in activity.details)) return null;
    return activity as HistoricalSalesCallItem;
  }, []);

  const convertCallScoringToVoiceActivity = useCallback((activity: ActivityLogEntry): HistoricalSalesCallItem | null => {
    if (!activity.details || typeof activity.details !== 'object') return null;
    const details = activity.details as {
      scoreOutput?: ScoreCallOutput;
      agentNameFromForm?: string;
      status?: string;
      fileName?: string;
    };
    if (!details.scoreOutput) return null;

    const voiceDetails: VoiceSalesAgentActivityDetails = {
      input: {
        product: (activity.product as Product) || 'General',
        customerCohort: BACKFILL_COHORT,
        agentName: details.agentNameFromForm,
        userName: 'Customer',
      },
      finalScore: details.scoreOutput,
      fullTranscriptText: details.scoreOutput.transcript,
      status: details.status ?? 'Complete',
      origin: 'call-scoring-backfill',
      lastCallFeedbackContext: details.fileName
        ? `Imported from call scoring report "${details.fileName}"`
        : 'Imported from call scoring report',
      backfilledFromActivityId: activity.id,
    };

    return {
      ...activity,
      module: VOICE_SALES_MODULE,
      details: voiceDetails,
    } as HistoricalSalesCallItem;
  }, []);

  useEffect(() => {
    if (!activities || activities.length === 0) return;

    const existingBackfills = new Set(
      activities
        .filter(
          (activity) =>
            (activity.module === VOICE_SALES_MODULE || activity.module === 'Browser Voice Agent') &&
            activity.details &&
            typeof activity.details === 'object' &&
            (activity.details as VoiceSalesAgentActivityDetails).backfilledFromActivityId
        )
        .map((activity) => (activity.details as VoiceSalesAgentActivityDetails).backfilledFromActivityId!)
        .filter(Boolean)
    );

    const payloads = activities
      .filter((activity) => activity.module === CALL_SCORING_MODULE && !existingBackfills.has(activity.id))
      .map((activity) => {
        const converted = convertCallScoringToVoiceActivity(activity);
        if (!converted) return null;
        return {
          module: VOICE_SALES_MODULE,
          product: converted.product,
          details: converted.details,
        };
      })
      .filter((item): item is Omit<ActivityLogEntry, 'id' | 'timestamp' | 'agentName'> => Boolean(item));

    if (payloads.length > 0) {
      logBatchActivities(payloads);
    }
  }, [activities, convertCallScoringToVoiceActivity, logBatchActivities]);

  const salesCallHistory: HistoricalSalesCallItem[] = useMemo(() => {
    if (!isClient) return [];

    const voiceAgentEntries = (activities || [])
      .filter(activity => activity.module === VOICE_SALES_MODULE || activity.module === 'Browser Voice Agent')
      .map(convertVoiceActivity)
      .filter((item): item is HistoricalSalesCallItem => Boolean(item));

    const alreadyBackfilledIds = new Set(
      voiceAgentEntries
        .map((item) => item.details.backfilledFromActivityId)
        .filter((id): id is string => Boolean(id))
    );

    const callScoringBackfill = (activities || [])
      .filter(activity => activity.module === CALL_SCORING_MODULE)
      .filter(activity => !alreadyBackfilledIds.has(activity.id))
      .map(convertCallScoringToVoiceActivity)
      .filter((item): item is HistoricalSalesCallItem => Boolean(item));

    return [...voiceAgentEntries, ...callScoringBackfill].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [activities, convertCallScoringToVoiceActivity, convertVoiceActivity, isClient]);

  const filteredHistory = useMemo(() => {
    if (productFilter === 'All') {
      return salesCallHistory;
    }
    return salesCallHistory.filter(item => item.product === productFilter);
  }, [salesCallHistory, productFilter]);
  
  const handleViewDetails = (item: HistoricalSalesCallItem) => {
    setSelectedCall(item);
    setIsDialogOpen(true);
  };

  const handleCopyToClipboard = (text: string, type: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: "Success", description: `${type} copied to clipboard!` }))
      .catch(() => toast({ variant: "destructive", title: "Error", description: `Failed to copy ${type.toLowerCase()}.` }));
  };

  const handleDownloadFile = (content: string, fileNameBase: string, type: "transcript" | "summary") => {
    if (!content) return;
    try {
      const fileExtension = type === "transcript" ? "_interaction_log.txt" : "_summary.txt";
      const fullFileName = `${fileNameBase.replace(/[^a-zA-Z0-9]/g, '_')}${fileExtension}`;
      exportPlainTextFile(fullFileName, content);
      toast({ title: "Download Successful", description: `${type} file '${fullFileName}' downloaded.` });
    } catch (error) {
       toast({ variant: "destructive", title: "Download Error", description: `Failed to download ${type} file.` });
    }
  };

  const handleScoreCall = useCallback(async (item: HistoricalSalesCallItem) => {
    if (!item.details.fullTranscriptText || !item.product) {
        toast({ variant: 'destructive', title: 'Scoring Error', description: 'Transcript or product context is missing.'});
        return;
    }
    setScoringInProgress(item.id);
    try {
        const productData = getProductByName(item.product);
        if(!productData) throw new Error("Product details not found for scoring.");
        const productContext = prepareKnowledgeBaseContext(knowledgeBaseFiles, productData, item.details.input.customerCohort);
        
        const response = await fetch('/api/call-scoring', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcriptOverride: item.details.fullTranscriptText,
            product: item.product,
            agentName: item.details.input.agentName,
            productContext: productContext,
          }),
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        const scoreOutput = await response.json();
        
        const updatedDetails: Partial<VoiceSalesAgentActivityDetails> = {
            finalScore: scoreOutput
        };
        updateActivity(item.id, { ...item.details, ...updatedDetails });
        
        setSelectedCall(prev => prev ? { ...prev, details: { ...prev.details, finalScore: scoreOutput } } : null);

        toast({ title: 'Scoring Complete', description: `Call with ${item.details.input.userName} has been scored.` });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({ variant: 'destructive', title: 'AI Scoring Failed', description: errorMessage });
    } finally {
        setScoringInProgress(null);
    }
  }, [updateActivity, toast, getProductByName, knowledgeBaseFiles]);


  const handleExportTable = (formatType: 'csv' | 'pdf' | 'doc') => {
    if (filteredHistory.length === 0) {
      toast({ title: "No Data", description: `No voice sales call history for '${productFilter}' to export.` });
      return;
    }
    try {
      const headers = ["Timestamp", "App Agent", "AI Agent Name", "Customer Name", "Product", "Cohort", "Overall Score", "Call Category", "Recording", "Error"];
      const dataForExportObjects = filteredHistory.map(item => {
        const scoreOutput = item.details.finalScore;
        return {
          Timestamp: format(parseISO(item.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          AppAgent: item.agentName || 'N/A',
          AIAgentName: item.details.input.agentName || 'N/A',
          CustomerName: item.details.input.userName || 'N/A',
          Product: item.product || 'N/A',
          Cohort: item.details.input.customerCohort || 'N/A',
          OverallScore: scoreOutput?.overallScore !== undefined ? scoreOutput.overallScore.toFixed(1) : 'N/A',
          CallCategory: scoreOutput ? scoreOutput.callCategorisation : 'N/A',
          Recording: item.details.fullCallAudioDataUri ? 'Available' : 'N/A',
          Error: item.details.error || '',
        };
      });

      const dataRowsForPdfOrDoc = dataForExportObjects.map(row => Object.values(row));
      const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
      const baseFilename = `voice_sales_history_${productFilter}_${timestamp}`;

      if (formatType === 'csv') exportToCsv(`${baseFilename}.csv`, dataForExportObjects);
      else if (formatType === 'pdf') exportTableDataToPdf(`${baseFilename}.pdf`, headers, dataRowsForPdfOrDoc);
      else if (formatType === 'doc') exportTableDataForDoc(`${baseFilename}.doc`, headers, dataRowsForPdfOrDoc);
      
      toast({ title: "Export Successful", description: `Voice sales call history exported as ${formatType.toUpperCase()}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failed", description: `Could not export history. Error: ${error instanceof Error ? error.message : String(error)}`});
    }
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Voice Sales Agent Dashboard" />
      <audio ref={audioPlayerRef} className="hidden" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-700">
            <Info className="h-4 w-4" />
            <AlertTitle className="text-blue-800">Dashboard Overview</AlertTitle>
            <AlertDescription className="text-xs">
              This dashboard displays logs of simulated sales calls initiated via the "AI Voice Sales Agent" module. 
              Each entry includes the conversation transcript and allows for playing back the full call audio recording or scoring the call post-interaction.
            </AlertDescription>
        </Alert>

        <div className="flex justify-between items-center">
            <div className='flex items-center gap-2'>
                <Label htmlFor="product-filter" className="text-sm">Product:</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                    <SelectTrigger id="product-filter" className="w-[180px]">
                        <SelectValue placeholder="Filter by product" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Products</SelectItem>
                        {availableProducts.map(p => <SelectItem key={p.name} value={p.name}>{p.displayName}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><List className="mr-2 h-4 w-4" /> Export Options</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportTable('csv')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Export Table as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportTable('pdf')}><FileText className="mr-2 h-4 w-4" /> Export Table as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportTable('doc')}><FileText className="mr-2 h-4 w-4" /> Export Table as Text for Word</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isClient ? (
          <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="flex items-center"><RadioTower className="mr-2 h-5 w-5 text-primary"/>Simulated Sales Call Logs</CardTitle>
                <CardDescription>History of AI-driven voice call simulations. Click "View" for details.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-460px)] md:h-[calc(100vh-400px)]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Score</TableHead>
                            <TableHead className="text-center">Disposition</TableHead>
                            <TableHead className="text-center">Recording</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredHistory.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No voice agent simulations logged for '{productFilter}' yet.</TableCell></TableRow>
                        ) : (
                            filteredHistory.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="text-xs font-mono">{format(parseISO(item.timestamp), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                                <TableCell className="text-xs max-w-[150px] truncate" title={item.details.input.userName || "Unknown User"}>
                                  {item.details.input.userName || "Unknown User"}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <span>{item.product || 'N/A'}</span>
                                  {item.details.origin === 'call-scoring-backfill' && (
                                    <Badge variant="outline" className="ml-2 text-[10px]">
                                      Call Scoring
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-xs">
          {item.details.finalScore && item.details.finalScore.overallScore !== undefined ? (
            <span className="font-semibold">{item.details.finalScore.overallScore.toFixed(1)}/5</span>
                                  ) : item.details.error ? (
                                    'N/A'
                                  ) : (
                                    <Button size="xs" variant="secondary" onClick={() => handleScoreCall(item)} disabled={scoringInProgress === item.id}>
                                      {scoringInProgress === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Star className="mr-1 h-3 w-3" />}
                                      Score Call
                                    </Button>
                                  )}
                                </TableCell>
                                <TableCell className="text-center text-xs">
                                  {item.details.finalScore?.suggestedDisposition ? (
                                    <span className="font-medium">{item.details.finalScore.suggestedDisposition}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                    {item.details.fullCallAudioDataUri ? (
                                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                            <CheckCircle className="mr-1 h-3 w-3" /> Available
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-xs">N/A</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                {item.details.error ? <Badge variant="destructive" className="text-xs">Error</Badge> : <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Completed</Badge>}
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                    {item.details.fullCallAudioDataUri && (
                                        <Button variant="ghost" size="icon" onClick={() => handlePlayAudio(item)} className='h-8 w-8' title={currentlyPlayingId === item.id ? "Pause" : "Play"}>
                                            {currentlyPlayingId === item.id ? <PauseCircle className="h-4 w-4"/> : <PlayCircle className="h-4 w-4"/>}
                                        </Button>
                                    )}
                                    <Button variant="outline" size="xs" onClick={() => handleViewDetails(item)}><Eye className="mr-1.5 h-3.5 w-3.5" /> View Report</Button>
                                </TableCell>
                            </TableRow>
                            ))
                        )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" /> <Skeleton className="h-20 w-full" /> <Skeleton className="h-20 w-full" /> <Skeleton className="h-20 w-full" />
          </div>
        )}
         <div className="text-xs text-muted-foreground p-4 border-t">
          Activity log is limited to the most recent {MAX_ACTIVITIES_TO_STORE} entries. Detailed scoring and transcripts are available in the "View" dialog.
        </div>

        {selectedCall && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-4 pb-3 border-b sticky top-0 bg-background z-10">
                <DialogTitle className="text-lg text-primary">Voice Agent Call Simulation Details</DialogTitle>
                <DialogDesc className="text-xs">
                    Customer: {selectedCall.details.input.userName || "N/A"} | Product: {selectedCall.product || "N/A"} | Timestamp: {format(parseISO(selectedCall.timestamp), 'PPPP pppp')}
                </DialogDesc>
                </DialogHeader>
                <ScrollArea className="grow p-4 overflow-y-auto">
                    {selectedCall.details.origin === 'call-scoring-backfill' && (
                        <Alert variant="default" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Imported from Call Scoring</AlertTitle>
                            <AlertDescription>
                              This call was backfilled from the call scoring dashboard. Audio playback may be unavailable because only scoring artifacts were stored.
                            </AlertDescription>
                        </Alert>
                    )}
                    {selectedCall.details.error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Error during call simulation</AlertTitle>
                            <AlertDescription>{selectedCall.details.error}</AlertDescription>
                        </Alert>
                    )}
                    {selectedCall.details.input && (
                        <Card className="mb-4 bg-muted/30">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Call Setup Parameters</CardTitle></CardHeader>
                            <CardContent className="text-xs px-4 pb-3 space-y-1">
                                <p><strong>AI Agent:</strong> {selectedCall.details.input.agentName || "Default AI"}</p>
                                <p><strong>Customer:</strong> {selectedCall.details.input.userName || "N/A"}</p>
                                <p><strong>Product:</strong> {selectedCall.product || "N/A"} | <strong>Cohort:</strong> {selectedCall.details.input.customerCohort}</p>
                            </CardContent>
                        </Card>
                    )}
                    {selectedCall.details.fullCallAudioDataUri ? (
                        <Card className="mb-4">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Full Call Audio Recording</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-3">
                                <audio controls src={selectedCall.details.fullCallAudioDataUri} className="w-full h-10" preload="auto">
                                    Your browser does not support the audio element.
                                </audio>
                                <div className="mt-2 flex gap-2">
                                     <Button variant="outline" size="xs" onClick={() => downloadDataUriFile(selectedCall.details.fullCallAudioDataUri!, `FullCall_${selectedCall.details.input.userName || 'User'}.wav`)}><FileAudio className="mr-1 h-3"/>Download Full Audio</Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Alert variant="default" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Audio Recording Not Available</AlertTitle>
                        </Alert>
                    )}
                    {selectedCall.details.fullTranscriptText && (
                        <Card className="mb-4">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Conversation Transcript (Simulated)</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-3">
                                <ScrollArea className="h-48 w-full rounded-md border p-3 bg-background">
                                  <TranscriptViewer 
                                    transcript={normalizeTranscript(
                                      selectedCall.details.fullTranscriptText, 
                                      { 
                                        source: 'voice-sales-dashboard', 
                                        defaultAgentName: selectedCall.details.input.agentName,
                                        defaultUserName: selectedCall.details.input.userName,
                                        mergeConsecutiveTurns: true 
                                      }
                                    )} 
                                    showTimestamps={true}
                                    agentPosition="left"
                                  />
                                </ScrollArea>
                                <div className="mt-2 flex gap-2">
                                     <Button variant="outline" size="xs" onClick={() => handleCopyToClipboard(selectedCall.details.fullTranscriptText!, 'Transcript')}><Copy className="mr-1 h-3"/>Copy</Button>
                                     <Button variant="outline" size="xs" onClick={() => handleDownloadFile(selectedCall.details.fullTranscriptText!, `SalesCall_${selectedCall.details.input.userName || 'User'}`, "transcript")}><Download className="mr-1 h-3"/>Download .txt</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                     {selectedCall.details.finalScore ? (
                        <CallScoringResultsCard 
                            results={selectedCall.details.finalScore}
                            fileName={`Simulated Call - ${selectedCall.details.input.userName}`}
                            agentName={selectedCall.details.input.agentName}
                            product={selectedCall.product as Product}
                            isHistoricalView={true}
                        />
                     ) : (
                        <Card className="mt-4">
                          <CardHeader>
                            <CardTitle className="text-md">Score this Call</CardTitle>
                          </CardHeader>
                          <CardContent>
                             <Button onClick={() => { handleScoreCall(selectedCall); }} disabled={scoringInProgress === selectedCall.id}>
                                {scoringInProgress === selectedCall.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Star className="mr-2 h-4 w-4"/>}
                                {scoringInProgress === selectedCall.id ? 'Scoring...' : 'Run AI Scoring'}
                            </Button>
                          </CardContent>
                        </Card>
                     )}
                </ScrollArea>
                <DialogFooter className="p-3 border-t bg-muted/50 sticky bottom-0">
                    <Button onClick={() => setIsDialogOpen(false)} size="sm">Close</Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        )}
      </main>
    </div>
  );
}

    
