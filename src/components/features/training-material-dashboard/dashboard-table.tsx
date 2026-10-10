
"use client";

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowUpDown, FileText, BookOpen, LayoutList, Download, Copy, Settings, AlertCircle, BookOpenText, File } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { ActivityLogEntry, HistoricalMaterialItem, TrainingMaterialActivityDetails, GenerateTrainingDeckInput, GenerateTrainingDeckOutput, TrainingDeckFlowKnowledgeBaseItem } from '@/types'; 
import { useToast } from '@/hooks/use-toast';
import { exportTextContentToPdf } from '@/lib/pdf-utils';
import { exportPlainTextFile, exportToCsv, exportTableDataToPdf, exportTableDataForDoc } from '@/lib/export';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useProductContext } from '@/hooks/useProductContext';


interface TrainingMaterialDashboardTableProps {
  history: HistoricalMaterialItem[];
}

type SortKey = keyof HistoricalMaterialItem['details']['inputData'] | 'timestamp' | 'module' | 'deckTitle' | 'sourceDescriptionForAi' | null;
type SortDirection = 'asc' | 'desc';


export function TrainingMaterialDashboardTable({ history }: TrainingMaterialDashboardTableProps) {
  const [selectedItem, setSelectedItem] = useState<HistoricalMaterialItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { selectedProduct } = useProductContext();

  const handleViewDetails = (item: HistoricalMaterialItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const formatMaterialForTextExport = (material: GenerateTrainingDeckOutput, inputData: GenerateTrainingDeckInput): string => {
    const materialType = inputData.deckFormatHint === "Brochure" ? "Brochure" : "Deck";
    let output = `${materialType} Title: ${material.deckTitle}\n\n`;
    output += `Product: ${inputData.product}\n`;
    output += `Format: ${inputData.deckFormatHint}\n`;
    output += `Context Source Description: ${inputData.sourceDescriptionForAi || (inputData.generateFromAllKb ? 'Entire KB' : `${inputData.knowledgeBaseItems.length} selected KB items/uploads`)}\n`;
    if (inputData.knowledgeBaseItems && inputData.knowledgeBaseItems.length > 0) {
      output += `Context Item Names (and Text if applicable):\n${inputData.knowledgeBaseItems.map((item: TrainingDeckFlowKnowledgeBaseItem) => {
        let itemDesc = `  - ${item.name} (${item.isTextEntry ? 'Text' : item.fileType || 'File'})`;
        if (item.textContent) {
          itemDesc += `\n    Text Content (excerpt): ${item.textContent.substring(0,100)}...`;
        }
        return itemDesc;
      }).join('\n')}\n\n`;
    }


    material.sections.forEach((section: GenerateTrainingDeckOutput['sections'][number], index) => {
      output += `--------------------------------------------------\n`;
      output += `${inputData.deckFormatHint === "Brochure" ? "Panel/Section" : "Slide"} ${index + 1}: ${section.title}\n`;
      output += `--------------------------------------------------\n`;
      output += `${section.content}\n\n`;
      if (section.notes) {
        output += `${inputData.deckFormatHint === "Brochure" ? "Internal Notes/Suggestions" : "Speaker Notes"}:\n${section.notes}\n\n`;
      }
    });
    return output;
  };

  const handleDownloadMaterial = (item: HistoricalMaterialItem, formatType: "pdf" | "doc") => {
    if (!item.details.materialOutput || item.details.error) {
      toast({ variant: "destructive", title: "Download Error", description: "Material content is not available due to a generation error." });
      return;
    }
    
    const material = item.details.materialOutput;
    const inputData = item.details.inputData;
    // Use the original generated format hint for consistent naming, even if downloading as a different type (e.g. PDF of a PPT outline)
    const originalFormatHint = inputData.deckFormatHint; 
    const materialTypeName = originalFormatHint === "Brochure" ? "Brochure" : (originalFormatHint === "PDF" ? "Document" : "Outline");
    
    const filenameBase = `Training_${materialTypeName}_${inputData.product.replace(/\s+/g, '_')}_${format(parseISO(item.timestamp), 'yyyyMMddHHmmss')}`;
    const textContent = formatMaterialForTextExport(material, inputData);

    if (formatType === "pdf") {
      const pdfFilename = `${filenameBase}.pdf`;
      exportTextContentToPdf(textContent, pdfFilename);
      toast({ title: `${originalFormatHint} Content Exported as PDF`, description: `${pdfFilename} has been downloaded.` });
    } else if (formatType === "doc") {
      const docFilename = `${filenameBase}.doc`;
      exportPlainTextFile(docFilename, textContent);
      toast({ title: `${originalFormatHint} Content Exported as Text for Word (.doc)`, description: `${docFilename} has been downloaded.` });
    }
  };

  const handleCopyToClipboard = (item: HistoricalMaterialItem) => {
    if (!item.details.materialOutput || item.details.error) {
      toast({ variant: "destructive", title: "Copy Error", description: "Material content not available." });
      return;
    }
    const textContent = formatMaterialForTextExport(item.details.materialOutput, item.details.inputData);
    navigator.clipboard.writeText(textContent)
      .then(() => toast({ title: "Success", description: "Material content copied to clipboard!" }))
      .catch(() => toast({ variant: "destructive", title: "Error", description: "Failed to copy material content." }));
  };
  
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
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-1 h-3 w-3 inline transform rotate-180" /> : <ArrowUpDown className="ml-1 h-3 w-3 inline" />;
  };

  const sortedHistory = useMemo(() => {
    return [...history]
      .filter(item => item.product === selectedProduct)
      .sort((a, b) => {
        let valA: number | string | undefined;
        let valB: number | string | undefined;

        switch (sortKey) {
          case 'deckFormatHint':
            valA = a.details.inputData.deckFormatHint;
            valB = b.details.inputData.deckFormatHint;
            break;
          case 'deckTitle':
            valA = a.details.materialOutput?.deckTitle || (a.details.error ? 'Error' : '');
            valB = b.details.materialOutput?.deckTitle || (b.details.error ? 'Error' : '');
            break;
          case 'sourceDescriptionForAi':
            valA = a.details.inputData.sourceDescriptionForAi || (a.details.inputData.generateFromAllKb ? 'Entire KB' : `${a.details.inputData.knowledgeBaseItems.length} items`);
            valB = b.details.inputData.sourceDescriptionForAi || (b.details.inputData.generateFromAllKb ? 'Entire KB' : `${b.details.inputData.knowledgeBaseItems.length} items`);
            break;
          case 'timestamp':
            valA = new Date(a.timestamp).getTime();
            valB = new Date(b.timestamp).getTime();
            break;
          default:
            return 0;
        }

        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else {
          if (valA === undefined || valA === null) comparison = -1;
          else if (valB === undefined || valB === null) comparison = 1;
        }
        return sortDirection === 'desc' ? comparison * -1 : comparison;
      });
  }, [history, sortKey, sortDirection, selectedProduct]);


  return (
    <>
      <div className="w-full mt-2 shadow-lg rounded-lg border bg-card">
        <ScrollArea className="h-[calc(100vh-280px)] md:h-[calc(100vh-250px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-xs z-10">
              <TableRow>
                <TableHead onClick={() => requestSort('deckTitle')} className="cursor-pointer">Material Title {getSortIndicator('deckTitle')}</TableHead>
                <TableHead onClick={() => requestSort('deckFormatHint')} className="cursor-pointer">Format {getSortIndicator('deckFormatHint')}</TableHead>
                <TableHead onClick={() => requestSort('sourceDescriptionForAi')} className="cursor-pointer max-w-[200px]">Context Source {getSortIndicator('sourceDescriptionForAi')}</TableHead>
                <TableHead onClick={() => requestSort('timestamp')} className="cursor-pointer">Date Created {getSortIndicator('timestamp')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No training materials generated for '{selectedProduct}' yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={item.details.materialOutput?.deckTitle || item.details.inputData.product}>
                      {item.details.error ? (
                        <Badge variant="destructive">Error Generating</Badge>
                      ) : (
                        <>
                          {item.details.inputData.deckFormatHint === "Brochure" ? <LayoutList className="inline-block mr-2 h-4 w-4 text-muted-foreground"/> : <BookOpen className="inline-block mr-2 h-4 w-4 text-muted-foreground"/>}
                          {item.details.materialOutput?.deckTitle || "Untitled Material"}
                        </>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{item.details.inputData.deckFormatHint}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={item.details.inputData.sourceDescriptionForAi || (item.details.inputData.generateFromAllKb ? 'Entire KB' : `${item.details.inputData.knowledgeBaseItems.length} items`)}>
                      {item.details.inputData.sourceDescriptionForAi || (item.details.inputData.generateFromAllKb ? 'Entire KB' : `${item.details.inputData.knowledgeBaseItems.length} KB items / uploads`)}
                    </TableCell>
                    <TableCell>{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                    <TableCell className="text-right space-x-1">
                       <Button variant="ghost" size="icon" onClick={() => handleCopyToClipboard(item)} disabled={!!item.details.error || !item.details.materialOutput} title={item.details.error ? "Cannot copy, error in generation" : "Copy Material Content"} className="h-8 w-8">
                        <Copy className="h-4 w-4" />
                      </Button>
                       <Button variant="ghost" size="icon" onClick={() => handleDownloadMaterial(item, "pdf")} disabled={!!item.details.error || !item.details.materialOutput} title={item.details.error ? "Cannot download, error in generation" : "Download Content as PDF"} className="h-8 w-8">
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadMaterial(item, "doc")} disabled={!!item.details.error || !item.details.materialOutput} title={item.details.error ? "Cannot download, error in generation" : "Download Content as Text for Word (.doc)"} className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(item)} title={"View Generated Material & Inputs"}>
                        <Eye className="mr-1.5 h-4 w-4" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {selectedItem && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl min-h-[70vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Generated Training Material Details</DialogTitle>
                <DialogDesc>
                    Material: {selectedItem.details.materialOutput?.deckTitle || "N/A"} (Created: {format(parseISO(selectedItem.timestamp), 'PP p')})
                </DialogDesc>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-6 space-y-4">
                {selectedItem.details.error ? (
                     <div className="space-y-3 text-sm text-destructive bg-destructive/10 p-4 rounded-md">
                        <p className="font-semibold text-lg">Error During Material Generation:</p>
                        <Label className="font-medium">Input Parameters:</Label>
                        <pre className="p-2 bg-background/50 rounded-md text-xs whitespace-pre-wrap break-all">
                            {`Product: ${selectedItem.details.inputData.product}\nFormat: ${selectedItem.details.inputData.deckFormatHint}\nContext Source: ${selectedItem.details.inputData.sourceDescriptionForAi || (selectedItem.details.inputData.generateFromAllKb ? 'Entire KB' : `${selectedItem.details.inputData.knowledgeBaseItems.length} KB items/uploads`)}`}
                        </pre>
                        <p><strong>Error Message:</strong> {selectedItem.details.error}</p>
                    </div>
                ) : selectedItem.details.materialOutput ? (
                    <>
                        <div>
                            <h4 className="font-semibold text-md text-muted-foreground mb-2 flex items-center">
                               <Settings className="mr-2 h-5 w-5 text-accent"/>Input Parameters
                            </h4>
                            <div className="p-3 bg-muted/10 rounded-md text-sm space-y-2">
                               <p><strong>Product:</strong> {selectedItem.details.inputData.product}</p>
                               <p><strong>Format:</strong> {selectedItem.details.inputData.deckFormatHint}</p>
                               <p><strong>AI Context Source Description:</strong> {selectedItem.details.inputData.sourceDescriptionForAi || (selectedItem.details.inputData.generateFromAllKb ? 'Entire KB for product' : `${selectedItem.details.inputData.knowledgeBaseItems.length} selected KB items / direct uploads`)}</p>
                               {selectedItem.details.inputData.knowledgeBaseItems && selectedItem.details.inputData.knowledgeBaseItems.length > 0 && (
                                   <div>
                                       <Label className="font-medium text-xs">Context Items Provided to AI:</Label>
                                       <ScrollArea className="h-32 mt-1 rounded-md border p-2 bg-background/50">
                                           <ul className="space-y-2 text-xs">
                                                {selectedItem.details.inputData.knowledgeBaseItems.map((kbItem: TrainingDeckFlowKnowledgeBaseItem, idx: number) => (
                                                    <li key={idx} className="border-l-2 border-primary pl-2 pb-2">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                          <span className="font-medium">{kbItem.name}</span>
                                                          {kbItem.fileDataUri && (
                                                            <Button
                                                              variant="ghost"
                                                              size="sm"
                                                              className="h-6 px-2"
                                                              onClick={() => {
                                                                const link = document.createElement('a');
                                                                link.href = kbItem.fileDataUri!;
                                                                link.download = kbItem.name;
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                                toast({ title: "Download Started", description: `Downloading ${kbItem.name}` });
                                                              }}
                                                            >
                                                              <Download className="h-3 w-3 mr-1" />
                                                              Download
                                                            </Button>
                                                          )}
                                                        </div>
                                                        <span className="text-muted-foreground">({kbItem.isTextEntry ? 'Text Entry' : kbItem.fileType || 'File Reference'})</span>
                                                        {kbItem.textContent && (
                                                            <Textarea value={kbItem.textContent.substring(0, 200) + (kbItem.textContent.length > 200 ? '...' : '')} readOnly rows={2} className="mt-1 text-xs bg-background/30"/>
                                                        )}
                                                    </li>
                                                ))}
                                           </ul>
                                       </ScrollArea>
                                   </div>
                               )}
                            </div>
                        </div>
                        <Separator />
                        <div>
                            <h4 className="font-semibold text-md text-muted-foreground mb-2 flex items-center">
                                {selectedItem.details.inputData.deckFormatHint === "Brochure" ? <LayoutList className="mr-2 h-5 w-5 text-accent"/> : <BookOpenText className="mr-2 h-5 w-5 text-accent"/>}
                                Generated Content ({selectedItem.details.materialOutput.deckTitle})
                            </h4>
                            <div className="border p-3 rounded-md bg-background">
                                {selectedItem.details.materialOutput.sections.map((section, index) => (
                                <div key={index} className="pb-3 mb-3 border-b last:border-b-0">
                                    <h5 className="font-medium text-md mb-1">{selectedItem.details.inputData.deckFormatHint === "Brochure" ? "Panel/Section" : "Slide"} {index + 1}: {section.title}</h5>
                                    <p className="text-sm text-muted-foreground whitespace-pre-line">{section.content}</p>
                                    {section.notes && <p className="text-xs text-accent-foreground/70 mt-1 italic">Notes: {section.notes}</p>}
                                </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <p className="text-muted-foreground">No material output available for this entry.</p>
                )}
                 <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                      <AlertCircle className="inline h-4 w-4 mr-1.5 align-text-bottom"/>
                      Note: Original uploaded files (PDF, DOCX, etc.) used as context are not stored with the activity log and cannot be re-downloaded from this dashboard. The AI generates content based on file names, types, and (for text-based files/prompts) their content.
                  </div>
              </div>
            </ScrollArea>
            <DialogFooter className="p-4 border-t bg-muted/50">
               {!selectedItem.details.error && selectedItem.details.materialOutput && (
                 <Button variant="outline" size="sm" onClick={() => handleCopyToClipboard(selectedItem)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy Content
                </Button>
               )}
              <Button onClick={() => setIsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
