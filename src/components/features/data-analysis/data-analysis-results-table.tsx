
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
import { Badge } from "@/components/ui/badge";
import { Eye, AlertTriangle, CheckCircle, FileSearch } from 'lucide-react';
import type { DataAnalysisReportOutput, DataAnalysisInput } from "@/types";
import { DataAnalysisResultsCard } from './data-analysis-results-card'; 

export interface AnalyzedFileResultItem {
  id: string;
  fileName: string;
  userDescription?: string;
  analysisOutput: DataAnalysisReportOutput;
  inputData: DataAnalysisInput;
  error?: string; 
}

interface DataAnalysisResultsTableProps {
  results: AnalyzedFileResultItem[];
}

export function DataAnalysisResultsTable({ results }: DataAnalysisResultsTableProps) {
  const [selectedResult, setSelectedResult] = useState<AnalyzedFileResultItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleViewDetails = (result: AnalyzedFileResultItem) => {
    setSelectedResult(result);
    setIsDialogOpen(true);
  };
  
  return (
    <>
      <div className="w-full max-w-5xl mt-8 shadow-lg rounded-lg border bg-card">
        <div className="p-6">
            <h2 className="text-xl font-semibold text-primary">Data Analysis Summary</h2>
            <p className="text-sm text-muted-foreground">Analysis results for {results.length} file(s).</p>
        </div>
        <ScrollArea className="h-[calc(100vh-450px)] md:h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-xs">
              <TableRow>
                <TableHead className="w-[50px]">SNo.</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Analysis Title</TableHead>
                <TableHead className="text-center w-[100px]">Status</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead> 
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No analysis results to display.
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result, index) => (
                  <TableRow key={result.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium max-w-xs truncate" title={result.fileName}>
                      <FileSearch className="inline-block mr-2 h-4 w-4 text-muted-foreground" />
                      {result.fileName}
                    </TableCell>
                    <TableCell className="max-w-sm truncate" title={result.analysisOutput.reportTitle}>
                        {result.analysisOutput.reportTitle}
                    </TableCell>
                    <TableCell className="text-center">
                      {result.error ? (
                          <Badge variant="destructive" className="cursor-default text-xs" title={result.error}>
                              <AlertTriangle className="mr-1 h-3 w-3" /> Error
                          </Badge>
                      ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300 text-xs">
                            <CheckCircle className="mr-1 h-3 w-3" /> Analyzed
                          </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewDetails(result)}
                          title={"View Full Analysis Report"}
                      >
                        <Eye className="mr-1.5 h-4 w-4" /> Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {selectedResult && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl min-h-[70vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Detailed Data Analysis Report</DialogTitle>
                <DialogDescription>
                    File: {selectedResult.fileName}
                    {selectedResult.userDescription && ` | User Goal: ${selectedResult.userDescription}`}
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-6">
                <DataAnalysisResultsCard 
                    reportOutput={selectedResult.analysisOutput}
                    userAnalysisPrompt={selectedResult.inputData.userAnalysisPrompt}
                    fileContext={selectedResult.inputData.fileDetails}
                />
              </div>
            </ScrollArea>
            <DialogFooter className="p-4 border-t bg-muted/50">
              <Button onClick={() => setIsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
