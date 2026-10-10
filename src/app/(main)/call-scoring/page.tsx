
"use client";

import { useMemo, useState, useId } from 'react';
import { CallScoringForm } from '@/components/features/call-scoring/call-scoring-form';
import { CallScoringResultsTable } from '@/components/features/call-scoring/call-scoring-results-table';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Terminal, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { PageHeader } from '@/components/layout/page-header';
import { fileToDataUrl } from '@/lib/file-utils';
import { formatTranscriptSegments } from '@/lib/transcript-utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { ActivityLogEntry, ScoreCallOutput, HistoricalScoreItem, KnowledgeFile, ProductObject, TranscriptionOutput } from '@/types';
import { useProductContext } from '@/hooks/useProductContext';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { BatchProgressItem } from '@/components/common/batch-progress-list';
import { useAppVersion } from '@/context/app-version-context';


interface CallScoringFormValues {
  audioFiles?: FileList;
  agentName?: string;
  product?: string;
}

const MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024; // 100MB - aligned with Vercel limits
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB - warn for large files

// Increase the timeout for this page and its server actions
export const maxDuration = 300; // 5 minutes (Vercel Hobby limit)

// Helper function to prepare Knowledge Base and Product context string
const prepareKnowledgeBaseContext = (
  productObject: ProductObject,
  knowledgeBaseFiles: KnowledgeFile[],
): string => {
  if (!productObject || !Array.isArray(knowledgeBaseFiles)) {
    return "No product or knowledge base provided.";
  }

  const productSpecificFiles = knowledgeBaseFiles.filter(
    (file) => file.product === productObject.name
  );
  
  const MAX_CONTEXT_LENGTH = 30000;
  let combinedContext = `--- START OF KNOWLEDGE BASE CONTEXT FOR PRODUCT: ${productObject.displayName} ---\n`;
  combinedContext += `Brand Name: ${productObject.brandName || 'Not provided'}\n`;
  combinedContext += `Brand URL: ${productObject.brandUrl || 'Not provided'}\n`;
  combinedContext += `Description: ${productObject.description || 'Not provided'}\n`;
  combinedContext += "--------------------------------------------------\n\n";

  const addSection = (title: string, files: KnowledgeFile[]) => {
      if (files.length > 0) {
          combinedContext += `--- ${title.toUpperCase()} ---\n`;
          files.forEach(file => {
              let itemContext = `\n--- Item: ${file.name} ---\n`;
              if (file.isTextEntry && file.textContent) {
                  itemContext += `Content:\n${file.textContent}\n`;
              } else {
                  itemContext += `(This is a reference to a ${file.type} file named '${file.name}'. The AI should infer context from its name, type, and category.)\n`;
              }
              if (combinedContext.length + itemContext.length <= MAX_CONTEXT_LENGTH) {
                  combinedContext += itemContext;
              }
          });
          combinedContext += `--- END ${title.toUpperCase()} ---\n\n`;
      }
  };

  const pitchDocs = productSpecificFiles.filter(f => f.category === 'Pitch');
  const productDescDocs = productSpecificFiles.filter(f => f.category === 'Product Description');
  const pricingDocs = productSpecificFiles.filter(f => f.category === 'Pricing');
  const rebuttalDocs = productSpecificFiles.filter(f => f.category === 'Rebuttals');
  const otherDocs = productSpecificFiles.filter(f => !f.category || !['Pitch', 'Product Description', 'Pricing', 'Rebuttals'].includes(f.category));

  addSection("PRODUCT DETAILS, FEATURES, & PRICING (Source for factual information)", [...productDescDocs, ...pricingDocs]);
  addSection("COMMON OBJECTIONS & REBUTTALS (Source for handling objections)", rebuttalDocs);
  addSection("PITCH & SALES FLOW CONTEXT (Source for call structure and narrative)", pitchDocs);
  addSection("GENERAL SUPPLEMENTARY CONTEXT", otherDocs);


  if(combinedContext.length >= MAX_CONTEXT_LENGTH) {
    console.warn("Knowledge base context truncated due to length limit.");
    combinedContext += "\n... (Knowledge Base truncated due to length limit for AI context)\n";
  }

  combinedContext += `--- END OF KNOWLEDGE BASE CONTEXT ---`;
  return combinedContext.substring(0, MAX_CONTEXT_LENGTH);
};

export default function CallScoringPage() {
  const [results, setResults] = useState<HistoricalScoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();
  const { appVersion } = useAppVersion();
  const isOpenSourceVersion = appVersion === 'open-source';
  const { logBatchActivities } = useActivityLogger();
  const { getProductByName } = useProductContext();
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const uniqueIdPrefix = useId();
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('');
  const [progressItems, setProgressItems] = useState<BatchProgressItem[]>([]);
  const progressById = useMemo(() => {
    return progressItems.reduce<Record<string, BatchProgressItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [progressItems]);

  const updateProgress = (id: string, updates: Partial<BatchProgressItem>) => {
    setProgressItems(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  };

  const handleAnalyzeCall = async (data: CallScoringFormValues) => {
    if (isOpenSourceVersion) {
      toast({
        variant: 'destructive',
        title: 'Call scoring disabled in Open Source mode',
        description: 'Paid LLM+speech services are removed. Switch to the Completely Working Version to score calls.'
      });
      return;
    }
    setIsLoading(true);
    setFormError(null);
    setResults([]);
    setProgressItems([]);
    
    const product = data.product;
    if (!product) {
      setFormError("Product selection is required.");
      setIsLoading(false);
      return;
    }
    
    const productObject = getProductByName(product);
    if (!productObject) {
       setFormError("Selected product could not be found in the catalog.");
       setIsLoading(false);
       return;
    }

    const productContext = prepareKnowledgeBaseContext(productObject, knowledgeBaseFiles);

    const itemsToProcess: Array<{ name: string; audioDataUri: string; }> = [];

    if (data.audioFiles && data.audioFiles.length > 0) {
      for (const file of Array.from(data.audioFiles)) {
        if (file.size > MAX_AUDIO_FILE_SIZE) {
          setFormError(`File "${file.name}" exceeds the ${MAX_AUDIO_FILE_SIZE / (1024*1024)}MB limit. Please use a smaller file or contact support for larger file processing.`);
          setIsLoading(false);
          return;
        }
        if (file.size > LARGE_FILE_THRESHOLD) {
          console.warn(`Large file detected: ${file.name} (${(file.size / (1024*1024)).toFixed(1)}MB). Processing may take longer.`);
          toast({
            title: "Large File Detected",
            description: `${file.name} is ${(file.size / (1024*1024)).toFixed(1)}MB. Processing may take 10-20 minutes.`,
            duration: 5000,
          });
        }
        const audioDataUri = await fileToDataUrl(file);
        itemsToProcess.push({ name: file.name, audioDataUri });
      }
    } else {
      setFormError("Please provide at least one audio file to analyze.");
      setIsLoading(false);
      return;
    }

    setTotalFiles(itemsToProcess.length);
    const initialResults: HistoricalScoreItem[] = itemsToProcess.map((item, index) => ({
      id: `${uniqueIdPrefix}-${item.name}-${index}`,
      timestamp: new Date().toISOString(),
      module: 'Call Scoring',
      product: product,
      agentName: data.agentName,
      details: {
        fileName: item.name,
        status: 'Queued',
        audioDataUri: item.audioDataUri,
      }
    }));
    setResults(initialResults);
    setProgressItems(initialResults.map(item => ({
      id: item.id,
      fileName: item.details.fileName,
      step: 'Queued',
      status: 'queued',
      progress: 0,
      message: 'Waiting to start transcription',
    })));

    const completedActivitiesToLog: ActivityLogEntry[] = [];

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const itemId = `${uniqueIdPrefix}-${item.name}-${i}`;
      let finalScoreOutput: ScoreCallOutput | null = null;
      let finalError: string | undefined = undefined;
      
      const updateResultStatus = (status: HistoricalScoreItem['details']['status'], updates: Partial<HistoricalScoreItem['details']> = {}) => {
        setResults(prev => prev.map(r => r.id === itemId ? { ...r, details: { ...r.details, ...updates, status } } : r));
      };
      
      setCurrentFileIndex(i + 1);
      updateProgress(itemId, {
        step: 'Transcribing audio',
        status: 'running',
        progress: 20,
        message: 'Uploading audio & requesting transcript',
      });
      
      try {
        // Step 1: Transcription
        setCurrentStatus('Transcribing...');
        updateResultStatus('Transcribing');
        const transcriptionResponse = await fetch('/api/transcription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioDataUri: item.audioDataUri }),
        });
        if (!transcriptionResponse.ok) {
          throw new Error('Transcription API failed');
        }
        const transcriptionResult = await transcriptionResponse.json() as TranscriptionOutput;

        // Format the transcript using standard utility
        const diarizedTranscript = formatTranscriptSegments(transcriptionResult);

        const accuracyAssessment = transcriptionResult.summary.overview.includes('Error') ? 'Error' : 'High';

        updateProgress(itemId, {
          step: 'Analyzing transcript',
          status: 'running',
          progress: 55,
          message: 'Transcription complete, preparing scoring request',
        });

        if (accuracyAssessment === "Error" || diarizedTranscript.includes("[Critical Transcription System Error")) {
          throw new Error(`Transcription failed: ${diarizedTranscript}`);
        }

        // Step 2: Scoring
        setCurrentStatus('Scoring...');
        updateResultStatus('Scoring');

        const scoreInput = {
          product,
          agentName: data.agentName,
          audioDataUri: item.audioDataUri,
          transcriptOverride: diarizedTranscript,
          productContext,
          brandUrl: productObject.brandUrl,
        };

        const response = await fetch('/api/call-scoring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scoreInput),
        });
        if (!response.ok) {
          throw new Error(`Call Scoring API failed: ${response.statusText}`);
        }
        finalScoreOutput = await response.json() as ScoreCallOutput;
        updateProgress(itemId, {
          step: 'Scoring insights',
          status: 'running',
          progress: 85,
          message: 'Aggregating rubric scores and insights',
        });

        // Ensure the final transcript from scoring is the one from the transcription step.
        if (finalScoreOutput) {
          finalScoreOutput.transcript = diarizedTranscript;
          finalScoreOutput.transcriptAccuracy = accuracyAssessment;
        } else {
          throw new Error("Scoring function returned undefined result");
        }

        if (finalScoreOutput.callCategorisation === "Error") {
          throw new Error(finalScoreOutput.summary);
        }
        
        updateResultStatus('Complete', { scoreOutput: finalScoreOutput });
        updateProgress(itemId, {
          step: 'Completed',
          status: 'success',
          progress: 100,
          message: `Overall score: ${finalScoreOutput.overallScore?.toFixed?.(1) || finalScoreOutput.overallScore}`,
        });
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        finalError = errorMessage || "An unexpected error occurred.";
        
        finalScoreOutput = {
          transcript: (errorMessage.includes("Transcription failed:") ? errorMessage : `[Error processing ${item.name}. Raw Error: ${finalError}]`),
          transcriptAccuracy: "System Error",
          overallScore: 0, callCategorisation: "Error", summary: `Processing failed: ${finalError}`,
          strengths: [], areasForImprovement: [`Investigate and resolve the processing error.`],
          redFlags: [`System-level error during processing: ${finalError?.substring(0,100) || 'Unknown error'}...`],
          metricScores: [], improvementSituations: [], conversionReadiness: 'Low', suggestedDisposition: "Error",
          callDisposition: "Error",
          evidence: []
        };
        updateResultStatus('Failed', { error: finalError, scoreOutput: finalScoreOutput });
        updateProgress(itemId, {
          step: 'Failed',
          status: 'failed',
          progress: 100,
          message: finalError,
        });
        
        const lowerCaseError = (finalError || '').toLowerCase();
        if (lowerCaseError.includes('429') || lowerCaseError.includes('quota') || lowerCaseError.includes('rate limit')) {
          toast({
            variant: 'destructive', title: 'API Rate Limit Reached',
            description: `The AI is busy or the daily quota has been met. Stopping batch.`, duration: 7000,
          });
          completedActivitiesToLog.push({
            id: itemId, module: 'Call Scoring', product, agentName: data.agentName, timestamp: new Date().toISOString(),
            details: { fileName: item.name, status: 'Failed', agentNameFromForm: data.agentName, scoreOutput: finalScoreOutput, error: finalError }
          });
          break; // Stop the whole batch on a quota error.
        }
      } finally {
         completedActivitiesToLog.push({
            id: itemId, module: 'Call Scoring', product, agentName: data.agentName, timestamp: new Date().toISOString(),
            details: {
              fileName: item.name, status: finalError ? 'Failed' : 'Complete',
              agentNameFromForm: data.agentName, scoreOutput: finalScoreOutput, error: finalError || undefined
            }
         });
      }
    }
    
    // Batch log all completed activities at once
    if (completedActivitiesToLog.length > 0) {
      logBatchActivities(completedActivitiesToLog);
    }

    setIsLoading(false);
    setCurrentStatus('');
    toast({ title: "All jobs finished or stopped", description: `Finished processing all submitted item(s). Check table for results.` });
  };
  
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Call Scoring" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col items-center space-y-6">
        <CallScoringForm 
          onSubmit={handleAnalyzeCall} 
          isLoading={isLoading} 
          disabled={isOpenSourceVersion}
          disabledReason="This action relies on proprietary AI services. Use the Completely Working Version build to enable scoring."
        />
        {isOpenSourceVersion && (
          <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-900">
            <AlertTitle>Open Source limitation</AlertTitle>
            <AlertDescription>
              Call scoring is unavailable because it depends on paid AI providers (transcription + rubric scoring). Switch the App Version dropdown to “Completely Working Version” to re-enable this workflow.
            </AlertDescription>
          </Alert>
        )}
        {isLoading && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <LoadingSpinner size={32} />
            <p className="text-muted-foreground">
              {totalFiles > 1 ? `Processing ${currentFileIndex} of ${totalFiles}: ${currentStatus}` : `${currentStatus || 'Processing...'}`}
            </p>
          </div>
        )}
        {formError && !isLoading && ( 
          <Alert variant="destructive" className="mt-4 max-w-lg">
            <Terminal className="h-4 w-4" />
            <AlertTitle>An Error Occurred</AlertTitle>
             <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" className="border-b-0">
                  <AccordionTrigger className="p-0 hover:no-underline text-sm [&_svg]:ml-1">A validation error occurred. Click to view details.</AccordionTrigger>
                  <AccordionContent className="pt-2">
                      <pre className="text-xs whitespace-pre-wrap break-all bg-destructive/10 p-2 rounded-md font-mono">{formError}</pre>
                  </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Alert>
        )}
        {results.length > 0 && (
          <CallScoringResultsTable results={results} progressById={progressById} />
        )}
         {results.length === 0 && !isLoading && !formError && (
          <Card className="w-full max-w-lg shadow-xs">
            <CardHeader>
                <CardTitle className="text-lg flex items-center">
                    <ListChecks className="h-5 w-5 mr-2 text-accent"/>
                    How to Use AI Call Scoring
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                    1. Upload one or more audio files (up to 100MB each). The system will process them one by one.
                </p>
                <p>
                    2. Select a <strong>Product Focus</strong>. The AI uses the product&#39;s description and its linked Knowledge Base entries as context for scoring.
                </p>
                <p>
                    3. Optionally, enter the <strong>Agent Name</strong>.
                </p>
                <div>
                  <p>                <p>
                    4. Click <strong>Score Call(s)</strong>. The process will start immediately. The AI will first transcribe the audio and then score it based on both the content and tonality. For large files (50MB+), processing may take 10-20 minutes per file. Please wait for it to complete.
                </p></p>
                </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

    
