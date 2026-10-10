
"use client";

import type { CombinedCallAnalysisReportOutput, IndividualCallScoreDataItem, ScoreCallOutput } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter as DialogFoot } from "@/components/ui/dialog";
import { CallScoringResultsCard } from '@/components/features/call-scoring/call-scoring-results-card'; 
import { exportTextContentToPdf } from '@/lib/pdf-utils';
import { exportPlainTextFile } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import {
  ListChecks, TrendingUp, ThumbsUp, PieChart, BarChartHorizontalBig,
  FileText, Eye, Copy, Download, Users, Activity, Sigma, ShieldAlert, PlayCircle
} from "lucide-react";

interface CombinedCallAnalysisResultsCardProps {
  report: CombinedCallAnalysisReportOutput;
  individualScores: IndividualCallScoreDataItem[];
}

export function CombinedCallAnalysisResultsCard({ report, individualScores }: CombinedCallAnalysisResultsCardProps) {
  const [selectedIndividualCall, setSelectedIndividualCall] = useState<ScoreCallOutput | null>(null);
  const [selectedIndividualFileName, setSelectedIndividualFileName] = useState<string | null>(null);
  const [selectedAudioDataUri, setSelectedAudioDataUri] = useState<string | undefined>();
  const [isIndividualCallDialogOpen, setIsIndividualCallDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleViewIndividualCall = (fileName: string) => {
    const individualData = individualScores.find(item => item.fileName === fileName);
    if (individualData) {
      setSelectedIndividualCall(individualData.scoreOutput);
      setSelectedIndividualFileName(individualData.fileName);
      setSelectedAudioDataUri(individualData.audioDataUri);
      setIsIndividualCallDialogOpen(true);
    } else {
      toast({ variant: "destructive", title: "Error", description: "Could not find details for the selected call." });
    }
  };

  const formatCombinedReportForTextExport = (): string => {
    let output = `Combined Call Analysis Report: ${report.reportTitle}\n`;
    output += `Product Focus: ${report.productFocus}\n`;
    output += `Number of Calls Analyzed: ${report.numberOfCallsAnalyzed}\n`;
    if (report.averageOverallScore !== undefined) {
      output += `Average Overall Score: ${report.averageOverallScore.toFixed(1)}/5\n`;
    }
    if (report.overallBatchCategorization) {
      output += `Overall Batch Categorization: ${report.overallBatchCategorization}\n\n`;
    }

    output += `--- Executive Summary ---\n${report.batchExecutiveSummary}\n\n`;

    output += "--- Common Strengths Observed ---\n";
    report.commonStrengthsObserved.forEach(strength => output += `- ${strength}\n`);
    output += "\n";

    output += "--- Common Areas For Improvement ---\n";
    report.commonAreasForImprovement.forEach(area => output += `- ${area}\n`);
    output += "\n";
    
    if (report.commonRedFlags && report.commonRedFlags.length > 0) {
        output += "--- Common Red Flags Observed ---\n";
        report.commonRedFlags.forEach(flag => output += `- ${flag}\n`);
        output += "\n";
    }

    output += "--- Key Themes & Trends ---\n";
    report.keyThemesAndTrends.forEach(theme => {
      output += `Theme: ${theme.theme}\nDescription: ${theme.description}\n`;
      if (theme.frequency) output += `Frequency: ${theme.frequency}\n`;
      output += "---\n";
    });
    output += "\n";

    output += "--- Metric Performance Summary ---\n";
    report.metricPerformanceSummary.forEach(metric => {
      output += `Metric: ${metric.metricName}\nPerformance: ${metric.batchPerformanceAssessment}\n`;
      if (metric.averageScore !== undefined) output += `Average Score: ${metric.averageScore.toFixed(1)}/5\n`;
      if (metric.specificObservations) output += `Observations: ${metric.specificObservations}\n`;
      output += "---\n";
    });
    output += "\n";

    if (report.individualCallHighlights && report.individualCallHighlights.length > 0) {
      output += "--- Individual Call Highlights ---\n";
      report.individualCallHighlights.forEach(highlight => {
        output += `File: ${highlight.fileName}\nScore: ${highlight.overallScore.toFixed(1)}/5\nSummary: ${highlight.briefSummary}\n`;
        output += "---\n";
      });
    }
    return output;
  };

  const handleExport = (format: "pdf" | "doc") => {
    const textContent = formatCombinedReportForTextExport();
    const filenameBase = `CombinedCallAnalysis_${report.productFocus}_${report.numberOfCallsAnalyzed}calls`;
    if (format === "pdf") {
      exportTextContentToPdf(textContent, `${filenameBase}.pdf`);
      toast({title: "Exported as PDF", description: "Combined analysis report PDF downloaded."});
    } else {
      exportPlainTextFile(`${filenameBase}.doc`, textContent);
      toast({title: "Exported as DOC", description: "Combined analysis report DOC (text) downloaded."});
    }
  };
  
  const handleCopyToClipboard = () => {
    const textContent = formatCombinedReportForTextExport();
    navigator.clipboard.writeText(textContent)
      .then(() => toast({ title: "Copied to Clipboard", description: "Combined analysis report copied." }))
      .catch(err => toast({ variant: "destructive", title: "Copy Failed", description: err.message }));
  };

  const defaultAccordionItems = [
    "exec-summary",
    "strengths",
    "improvements",
    "themes-trends",
    "metric-performance",
  ];
  if (report.individualCallHighlights && report.individualCallHighlights.length > 0) {
    defaultAccordionItems.push("individual-highlights");
  }
  if (report.commonRedFlags && report.commonRedFlags.length > 0) {
    defaultAccordionItems.push("common-red-flags");
  }
  if (individualScores.length > 0) {
    defaultAccordionItems.push("all-individual-scores");
  }


  return (
    <>
      <Card className="w-full max-w-5xl shadow-xl mt-6">
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-y-2">
            <div>
              <CardTitle className="text-2xl text-primary flex items-center">
                <PieChart className="mr-3 h-7 w-7" /> {report.reportTitle}
              </CardTitle>
              <CardDescription className="text-sm">
                Product: {report.productFocus} | Calls Analyzed: {report.numberOfCallsAnalyzed}
                {report.averageOverallScore !== undefined && ` | Avg. Score: ${report.averageOverallScore.toFixed(1)}/5`}
                {report.overallBatchCategorization && ` | Overall: ${report.overallBatchCategorization}`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyToClipboard}><Copy className="mr-1.5 h-4 w-4"/>Copy Report</Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("doc")}><Download className="mr-1.5 h-4 w-4"/>DOC</Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}><FileText className="mr-1.5 h-4 w-4"/>PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Accordion type="multiple" defaultValue={defaultAccordionItems} className="w-full space-y-1">
            <AccordionItem value="exec-summary">
              <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                <div className="flex items-center"><ListChecks className="mr-2 h-5 w-5 text-accent"/>Executive Summary</div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                <p className="whitespace-pre-line">{report.batchExecutiveSummary}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="strengths">
              <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                <div className="flex items-center"><ThumbsUp className="mr-2 h-5 w-5 text-accent"/>Common Strengths Observed</div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                {report.commonStrengthsObserved.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {report.commonStrengthsObserved.map((item, i) => <li key={`strength-${i}`}>{item}</li>)}
                  </ul>
                ) : <p className="italic">No common strengths specifically highlighted by the AI.</p>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="improvements">
              <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                <div className="flex items-center"><TrendingUp className="mr-2 h-5 w-5 text-accent"/>Common Areas for Improvement</div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                {report.commonAreasForImprovement.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {report.commonAreasForImprovement.map((item, i) => <li key={`improvement-${i}`}>{item}</li>)}
                  </ul>
                ) : <p className="italic">No common areas for improvement specifically highlighted by the AI.</p>}
              </AccordionContent>
            </AccordionItem>

            {report.commonRedFlags && report.commonRedFlags.length > 0 && (
                <AccordionItem value="common-red-flags">
                    <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-destructive/90 [&_svg]:mr-2">
                        <div className="flex items-center"><ShieldAlert className="mr-2 h-5 w-5 text-destructive"/>Common Red Flags Observed</div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 text-sm bg-destructive/10 p-3 rounded-b-md">
                        <ul className="list-disc pl-5 space-y-1 text-destructive">
                            {report.commonRedFlags.map((item, i) => <li key={`redflag-${i}`}>{item}</li>)}
                        </ul>
                    </AccordionContent>
                </AccordionItem>
            )}

            <AccordionItem value="themes-trends">
              <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                <div className="flex items-center"><BarChartHorizontalBig className="mr-2 h-5 w-5 text-accent"/>Key Themes & Trends</div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md space-y-3">
                {report.keyThemesAndTrends.length > 0 ? report.keyThemesAndTrends.map((item, i) => (
                  <div key={`theme-${i}`} className="p-2 border-l-2 border-secondary bg-background/30 rounded-r-sm">
                    <h4 className="font-medium text-sm text-secondary-foreground/90 mb-0.5">{item.theme}</h4>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    {item.frequency && <p className="text-xs text-muted-foreground/70 italic mt-0.5">Frequency: {item.frequency}</p>}
                  </div>
                )) : <p className="italic">No specific themes or trends highlighted.</p>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="metric-performance">
              <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                <div className="flex items-center"><Sigma className="mr-2 h-5 w-5 text-accent"/>Metric Performance Summary</div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md space-y-3">
                {report.metricPerformanceSummary.length > 0 ? report.metricPerformanceSummary.map((item, i) => (
                  <div key={`metric-summary-${i}`} className="p-2 border-l-2 border-primary bg-background/30 rounded-r-sm">
                    <h4 className="font-medium text-sm text-primary-foreground/90 mb-0.5">{item.metricName}</h4>
                    <p className="text-xs text-muted-foreground">Batch Performance: {item.batchPerformanceAssessment}</p>
                    {item.averageScore !== undefined && <p className="text-xs text-muted-foreground">Average Score: {item.averageScore.toFixed(1)}/5</p>}
                    {item.specificObservations && <p className="text-xs text-muted-foreground italic mt-0.5">Observations: {item.specificObservations}</p>}
                  </div>
                )) : <p className="italic">No specific metric performance summary provided.</p>}
              </AccordionContent>
            </AccordionItem>

            {report.individualCallHighlights && report.individualCallHighlights.length > 0 && (
              <AccordionItem value="individual-highlights">
                <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                    <div className="flex items-center"><Activity className="mr-2 h-5 w-5 text-accent"/>Individual Call Highlights</div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md space-y-2">
                  {report.individualCallHighlights.map((highlight, i) => (
                    <div key={`highlight-${i}`} className="p-2 border rounded-sm bg-background/40">
                      <h4 className="font-medium text-sm text-foreground/90 mb-0.5">File: {highlight.fileName} (Score: {highlight.overallScore.toFixed(1)}/5)</h4>
                      <p className="text-xs text-muted-foreground italic">{highlight.briefSummary}</p>
                       <Button variant="link" size="xs" className="p-0 h-auto mt-1 text-accent" onClick={() => handleViewIndividualCall(highlight.fileName)}>View Full Report</Button>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}
            
            {individualScores.length > 0 && (
                 <AccordionItem value="all-individual-scores">
                    <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&_svg]:mr-2">
                        <div className="flex items-center"><Users className="mr-2 h-5 w-5 text-accent"/>All Individual Call Scores ({individualScores.length})</div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-1 text-sm bg-muted/20 p-3 rounded-b-md">
                        <ScrollArea className="h-[200px] border rounded-md">
                            <ul className="p-2 space-y-1.5">
                            {individualScores.map((item, i) => (
                                <li key={`ind-score-${i}`} className="text-xs flex justify-between items-center gap-2 p-1.5 bg-background/50 rounded-sm">
                                    <div className="flex items-center gap-1.5 truncate flex-1">
                                      {item.audioDataUri && (
                                        <span title="Audio available" className="inline-flex">
                                          <PlayCircle className="h-3 w-3 text-primary shrink-0" />
                                        </span>
                                      )}
                                      <span className="truncate" title={item.fileName}>{item.fileName}</span>
                                    </div>
                                    <Badge variant={item.scoreOutput.callCategorisation === "Error" ? "destructive" : "secondary"} className="text-xs shrink-0">
                                        Score: {item.scoreOutput.overallScore.toFixed(1)}/5 ({item.scoreOutput.callCategorisation})
                                    </Badge>
                                    <Button variant="outline" size="xs" className="shrink-0" onClick={() => handleViewIndividualCall(item.fileName)}>View</Button>
                                </li>
                            ))}
                            </ul>
                        </ScrollArea>
                    </AccordionContent>
                </AccordionItem>
            )}
          </Accordion>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground pt-3 border-t mt-2">
          This combined analysis is AI-generated based on individual call reports. Review individual reports for full context where needed.
        </CardFooter>
      </Card>

      {selectedIndividualCall && selectedIndividualFileName && (
        <Dialog open={isIndividualCallDialogOpen} onOpenChange={setIsIndividualCallDialogOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl min-h-[70vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Individual Call Scoring Report</DialogTitle>
                <DialogDesc>
                    File: {selectedIndividualFileName}
                </DialogDesc>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-4 md:p-6">
                <CallScoringResultsCard 
                    results={selectedIndividualCall} 
                    fileName={selectedIndividualFileName}
                    audioDataUri={selectedAudioDataUri}
                    isHistoricalView={true}
                />
              </div>
            </ScrollArea>
            <DialogFoot className="p-4 border-t bg-muted/50">
              <Button onClick={() => setIsIndividualCallDialogOpen(false)}>Close</Button>
            </DialogFoot>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
