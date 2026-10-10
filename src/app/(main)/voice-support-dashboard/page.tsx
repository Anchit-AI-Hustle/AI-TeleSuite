
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
import { Eye, List, FileSpreadsheet, FileText, Users, AlertCircleIcon, Info, Copy, Download, FileAudio, RadioTower, CheckCircle, Star, Loader2, PlayCircle, PauseCircle, Bot } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityLogEntry, VoiceSupportAgentActivityDetails, ScoreCallOutput, Product, ConversationTurn, KnowledgeFile, ProductObject } from '@/types';
import { useProductContext } from '@/hooks/useProductContext';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { normalizeTranscript } from '@/lib/transcript/normalize';

interface HistoricalSupportInteractionItem extends Omit<ActivityLogEntry, 'details'> {
  details: VoiceSupportAgentActivityDetails;
}

const prepareKnowledgeBaseContext = (
  knowledgeBaseFiles: KnowledgeFile[],
  productObject: ProductObject
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

export default function VoiceSupportDashboardPage() {
  const { activities, updateActivity } = useActivityLogger();
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const [selectedInteraction, setSelectedInteraction] = useState<HistoricalSupportInteractionItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { availableProducts, getProductByName } = useProductContext();
  const [productFilter, setProductFilter] = useState<string>("All");
  const [scoringInProgress, setScoringInProgress] = useState<string | null>(null);
  
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const handlePlayAudio = useCallback((item: HistoricalSupportInteractionItem) => {
    if (currentlyPlayingId === item.id) {
        audioPlayerRef.current?.pause();
        setCurrentlyPlayingId(null);
    } else if (item.details.fullCallAudioDataUri && audioPlayerRef.current) {
        audioPlayerRef.current.src = item.details.fullCallAudioDataUri;
        audioPlayerRef.current.play().catch(e => toast({ variant: 'destructive', title: 'Playback Error', description: (e as Error).message }));
        setCurrentlyPlayingId(item.id);
    } else {
        toast({ variant: 'destructive', title: 'Playback Error', description: 'Audio data is not available for this interaction.'});
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

  const supportInteractionHistory: HistoricalSupportInteractionItem[] = useMemo(() => {
    if (!isClient) return [];
    return (activities || [])
      .filter(activity =>
        activity.module === "AI Voice Support Agent" &&
        activity.details &&
        typeof activity.details === 'object' &&
        'flowInput' in activity.details &&
        ('flowOutput' in activity.details || 'error' in activity.details || 'fullConversation' in activity.details)
      )
      .map(activity => activity as HistoricalSupportInteractionItem)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activities, isClient]);

  const filteredHistory = useMemo(() => {
    if (productFilter === "All") {
      return supportInteractionHistory;
    }
    return supportInteractionHistory.filter(item => item.product === productFilter);
  }, [supportInteractionHistory, productFilter]);

  const handleViewDetails = (item: HistoricalSupportInteractionItem) => {
    setSelectedInteraction(item);
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

  const handleScoreCall = useCallback(async (item: HistoricalSupportInteractionItem) => {
    if (!item.details.fullTranscriptText || !item.product) {
        toast({ variant: 'destructive', title: 'Scoring Error', description: 'Transcript or product context is missing.'});
        return;
    }
    setScoringInProgress(item.id);
    try {
        const productData = getProductByName(item.product);
        if(!productData) throw new Error("Product details not found for scoring.");
        const productContext = prepareKnowledgeBaseContext(knowledgeBaseFiles, productData);
        
        const response = await fetch('/api/call-scoring', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transcriptOverride: item.details.fullTranscriptText,
                product: item.product,
                agentName: item.details.flowInput.agentName,
                productContext: productContext,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const scoreOutput = await response.json();
        
        const updatedDetails: Partial<VoiceSupportAgentActivityDetails> = {
            finalScore: scoreOutput
        };
        updateActivity(item.id, { ...item.details, ...updatedDetails });
        
        setSelectedInteraction(prev => prev ? { ...prev, details: { ...prev.details, finalScore: scoreOutput } } : null);

        toast({ title: 'Scoring Complete', description: `Interaction with ${item.details.flowInput.userName} has been scored.` });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({ variant: 'destructive', title: 'AI Scoring Failed', description: errorMessage });
    } finally {
        setScoringInProgress(null);
    }
  }, [updateActivity, toast, getProductByName, knowledgeBaseFiles]);


  const handleExportTable = (formatType: 'csv' | 'pdf' | 'doc') => {
    if (filteredHistory.length === 0) {
      toast({ title: "No Data", description: `No support interaction history for '${productFilter}' to export.` });
      return;
    }
    try {
      const headers = ["Timestamp", "App Agent", "AI Agent Name", "Customer Name", "Product", "User Query (Start)", "Escalation Suggested", "Error"];
      const dataForExportObjects = filteredHistory.map(item => ({
        Timestamp: format(parseISO(item.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        AppAgent: item.agentName || 'N/A',
        AIAgentName: item.details.flowInput.agentName || 'N/A',
        CustomerName: item.details.flowInput.userName || 'N/A',
        Product: item.details.flowInput.product,
        UserQueryStart: item.details.flowInput.userQuery.substring(0, 50) + (item.details.flowInput.userQuery.length > 50 ? '...' : ''),
        EscalationSuggested: item.details.flowOutput?.escalationSuggested ? 'Yes' : 'No',
        Error: item.details.error || '',
      }));

      const dataRowsForPdfOrDoc = dataForExportObjects.map(row => Object.values(row));
      const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
      const baseFilename = `voice_support_interaction_history_${productFilter}_${timestamp}`;

      if (formatType === 'csv') exportToCsv(`${baseFilename}.csv`, dataForExportObjects);
      else if (formatType === 'pdf') exportTableDataToPdf(`${baseFilename}.pdf`, headers, dataRowsForPdfOrDoc);
      else if (formatType === 'doc') exportTableDataForDoc(`${baseFilename}.doc`, headers, dataRowsForPdfOrDoc);
      
      toast({ title: "Export Successful", description: `Support interaction history exported as ${formatType.toUpperCase()}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failed", description: `Could not export history. Error: ${error instanceof Error ? error.message : String(error)}`});
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Voice Support Agent Dashboard" />
       <audio ref={audioPlayerRef} className="hidden" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
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
                <CardTitle className="flex items-center"><Users className="mr-2 h-5 w-5 text-primary"/>Support Interaction Logs</CardTitle>
                <CardDescription>History of AI-driven support interactions. Click "View" for details.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-460px)] md:h-[calc(100vh-380px)]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                            <TableHead>Date</TableHead>
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
                            <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No support interactions logged for '{productFilter}' yet.</TableCell></TableRow>
                        ) : (
                            filteredHistory.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="text-xs">{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                                <TableCell className="text-xs max-w-[150px] truncate" title={item.details.flowInput.userName || "Unknown User"}>
                                  {item.details.flowInput.userName || "Unknown User"}
                                </TableCell>
                                <TableCell className="text-xs">{item.details.flowInput.product}</TableCell>
                                <TableCell className="text-center text-xs">
                                    {item.details.finalScore ? (
                                    `${item.details.finalScore?.overallScore?.toFixed(1)}/5`
                                    ) : item.details.error ? (
                                    'N/A'
                                    ) : (
                                    <Button size="xs" variant="secondary" onClick={() => handleScoreCall(item)} disabled={scoringInProgress === item.id}>
                                        {scoringInProgress === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Star className="mr-1 h-3 w-3" />}
                                        Score
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
                                <Button variant="outline" size="xs" onClick={() => handleViewDetails(item)}><Eye className="mr-1.5 h-3.5 w-3.5" /> View</Button>
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
          Activity log is limited to the most recent {MAX_ACTIVITIES_TO_STORE} entries. Detailed interaction logs are available in the "View" dialog.
        </div>

        {selectedInteraction && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-4 pb-3 border-b sticky top-0 bg-background z-10">
                <DialogTitle className="text-lg text-primary">Support Interaction Details</DialogTitle>
                <DialogDesc className="text-xs">
                    Customer: {selectedInteraction.details.flowInput.userName || "N/A"} | Product: {selectedInteraction.details.flowInput.product} | Date: {format(parseISO(selectedInteraction.timestamp), 'PPPP pppp')}
                </DialogDesc>
                </DialogHeader>
                <ScrollArea className="grow p-4 overflow-y-auto">
                    {selectedInteraction.details.error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Error during interaction</AlertTitle>
                            <AlertDescription>{selectedInteraction.details.error}</AlertDescription>
                        </Alert>
                    )}
                    {selectedInteraction.details.flowInput && (
                        <Card className="mb-4 bg-muted/30">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Context Parameters</CardTitle></CardHeader>
                            <CardContent className="text-xs px-4 pb-3 space-y-1">
                                <p><strong>AI Agent Name (Simulated):</strong> {selectedInteraction.details.flowInput.agentName || "Default AI"}</p>
                                <p><strong>Customer Name:</strong> {selectedInteraction.details.flowInput.userName || "N/A"}</p>
                                <p><strong>Product:</strong> {selectedInteraction.details.flowInput.product}</p>
                                <p><strong>Initial Query:</strong> {selectedInteraction.details.flowInput.userQuery}</p>
                            </CardContent>
                        </Card>
                    )}
                     {selectedInteraction.details.fullCallAudioDataUri ? (
                        <Card className="mb-4">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Full Interaction Audio Recording</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-3">
                                <audio controls src={selectedInteraction.details.fullCallAudioDataUri} className="w-full h-10">
                                    Your browser does not support the audio element.
                                </audio>
                                <div className="mt-2 flex gap-2">
                                     <Button variant="outline" size="xs" onClick={() => downloadDataUriFile(selectedInteraction.details.fullCallAudioDataUri!, `SupportInteraction_${selectedInteraction.details.flowInput.userName || 'User'}.wav`)}><FileAudio className="mr-1 h-3"/>Download Full Audio (.wav)</Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Alert variant="default" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Audio Recording Not Available</AlertTitle>
                        </Alert>
                    )}
                    {selectedInteraction.details.fullTranscriptText ? (
                        <Card className="mb-4">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Conversation Log</CardTitle></CardHeader>
                            <CardContent className="px-4 pb-3">
                                <ScrollArea className="h-48 w-full rounded-md border p-3 bg-background">
                                  <TranscriptViewer 
                                    transcript={normalizeTranscript(
                                      selectedInteraction.details.fullTranscriptText, 
                                      { 
                                        source: 'voice-support-dashboard', 
                                        defaultAgentName: selectedInteraction.details.flowInput.agentName,
                                        defaultUserName: selectedInteraction.details.flowInput.userName,
                                        mergeConsecutiveTurns: true 
                                      }
                                    )} 
                                    showTimestamps={true}
                                    agentPosition="left"
                                  />
                                </ScrollArea>
                                 <div className="mt-2 flex gap-2">
                                     <Button variant="outline" size="xs" onClick={() => handleCopyToClipboard(selectedInteraction.details.fullTranscriptText!, 'Log')}><Copy className="mr-1 h-3"/>Copy Log</Button>
                                     <Button variant="outline" size="xs" onClick={() => handleDownloadFile(selectedInteraction.details.fullTranscriptText!, `SupportLog_${selectedInteraction.details.flowInput.userName || 'User'}`, "transcript")}><Download className="mr-1 h-3"/>Download Log</Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                       <Alert variant="default" className="mb-4">
                            <AlertCircleIcon className="h-4 w-4" />
                            <AlertTitle>Transcript Not Available</AlertTitle>
                        </Alert>
                    )}
                     {selectedInteraction.details.flowOutput && (
                        <Card className="bg-green-50 border-green-200">
                            <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm text-green-800 flex items-center"><Bot size={16} className="mr-2"/>AI Response Summary</CardTitle></CardHeader>
                            <CardContent className="text-xs px-4 pb-3 space-y-1 text-green-700">
                                <p><strong>Full Response Text:</strong> {selectedInteraction.details.flowOutput.aiResponseText}</p>
                                {selectedInteraction.details.flowOutput.sourcesUsed && <p><strong>Sources Used:</strong> {selectedInteraction.details.flowOutput.sourcesUsed.join(', ')}</p>}
                                {selectedInteraction.details.flowOutput.escalationSuggested && <p className="font-semibold"><strong>Escalation Suggested:</strong> Yes</p>}
                            </CardContent>
                        </Card>
                     )}
                     {selectedInteraction.details.finalScore && (
                        <CallScoringResultsCard 
                            results={selectedInteraction.details.finalScore as ScoreCallOutput}
                            fileName={`Simulated Call - ${selectedInteraction.details.flowInput.userName}`}
                            agentName={selectedInteraction.details.flowInput.agentName}
                            product={selectedInteraction.product as Product}
                            isHistoricalView={true}
                        />
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

    
