
"use client";

import { useState, useId } from 'react';
import type { DataAnalysisInput, DataAnalysisReportOutput } from '@/types';
import { DataAnalysisForm, DataAnalysisFormValues } from '@/components/features/data-analysis/data-analysis-form';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { PageHeader } from '@/components/layout/page-header';
import { DataAnalysisResultsCard } from '@/components/features/data-analysis/data-analysis-results-card';
import type { ActivityLogEntry } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";


export interface AnalysisReportResultItem {
  id: string;
  userAnalysisPrompt: string;
  fileDetails: DataAnalysisInput['fileDetails'];
  analysisOutput: DataAnalysisReportOutput;
  error?: string;
}

const MAX_TEXT_CONTENT_SAMPLE_LENGTH = 10000;

export default function DataAnalysisPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisReportResultItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null); 
  const [selectedFileCountInForm, setSelectedFileCountInForm] = useState(0);


  const { toast } = useToast();
  const { logActivity } = useActivityLogger(); 
  const uniqueIdPrefix = useId();

  const handleGenerateAnalysis = async (formValues: DataAnalysisFormValues) => {
    setIsLoading(true);
    setFormError(null);
    setAnalysisResult(null); 

    const files = Array.from(formValues.analysisFiles);
    setSelectedFileCountInForm(files.length);
    
    let sampledFileContent: string | undefined = undefined;
    const fileDetailsForFlow: DataAnalysisInput['fileDetails'] = files.map(file => ({
        fileName: file.name,
        fileType: file.type || "unknown"
    }));

    // Try to get a sample from the first text-based file
    const firstTextFile = files.find(f => f.type === 'text/csv' || f.type === 'text/plain' || f.name.toLowerCase().endsWith('.txt') || f.name.toLowerCase().endsWith('.csv'));
    if (firstTextFile) {
      try {
        const text = await firstTextFile.text();
        sampledFileContent = text.substring(0, MAX_TEXT_CONTENT_SAMPLE_LENGTH);
      } catch (error) {
        console.error(`Error reading content sample for ${firstTextFile.name}:`, error);
        // Non-fatal, proceed without sample if read fails
      }
    }

    const flowInput: DataAnalysisInput = {
        fileDetails: fileDetailsForFlow,
        userAnalysisPrompt: formValues.userAnalysisPrompt,
        sampledFileContent: sampledFileContent
    };

    try {
      const response = await fetch('/api/data-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flowInput),
      });
      if (!response.ok) {
        throw new Error(`Data Analysis API failed: ${response.statusText}`);
      }
      const result = await response.json(); 
      
      const resultItem: AnalysisReportResultItem = {
          id: `${uniqueIdPrefix}-analysis`,
          userAnalysisPrompt: flowInput.userAnalysisPrompt,
          fileDetails: flowInput.fileDetails,
          analysisOutput: result,
      };
      
      if (result.reportTitle.startsWith("Data Analysis Failed") || result.reportTitle.startsWith("Critical System Error")) {
        setFormError(result.executiveSummary || "An AI error occurred during analysis.");
        setAnalysisResult(null);
        toast({
            variant: "destructive",
            title: result.reportTitle,
            description: "The AI model encountered an issue. See error details below.",
            duration: 7000,
        });
      } else {
        setAnalysisResult(resultItem);
        toast({
            title: "Data Analysis Complete!",
            description: "Your analysis report is ready.",
        });
      }

      logActivity({ 
        module: "Data Analysis",
        details: {
          inputData: flowInput,
          analysisOutput: result,
          error: result.reportTitle.includes("Failed") || result.reportTitle.includes("Error") ? result.executiveSummary : undefined
        }
      });

    } catch (e) {
      console.error(`Error generating analysis report:`, e);
      const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred during analysis generation.";
      setFormError(errorMessage);
      
      const errorOutput: DataAnalysisReportOutput = { 
          reportTitle: `Error Generating Analysis Report`,
          executiveSummary: "Failed to generate.",
          keyMetrics: [],
          detailedAnalysis: {
            dataReconstructionAndNormalizationSummary: "Error during analysis.",
            smartTableRecognitionSummary: "Error during analysis."
          },
          recommendations: [{area: "Error", recommendation: errorMessage, justification: "N/A"}],
          limitationsAndDisclaimer: `An error occurred: ${errorMessage}`,
      };
      const errorItem: AnalysisReportResultItem = {
          id: `${uniqueIdPrefix}-error`,
          userAnalysisPrompt: flowInput.userAnalysisPrompt,
          fileDetails: flowInput.fileDetails,
          error: errorMessage,
          analysisOutput: errorOutput
      };
      setAnalysisResult(errorItem); 
      
      logActivity({
        module: "Data Analysis",
        details: {
           inputData: flowInput,
           error: errorMessage,
           analysisOutput: errorOutput
        }
      });
      toast({
        variant: "destructive",
        title: `Error Generating Analysis`,
        description: "An unexpected error occurred. See details below.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Data Analyst" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col items-center space-y-6">
        <DataAnalysisForm
            onSubmit={handleGenerateAnalysis} 
            isLoading={isLoading}
            selectedFileCount={selectedFileCountInForm} 
        />
        {isLoading && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <LoadingSpinner size={32} />
            <p className="text-muted-foreground">
             Generating your analysis report...
            </p>
          </div>
        )}
        {formError && !isLoading && ( 
          <Alert variant="destructive" className="mt-4 max-w-lg">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Analysis Generation Error</AlertTitle>
             <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1" className="border-b-0">
                    <AccordionTrigger className="p-0 hover:no-underline text-sm [&_svg]:ml-1">An error occurred. Click to view details.</AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <pre className="text-xs whitespace-pre-wrap break-all bg-destructive/10 p-2 rounded-md font-mono">{formError}</pre>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
          </Alert>
        )}
        {!isLoading && analysisResult && !formError && (
           <div className="w-full max-w-4xl space-y-6 mt-4">
             <DataAnalysisResultsCard
               key={analysisResult.id}
               reportOutput={analysisResult.analysisOutput}
               userAnalysisPrompt={analysisResult.userAnalysisPrompt}
               fileContext={analysisResult.fileDetails}
             />
           </div>
        )}
        {!isLoading && !analysisResult && !formError && (
          <Card className="w-full max-w-2xl shadow-xs">
            <CardHeader>
                <CardTitle className="text-lg flex items-center">
                    <Brain className="h-5 w-5 mr-2 text-accent"/>
                    How the AI Data Analyst Works
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                    The AI Data Analyst helps you derive insights from your data files (like Excel, CSVs, or text-based reports).
                    It <strong>does not directly process the full binary content</strong> of large files like Excel or PDFs. Instead, it intelligently works based on:
                </p>
                <ul className="list-disc list-inside pl-4 space-y-1">
                    <li><strong>Your Detailed Prompt:</strong> This is the most crucial input. Describe:
                        <ul className="list-circle list-inside pl-5 text-xs">
                            <li>The files you've "uploaded" (their names & types are context).</li>
                            <li>The likely structure of data within those files (e.g., sheet names, column headers, data types like numeric/text/date, date formats).</li>
                            <li>Any specific decoding rules for coded fields (e.g., "NR" = Not Reachable, "CALLB" = Call Back, "INT" = Interested).</li>
                            <li>Specific file mappings if relevant (e.g., "My file 'sales_oct.xlsx' is the 'Monthly Revenue Tracker for Oct'").</li>
                            <li>Your specific analytical goals for *this* analysis run (e.g., "Focus on Q1 trends for conversion rates," "Identify top 3 performing agents based on revenue described in MIS").</li>
                            <li>Any known "messiness" in the data (e.g., misaligned headers, merged rows) so the AI can simulate cleaning steps.</li>
                        </ul>
                    </li>
                    <li><strong>File Metadata:</strong> The names and types of the files you "upload" are sent to the AI.</li>
                    <li><strong>Text Sample (Optional):</strong> If one of your primary files is a CSV or TXT, a small sample of its content (first ~10k characters) can be sent for more direct initial observations.</li>
                </ul>
                <p className="mt-2">
                    The AI then simulates data cleaning, interpretation, and analysis based on your textual descriptions to generate a comprehensive report covering trends, performance, and recommendations.
                </p>
                <p className="font-semibold mt-2 text-foreground">
                    The accuracy and depth of the analysis are directly proportional to the detail and clarity of your prompt.
                </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
