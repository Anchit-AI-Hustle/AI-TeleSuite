
"use client";

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityLogEntry } from "@/types";
import { format, parseISO } from 'date-fns';
import { Eye, ArrowUpDown, FileText as FileTextIcon, MessageSquareReply as MessageSquareReplyIcon, ListChecks as ListChecksIcon, BookOpen as BookOpenIcon, Mic2 as Mic2Icon, Info, Lightbulb, FileSearch, LayoutList, DatabaseZap, Settings, AlertCircle, MessageCircleQuestion, Goal, User, Users, Sigma, DraftingCompass, TrendingUp, TestTube2, LineChart, ListTree, SearchCheck, HandCoins, CalendarDays, Activity, TableIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Import components for rich display
import { CallScoringResultsCard } from '../call-scoring/call-scoring-results-card';
import { PitchCard } from '../pitch-generator/pitch-card';
import { RebuttalDisplay } from '../rebuttal-generator/rebuttal-display';
import { DataAnalysisResultsCard } from '../data-analysis/data-analysis-results-card'; 
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// Import type definitions for details
import type {
  ScoreCallOutput,
  GeneratePitchInput,
  GeneratePitchOutput,
  GenerateRebuttalInput,
  GenerateRebuttalOutput,
  TranscriptionOutput,
  GenerateTrainingDeckInput,
  GenerateTrainingDeckOutput,
  TrainingDeckFlowKnowledgeBaseItem,
  DataAnalysisInput,
  DataAnalysisReportOutput,
  TrainingMaterialActivityDetails,
  KnowledgeFile
} from '@/types';


interface ActivityTableProps {
  activities: ActivityLogEntry[];
}

type SortKey = keyof ActivityLogEntry | null;
type SortDirection = 'asc' | 'desc';

// Define a type for the expected structure of various activity details
interface CallScoringActivityDetails {
  fileName: string;
  scoreOutput: ScoreCallOutput;
  agentNameFromForm?: string; // Added this
  error?: string;
}
interface PitchGeneratorActivityDetails {
  pitchOutput: GeneratePitchOutput;
  inputData: GeneratePitchInput & { usedDirectFile?: boolean; directFileName?: string; directFileContentUsed?: boolean; knowledgeBaseContextProvided?: boolean;};
  error?: string;
}
interface RebuttalGeneratorActivityDetails {
  rebuttalOutput: GenerateRebuttalOutput;
  inputData: GenerateRebuttalInput & {knowledgeBaseContextProvided?: boolean;};
  error?: string;
}
interface TranscriptionActivityDetails {
  fileName: string;
  transcriptionOutput: TranscriptionOutput;
  error?: string;
}

interface DataAnalysisActivityDetails { 
  analysisOutput: DataAnalysisReportOutput; 
  inputData: DataAnalysisInput; 
  error?: string;
}

interface KnowledgeBaseActivityDetails extends Partial<KnowledgeFile> { 
  fileData?: Omit<KnowledgeFile, 'id' | 'uploadDate'>; 
  filesData?: Array<Omit<KnowledgeFile, 'id' | 'uploadDate'>>; 
  action?: 'add' | 'delete' | 'update' | 'clear_all' | 'download_full_prompts';
  countCleared?: number;
  fileId?: string; 
  error?: string;
}

export function ActivityTable({ activities }: ActivityTableProps) {
  const [selectedActivity, setSelectedActivity] = useState<ActivityLogEntry | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleViewDetails = (activity: ActivityLogEntry) => {
    setSelectedActivity(activity);
    setIsDialogOpen(true);
  };

  const sortedActivities = [...activities].sort((a, b) => {
    if (!sortKey) return 0;
    const valA = a[sortKey];
    const valB = b[sortKey];

    let comparison = 0;
    if (valA === undefined || valA === null) comparison = -1;
    else if (valB === undefined || valB === null) comparison = 1;
    else if (valA > valB) comparison = 1;
    else if (valA < valB) comparison = -1;
    
    return sortDirection === 'desc' ? comparison * -1 : comparison;
  });

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortKey === key && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortKey(key);
    setSortDirection(direction);
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-2 h-3.5 w-3.5 inline transform rotate-180" /> : <ArrowUpDown className="ml-2 h-3.5 w-3.5 inline" />;
  };
  
  const formatKnowledgeBaseInputs = (details: KnowledgeBaseActivityDetails): string => {
    let inputStr = `Action: ${details.action || 'unknown'}\n`;
    if (details.action === 'clear_all' && details.countCleared !== undefined) {
        inputStr += `Cleared ${details.countCleared} entr(y/ies).\n`;
    } else if (details.action === 'download_full_prompts') {
        inputStr += `User downloaded the full AI prompts & logic document.\n`;
    } else if (details.fileData) {
        inputStr += `Entry Name: ${details.fileData.name}\nType: ${details.fileData.isTextEntry ? 'Text Entry' : details.fileData.type}\n`;
        if (details.fileData.product) inputStr += `Product: ${details.fileData.product}\n`;
        if (details.fileData.persona) inputStr += `Persona: ${details.fileData.persona}\n`;
        if (details.fileData.isTextEntry && details.fileData.textContent) {
            inputStr += `Content (excerpt): ${details.fileData.textContent.substring(0,100)}...\n`;
        }
    } else if (details.filesData && details.filesData.length > 0) {
        inputStr += `Files (${details.filesData.length}):\n${details.filesData.map(f => `  - ${f.name} (${f.isTextEntry ? 'Text Entry' : f.type || 'N/A'}, Size: ${f.size})`).join('\n')}\n`;
        if (details.filesData[0].product) inputStr += `Product (for batch): ${details.filesData[0].product}\n`;
        if (details.filesData[0].persona) inputStr += `Persona (for batch): ${details.filesData[0].persona}\n`;
    } else if (details.fileId) {
        inputStr += `File ID: ${details.fileId}\n`;
         if (details.name) inputStr += `Item Name: ${details.name}\n`;
    } else if (details.name) {
        inputStr += `Item Name: ${details.name}\n`;
    }
    
    if (details.error) inputStr += `Error: ${details.error}\n`;
    return inputStr;
  };

  const formatDetailsForPre = (activity: ActivityLogEntry): string => {
    const details = activity.details;
    if (typeof details === 'string') return details;
    if (typeof details === 'object' && details !== null) {
      if (isErrorDetails(details)) {
        let errorStr = `Error: ${details.error}\n`;
        if (details.inputData) errorStr += `Input Data (Context): ${JSON.stringify(details.inputData, null, 2)}`;
        return errorStr;
      }

      switch(activity.module) {
          case "Pitch Generator":
              if (isPitchGeneratorDetails(details)) {
                  let inputStr = `Product: ${details.inputData.product}\nCustomer Cohort: ${details.inputData.customerCohort}`;
                 if(details.inputData.salesPlan) inputStr += `\nSales Plan: ${details.inputData.salesPlan}`;
                  if(details.inputData.offer) inputStr += `\nOffer: ${details.inputData.offer}`;
                  if(details.inputData.agentName) inputStr += `\nAgent Name: ${details.inputData.agentName}`;
                  if(details.inputData.userName) inputStr += `\nUser Name: ${details.inputData.userName}`;
                  if(details.inputData.usedDirectFile) inputStr += `\nKnowledge Source: Direct File Upload (${details.inputData.directFileName || 'Unknown Name'})`;
                  else inputStr += `\nKnowledge Source: General Knowledge Base`;
                  inputStr += `\nKB Context Provided: ${details.inputData.knowledgeBaseContextProvided}`;
                  inputStr += `\nDirect File Content Used (if applicable): ${details.inputData.directFileContentUsed}`;
                  return inputStr;
              }
              break;
          case "Rebuttal Generator":
              if (isRebuttalGeneratorDetails(details)) {
                  return `Product: ${details.inputData.product}\nObjection: ${details.inputData.objection}\nKB Context Provided: ${details.inputData.knowledgeBaseContextProvided}`;
              }
              break;
          case "Create Training Material":
              if (isTrainingMaterialDetails(details)) {
                  let inputStr = `Product: ${details.inputData.product}\nOutput Format: ${details.inputData.deckFormatHint}\n`;
                  inputStr += `Context Source Description: ${details.inputData.sourceDescriptionForAi || (details.inputData.generateFromAllKb ? 'Entire KB for product' : `${details.inputData.knowledgeBaseItems.length} selected KB items / direct uploads`)}\n`;
                  if (details.inputData.knowledgeBaseItems && details.inputData.knowledgeBaseItems.length > 0) {
                      inputStr += `Context Items (Name, Type, Text Excerpt if applicable):\n${details.inputData.knowledgeBaseItems.map((item: TrainingDeckFlowKnowledgeBaseItem) => 
                        `    - ${item.name} (${item.isTextEntry ? 'Text Entry' : item.fileType || 'File'})${item.textContent ? `\n      Text: "${item.textContent.substring(0,100)}..."` : ''}`
                      ).join('\n')}`;
                  }
                  return inputStr;
              }
              break;
          case "Data Analysis": 
              if (isDataAnalysisDetails(details)) { 
                  let inputStr = `User Analysis Prompt (Specific to this run):\n${details.inputData.userAnalysisPrompt}\n\n`;
                  inputStr += `File Context Provided (${details.inputData.fileDetails.length} files):\n${details.inputData.fileDetails.map((fileDetail: DataAnalysisInput['fileDetails'][number]) => `    - ${fileDetail.fileName} (Type: ${fileDetail.fileType})`).join('\n')}\n`;
                  if (details.inputData.sampledFileContent) {
                      inputStr += `\nSampled Text Content (from first CSV/TXT):\n    "${details.inputData.sampledFileContent.substring(0,250)}..."\n`;
                  }
                  return inputStr;
              }
              break;
           case "Knowledge Base Management":
              if (isKnowledgeBaseDetails(details)) {
                  return formatKnowledgeBaseInputs(details);
              }
              break;
          case "Call Scoring":
              if (isCallScoringDetails(details)) {
                return `File Name: ${details.fileName || "Unknown"}\nProduct: ${activity.product || "N/A"}\nAgent Name (from form): ${details.agentNameFromForm || "N/A"}\n(Audio file processed, content not shown here for brevity)`;
              }
              break;
          case "Transcription & Analysis":
              if (isCallScoringDetails(details)) {
                return `File Name: ${details.fileName || "Unknown"}\n(Audio file processed for general analysis, content not shown here for brevity)`;
              }
              break;
      }
      return JSON.stringify(details, (key, value) => { 
        if ((key === 'textContent' || key === 'sampledFileContent' || key === 'knowledgeBaseContext' || key === 'diarizedTranscript') && typeof value === 'string' && value.length > 500) {
          return value.substring(0, 500) + "... (truncated for raw view)";
        }
        if (key === 'knowledgeBaseItems' && Array.isArray(value) && value.length > 3) {
          const previewNames = value.slice(0, 3).map(item => {
            if (typeof item === 'object' && item !== null && 'name' in item && typeof (item as { name?: unknown }).name === 'string') {
              return (item as { name: string }).name;
            }
            return 'Unnamed Item';
          });
          return `Array of ${value.length} items (first 3 names shown): ${JSON.stringify(previewNames)}...`;
        }
        if (activity.module === "Data Analysis" && typeof value === 'string' && value.length > 300 && ['executiveSummary', 'reportTitle', 'detailedAnalysis', 'keyMetrics'].includes(key)) {
          return value.substring(0, 300) + "... (truncated, view full report for details)";
        }
        if (key === 'recommendations' && Array.isArray(value) && value.length > 2) { 
             const previewRecommendations = value.slice(0, 2).map(item => {
                if (typeof item === 'object' && item !== null) {
                  const area = 'area' in item && typeof (item as { area?: unknown }).area === 'string'
                    ? (item as { area: string }).area
                    : 'N/A';
                  const recommendation = 'recommendation' in item && typeof (item as { recommendation?: unknown }).recommendation === 'string'
                    ? (item as { recommendation: string }).recommendation.substring(0, 50)
                    : 'N/A';
                  return `${area}: ${recommendation}`;
                }
                return 'N/A';
             });
             return `Array of ${value.length} recommendations (first 2 shown): ${JSON.stringify(previewRecommendations)}...`;
        }
        if (key === 'audioDataUri' && typeof value === 'string' && value.length > 100) {
            return value.substring(0,100) + "... (Data URI truncated)";
        }
        return value;
      }, 2);
    }
    return 'N/A';
  };
  
  const getDetailsPreview = (activity: ActivityLogEntry): string => {
    const details = activity.details;
    if (typeof details === 'string') return details.substring(0,50) + (details.length > 50 ? '...' : '');
    
    if (typeof details === 'object' && details !== null) {
        if (isErrorDetails(details)) return `Error: ${details.error.substring(0, 40)}...`;

        switch(activity.module) {
            case "Call Scoring":
            case "Transcription & Analysis":
                if (isCallScoringDetails(details)) {
                    return `Call Scored: ${details.fileName || 'Unknown File'}. Score: ${details.scoreOutput?.overallScore ?? 'N/A'}`;
                }
                break;
            case "Pitch Generator":
                 if (isPitchGeneratorDetails(details)) {
                    return `Pitch for ${details.inputData?.product || 'N/A'}: ${details.pitchOutput?.pitchTitle?.substring(0,30) || 'N/A'}...`;
                }
                break;
            case "Rebuttal Generator":
                if (isRebuttalGeneratorDetails(details)) {
                    return `Rebuttal for "${(details.inputData?.objection || 'N/A').substring(0,30)}..."`;
                }
                break;
            case "Create Training Material": 
                if (isTrainingMaterialDetails(details)) { 
                    const materialType = details.inputData?.deckFormatHint === "Brochure" ? "Brochure" : "Deck";
                    return `${materialType} for ${details.inputData?.product || 'N/A'}: ${details.materialOutput?.deckTitle?.substring(0,30) || 'N/A'}...`;
                }
                break;
            case "Data Analysis": 
                if (isDataAnalysisDetails(details)) { 
                    return `Report: ${details.analysisOutput?.reportTitle?.substring(0,30) || 'N/A'}... (Prompt: ${details.inputData.userAnalysisPrompt.substring(0,20)}...)`;
                }
                break;
             case "Knowledge Base Management":
                if (isKnowledgeBaseDetails(details)) {
                    if (details.action === 'clear_all') return `KB Cleared: ${details.countCleared} entries removed.`;
                    if (details.action === 'download_full_prompts') return `Downloaded full AI prompts document.`;
                    const action = details.action || (details.filesData ? 'add batch' : 'add');
                    const name = details.name || details.fileData?.name || (details.filesData && details.filesData[0]?.name) || 'N/A';
                    return `Action: ${action}. Item: ${name}`;
                }
                break;
            case "Transcription":
                 if (isTranscriptionDetails(details)) {
                    return `Transcribed: ${details.fileName}.`;
                }
                break;
        }
        return "Complex object details. Click View for more.";
    }
    return 'No specific preview.';
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const isErrorDetails = (details: unknown): details is { error: string; inputData?: ActivityLogEntry['details'] } =>
    isRecord(details) && typeof details.error === 'string';

  const isCallScoringDetails = (details: unknown): details is CallScoringActivityDetails => 
    isRecord(details) && 'fileName' in details && ('scoreOutput' in details || 'finalScore' in details);

  const isPitchGeneratorDetails = (details: unknown): details is PitchGeneratorActivityDetails => 
    isRecord(details) && 'pitchOutput' in details && 'inputData' in details;

  const isRebuttalGeneratorDetails = (details: unknown): details is RebuttalGeneratorActivityDetails => 
    isRecord(details) && 'rebuttalOutput' in details && 'inputData' in details;

  const isTranscriptionDetails = (details: unknown): details is TranscriptionActivityDetails =>
    isRecord(details) && 'transcriptionOutput' in details && 'fileName' in details;

  const isTrainingMaterialDetails = (details: unknown): details is TrainingMaterialActivityDetails => 
    isRecord(details) && 'materialOutput' in details && 'inputData' in details;

  const isDataAnalysisDetails = (details: unknown): details is DataAnalysisActivityDetails => 
    isRecord(details) && 'analysisOutput' in details && 'inputData' in details;

  const isKnowledgeBaseDetails = (details: unknown): details is KnowledgeBaseActivityDetails =>
    isRecord(details) && ('fileData' in details || 'filesData' in details || 'action' in details || 'fileId' in details || 'name' in details || 'countCleared' in details);


  const renderInputContextSection = (activity: ActivityLogEntry) => {
    if (!activity.details || typeof activity.details !== 'object' || isErrorDetails(activity.details)) return null;
    
    const inputDetails = formatDetailsForPre(activity);
    if (inputDetails && inputDetails !== 'N/A' && !inputDetails.toLowerCase().includes("audio file processed")) {
        return (
            <AccordionItem value="item-input-params">
                <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                    <div className="flex items-center"><Settings className="mr-2 h-5 w-5 text-accent"/>Input Parameters / Context</div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                    <ScrollArea className="max-h-60 overflow-y-auto">
                        <pre className="p-2 bg-background/30 rounded-md text-xs whitespace-pre-wrap wrap-break-word">{inputDetails}</pre>
                    </ScrollArea>
                </AccordionContent>
            </AccordionItem>
        );
    }
    return null;
  };

  const renderOutputDisplaySection = (activity: ActivityLogEntry) => {
     if (!activity.details || typeof activity.details !== 'object' || isErrorDetails(activity.details)) return null;
     let outputContent: React.ReactNode = null;
     let outputTitle = "Result / Output";
     let outputIcon = <Info className="mr-2 h-5 w-5 text-accent"/>;

    if (isCallScoringDetails(activity.details) && (activity.module === "Call Scoring" || activity.module === "Transcription & Analysis")) {
        outputContent = <CallScoringResultsCard results={activity.details.scoreOutput} fileName={activity.details.fileName} isHistoricalView={true} />;
        outputTitle = "Call Scoring Report";
        outputIcon = <ListChecksIcon className="mr-2 h-5 w-5 text-accent"/>;
    } else if (isPitchGeneratorDetails(activity.details) && activity.module === "Pitch Generator") {
        outputContent = <PitchCard pitch={activity.details.pitchOutput} />;
        outputTitle = "Generated Pitch";
        outputIcon = <Lightbulb className="mr-2 h-5 w-5 text-accent"/>;
    } else if (isRebuttalGeneratorDetails(activity.details) && activity.module === "Rebuttal Generator") {
        outputContent = <RebuttalDisplay rebuttal={activity.details.rebuttalOutput} />;
        outputTitle = "Suggested Rebuttal";
        outputIcon = <MessageSquareReplyIcon className="mr-2 h-5 w-5 text-accent"/>;
    } else if (isTrainingMaterialDetails(activity.details) && activity.module === "Create Training Material") {
        const { materialOutput, inputData } = activity.details;
        outputContent = (
            <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center">
                    {inputData.deckFormatHint === "Brochure" ? <LayoutList className="mr-2 h-5 w-5"/> : <BookOpenIcon className="mr-2 h-5 w-5"/>}
                    {materialOutput?.deckTitle || "Untitled Material"}
                </h3>
                <Label>Sections / Slides / Panels:</Label>
                <ScrollArea className="max-h-[40vh] overflow-y-auto border rounded-md p-2 bg-background">
                    {materialOutput?.sections?.map((section, index) => (
                        <div key={index} className="pb-2 mb-2 border-b last:border-b-0">
                            <h4 className="font-medium text-md">{section.title}</h4>
                            <p className="text-xs text-muted-foreground whitespace-pre-line">{section.content}</p>
                            {section.notes && <p className="text-xs text-accent-foreground/70 mt-1 italic">Notes: {section.notes}</p>}
                        </div>
                    )) || <p className="text-muted-foreground">No sections generated.</p>}
                </ScrollArea>
            </div>
        );
        outputTitle = "Generated Training Material";
        outputIcon = <BookOpenIcon className="mr-2 h-5 w-5 text-accent"/>;
    } else if (isDataAnalysisDetails(activity.details) && activity.module === "Data Analysis") { 
        outputContent = <DataAnalysisResultsCard reportOutput={activity.details.analysisOutput} userAnalysisPrompt={activity.details.inputData.userAnalysisPrompt} fileContext={activity.details.inputData.fileDetails} />;
        outputTitle = "Data Analysis Report";
        outputIcon = <FileSearch className="mr-2 h-5 w-5 text-accent"/>;
    } else if (isKnowledgeBaseDetails(activity.details) && activity.module === "Knowledge Base Management") {
        outputContent = <pre className="p-2 bg-background/30 rounded-md text-xs whitespace-pre-wrap wrap-break-word">{formatKnowledgeBaseInputs(activity.details)}</pre>;
        outputTitle = "Knowledge Base Action Details";
        outputIcon = <DatabaseZap className="mr-2 h-5 w-5 text-accent"/>;
    }
    
    if (outputContent) {
        return (
            <AccordionItem value="item-output">
                <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                    <div className="flex items-center">{outputIcon}{outputTitle}</div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                    {outputContent}
                </AccordionContent>
            </AccordionItem>
        );
    }
    return null;
  };

  return (
    <>
      <ScrollArea className="h-[calc(100vh-300px)] md:h-[calc(100vh-240px)] rounded-md border shadow-xs bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-xs">
            <TableRow>
              <TableHead onClick={() => requestSort('timestamp')} className="cursor-pointer py-2.5 px-3 text-xs">
                Date {getSortIndicator('timestamp')}
              </TableHead>
              <TableHead onClick={() => requestSort('module')} className="cursor-pointer py-2.5 px-3 text-xs">
                Module {getSortIndicator('module')}
              </TableHead>
              <TableHead onClick={() => requestSort('product')} className="cursor-pointer py-2.5 px-3 text-xs">
                Product {getSortIndicator('product')}
              </TableHead>
              <TableHead onClick={() => requestSort('agentName')} className="cursor-pointer py-2.5 px-3 text-xs">
                Agent {getSortIndicator('agentName')}
              </TableHead>
              <TableHead className="py-2.5 px-3 text-xs">Details Preview</TableHead>
              <TableHead className="text-right py-2.5 px-3 text-xs">View Result</TableHead> 
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedActivities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No activities logged yet.
                </TableCell>
              </TableRow>
            ) : (
              sortedActivities.map((activity) => (
                <TableRow key={activity.id} className="hover:bg-muted/30">
                  <TableCell className="py-2 px-3 text-xs">{format(parseISO(activity.timestamp), 'PP p')}</TableCell>
                  <TableCell className="py-2 px-3 text-xs">{activity.module}</TableCell>
                  <TableCell className="py-2 px-3 text-xs">{activity.product || 'N/A'}</TableCell>
                  <TableCell className="py-2 px-3 text-xs">{activity.agentName || 'N/A'}</TableCell>
                  <TableCell className="max-w-[200px] truncate py-2 px-3 text-xs" title={getDetailsPreview(activity)}>
                    {getDetailsPreview(activity)}
                  </TableCell>
                  <TableCell className="text-right py-2 px-3">
                    <Button variant="outline" size="xs" onClick={() => handleViewDetails(activity)}> 
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {selectedActivity && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-4 pb-3 border-b sticky top-0 bg-background z-10">
              <DialogTitle className="text-lg text-primary">Activity Details: {selectedActivity.module}</DialogTitle>
              <DialogDescription className="text-xs">
                Logged on: {format(parseISO(selectedActivity.timestamp), 'PPPP pppp')}
                {selectedActivity.agentName && ` by ${selectedActivity.agentName}`}
                {selectedActivity.product && `, Product: ${selectedActivity.product}`}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="grow p-4 overflow-y-auto">
              {isErrorDetails(selectedActivity.details) ? (
                 <div className="space-y-3 text-sm text-destructive bg-destructive/10 p-4 rounded-md">
                    <p className="font-semibold text-md">Error Occurred:</p>
                     {selectedActivity.details.inputData && (
                         <div>
                            <h4 className="font-medium text-sm text-destructive mb-1">Input Data (Context):</h4>
                            <ScrollArea className="max-h-40 overflow-y-auto">
                                <pre className="text-xs whitespace-pre-wrap break-all bg-background/30 p-2 rounded">
                                    {JSON.stringify(selectedActivity.details.inputData, null, 2)}
                                </pre>
                            </ScrollArea>
                        </div>
                    )}
                    <p><strong>Error Message:</strong> {selectedActivity.details.error}</p>
                 </div>
              ) : (
                <Accordion type="multiple" defaultValue={["item-output", "item-input-params"]} className="w-full space-y-1">
                  {renderInputContextSection(selectedActivity)}
                  {renderOutputDisplaySection(selectedActivity)}
                  
                  <AccordionItem value="item-raw-details">
                    <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                        <div className="flex items-center"><FileTextIcon className="mr-2 h-5 w-5 text-accent"/>Raw Details (Fallback)</div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                        <ScrollArea className="max-h-80 overflow-y-auto">
                            <pre className="bg-background/30 p-2 rounded-md text-xs whitespace-pre-wrap wrap-break-word">
                                {formatDetailsForPre(selectedActivity)}
                            </pre>
                        </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </ScrollArea>
            <DialogFooter className="p-3 border-t bg-muted/50 sticky bottom-0">
                <Button onClick={() => setIsDialogOpen(false)} size="sm">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
