
"use client";

import React, { useState, useMemo, useEffect, ChangeEvent, useRef } from "react"; 
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKnowledgeBase } from "@/hooks/use-knowledge-base";
import type { KnowledgeFile } from "@/types";
import { BookOpen, FileText, UploadCloud, Settings2, FileType2, Briefcase, Download, Copy, LayoutList, InfoIcon as InfoIconLucide, FileUp, Eye, Edit3, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/types";
import type { GenerateTrainingDeckInput, GenerateTrainingDeckOutput, TrainingDeckFlowKnowledgeBaseItem } from "@/types";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { exportTextContentToPdf } from "@/lib/pdf-utils";
import { exportPlainTextFile } from "@/lib/export";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Alert as UiAlert, AlertDescription as UiAlertDescription, AlertTitle as UiAlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog"; 
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useProductContext } from "@/hooks/useProductContext";


type DeckFormat = "PDF" | "Word Doc" | "PPT" | "Brochure";
const DECK_FORMATS: DeckFormat[] = ["PDF", "Word Doc", "PPT", "Brochure"];

const MAX_DIRECT_UPLOAD_SIZE_TEXT = 50000; 
const MAX_TOTAL_UPLOAD_SIZE = 10 * 1024 * 1024; 

export default function CreateTrainingDeckPage() {
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const { availableProducts, getProductByName } = useProductContext();
  const [selectedKbFileIds, setSelectedKbFileIds] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined);
  const [selectedFormat, setSelectedFormat] = useState<DeckFormat | undefined>(DECK_FORMATS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedMaterial, setGeneratedMaterial] = useState<GenerateTrainingDeckOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const [isClient, setIsClient] = useState(false);
  const [directUploadFiles, setDirectUploadFiles] = useState<File[]>([]);
  const directUploadInputRef = useRef<HTMLInputElement>(null);
  const [isViewKbItemsDialogOpen, setIsViewKbItemsDialogOpen] = useState(false);
  const [directPrompt, setDirectPrompt] = useState<string>("");


  useEffect(() => {
    setIsClient(true);
    // Sync with global product selection on initial load if it exists
    const initialProduct = getProductByName(availableProducts[0]?.name);
    if(initialProduct) {
        setSelectedProduct(initialProduct.name);
    }
  }, [availableProducts, getProductByName]);

  useEffect(() => {
    // When the local product changes, filter the selected KB items
    setSelectedKbFileIds(prev =>
      prev.filter(id => {
        const file = knowledgeBaseFiles.find(f => f.id === id);
        return file && file.product === selectedProduct;
      })
    );
  }, [selectedProduct, knowledgeBaseFiles]);


  const selectedKnowledgeBaseItems = useMemo(() => {
    return knowledgeBaseFiles.filter(file => selectedKbFileIds.includes(file.id));
  }, [knowledgeBaseFiles, selectedKbFileIds]);

  const mapKbFilesToFlowItems = (items: KnowledgeFile[]): TrainingDeckFlowKnowledgeBaseItem[] => {
    return items.map(item => ({
        name: item.name,
        textContent: item.isTextEntry ? item.textContent : undefined, 
        isTextEntry: !!item.isTextEntry,
        fileType: item.isTextEntry ? 'text/plain' : item.type,
    }));
  };

  const mapDirectUploadsToFlowItems = async (uploads: File[]): Promise<TrainingDeckFlowKnowledgeBaseItem[]> => {
    const flowItems: TrainingDeckFlowKnowledgeBaseItem[] = [];
    for (const file of uploads) {
        let textContent: string | undefined = undefined;
        if (file.type.startsWith('text/') && file.size < MAX_DIRECT_UPLOAD_SIZE_TEXT) {
            try {
                textContent = await file.text();
            } catch (e) {
                console.warn(`Could not read text content for uploaded file ${file.name}`, e);
            }
        }
        flowItems.push({
            name: file.name,
            textContent: textContent, 
            isTextEntry: false, 
            fileType: file.type,
        });
    }
    return flowItems;
  };

  const handleGenerateMaterial = async (sourceOverride?: "selected_kb" | "entire_kb" | "direct_uploads" | "direct_prompt") => {
    setIsLoading(true);
    setGeneratedMaterial(null);
    setError(null);

    if (!selectedProduct) {
      toast({ variant: "destructive", title: "Product Not Selected", description: "Please select a product." });
      setIsLoading(false);
      return;
    }
    if (!selectedFormat) {
      toast({ variant: "destructive", title: "Format Not Selected", description: "Please select an output format." });
      setIsLoading(false);
      return;
    }

    let itemsToProcessForFlow: TrainingDeckFlowKnowledgeBaseItem[] = [];
    let generateFromAllKbFlag = false;
    let sourceDescription = "";
    let actualSourceUsed: "selected_kb" | "entire_kb" | "direct_uploads" | "direct_prompt" | "none" = "none";

    if (sourceOverride === "entire_kb") {
      actualSourceUsed = "entire_kb";
    } else if (directPrompt.trim().length >= 10) {
      actualSourceUsed = "direct_prompt";
    } else if (directUploadFiles.length > 0) {
      actualSourceUsed = "direct_uploads";
    } else if (selectedKnowledgeBaseItems.length > 0) {
      actualSourceUsed = "selected_kb";
    }
    
    if (actualSourceUsed === "none" && sourceOverride !== "entire_kb") {
        toast({ variant: "destructive", title: "No Context Provided", description: "Please provide a direct prompt, upload files, or select KB items to generate material." });
        setIsLoading(false);
        return;
    }


    if (actualSourceUsed === "direct_prompt") {
        itemsToProcessForFlow.push({
            name: "User-Provided Prompt",
            textContent: directPrompt,
            isTextEntry: true,
            fileType: "text/plain"
        });
        sourceDescription = "context from a direct user-provided prompt";
    } else if (actualSourceUsed === "direct_uploads") {
      itemsToProcessForFlow = await mapDirectUploadsToFlowItems(directUploadFiles);
      sourceDescription = `context from ${directUploadFiles.length} directly uploaded file(s): ${directUploadFiles.map(f=>f.name).join(', ')}`;
    } else if (actualSourceUsed === "selected_kb") {
      itemsToProcessForFlow = mapKbFilesToFlowItems(selectedKnowledgeBaseItems);
      sourceDescription = `context from ${selectedKnowledgeBaseItems.length} selected Knowledge Base item(s): ${selectedKnowledgeBaseItems.map(f=>f.name).join(', ')}`;
    } else if (actualSourceUsed === "entire_kb") {
      const kbForProduct = knowledgeBaseFiles.filter(f => f.product === selectedProduct);
      if (kbForProduct.length === 0) {
        toast({ variant: "destructive", title: "KB Empty for Product", description: `Knowledge Base is empty for ${selectedProduct}. Add files/text entries via 'Knowledge Base Management'.` });
        setIsLoading(false);
        return;
      }
      itemsToProcessForFlow = mapKbFilesToFlowItems(kbForProduct);
      generateFromAllKbFlag = true;
      sourceDescription = `context from the entire Knowledge Base for product ${selectedProduct}`;
    }

    const flowInput: GenerateTrainingDeckInput = {
      product: selectedProduct,
      deckFormatHint: selectedFormat,
      knowledgeBaseItems: itemsToProcessForFlow,
      generateFromAllKb: generateFromAllKbFlag,
      sourceDescriptionForAi: sourceDescription,
    };

    try {
      const response = await fetch('/api/training-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flowInput),
      });
      if (!response.ok) {
        throw new Error(`Training deck API failed: ${response.statusText}`);
      }
      const result = await response.json();
      const materialType = selectedFormat === "Brochure" ? "Brochure" : "Deck";
      if (result.deckTitle.startsWith("Error Generating") || result.deckTitle.startsWith("Critical Error") || result.deckTitle.startsWith("Input Error")) {
        setError(result.sections[0]?.content || `AI failed to generate ${materialType.toLowerCase()} content.`);
        setGeneratedMaterial(null);
        toast({ variant: "destructive", title: `${materialType} Generation Failed`, description: result.sections[0]?.content || `AI reported an error.` });
      } else {
        setGeneratedMaterial(result);
        toast({ title: `Training ${materialType} Generated!`, description: `${materialType} for ${selectedProduct} is ready.` });
      }
      logActivity({
        module: "Create Training Material",
        product: selectedProduct,
        details: {
          materialOutput: result, 
          inputData: flowInput 
        }
      });
    } catch (e) {
      console.error("Error generating training material:", e);
      const errorMessage = e instanceof Error ? e.message : "An unexpected AI error occurred.";
      setError(errorMessage);
      const materialType = selectedFormat === "Brochure" ? "Brochure" : "Deck";
      toast({ variant: "destructive", title: `${materialType} Generation Failed`, description: errorMessage });
       logActivity({
          module: "Create Training Material",
          product: selectedProduct,
          details: {
            error: errorMessage,
            inputData: flowInput
          }
        });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDirectFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      let totalSize = 0;
      for (const file of fileArray) {
        totalSize += file.size;
      }
      if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
        toast({
          variant: "destructive",
          title: "Upload Limit Exceeded",
          description: `Total size of selected files exceeds ${MAX_TOTAL_UPLOAD_SIZE / (1024*1024)}MB. Please select fewer or smaller files.`,
        });
        setDirectUploadFiles([]);
        if (directUploadInputRef.current) directUploadInputRef.current.value = "";
        return;
      }
      setDirectUploadFiles(fileArray);
      setDirectPrompt("");
      setSelectedKbFileIds([]);
    } else {
      setDirectUploadFiles([]);
    }
  };

  const handleDirectPromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDirectPrompt(e.target.value);
    if (e.target.value.trim().length > 0) {
        setDirectUploadFiles([]);
        setSelectedKbFileIds([]);
        if (directUploadInputRef.current) directUploadInputRef.current.value = "";
    }
  }

  const handleKbFileSelectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const options = event.target.options;
    const value: string[] = [];
    for (let i = 0, l = options.length; i < l; i++) {
      if (options[i].selected) {
        value.push(options[i].value);
      }
    }
    setSelectedKbFileIds(value);
    if (value.length > 0) {
        setDirectPrompt("");
        setDirectUploadFiles([]);
        if (directUploadInputRef.current) directUploadInputRef.current.value = "";
    }
  };


  const formatMaterialForTextExport = (material: GenerateTrainingDeckOutput, format: DeckFormat): string => {
    const materialType = format === "Brochure" ? "Brochure" : "Deck";
    let output = `${materialType} Title: ${material.deckTitle}\n`;
    output += `Product: ${selectedProduct}\n`;
    output += `Format: ${format}\n\n`;

    material.sections.forEach((section, index) => {
      output += `--------------------------------------------------\n`;
      output += `${format === "Brochure" ? "Section/Panel" : "Slide"} ${index + 1}: ${section.title}\n`;
      output += `--------------------------------------------------\n`;
      output += `${section.content}\n\n`;
      if (section.notes) {
        output += `${format === "Brochure" ? "Internal Notes/Suggestions" : "Speaker Notes"}:\n${section.notes}\n\n`;
      }
    });
    return output;
  };

  const handleExportMaterial = (material: GenerateTrainingDeckOutput | null, format: DeckFormat | undefined) => {
    if (!material || !format || !selectedProduct) return;

    const materialTypeName = format === "Brochure" ? "Brochure" : (format === "PDF" ? "Document" : "Outline");
    const filenameBase = `Training_${materialTypeName}_${selectedProduct.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    const textContent = formatMaterialForTextExport(material, format);

    if (format === "PDF" || format === "Brochure") {
      const pdfFilename = `${filenameBase}.pdf`;
      exportTextContentToPdf(textContent, pdfFilename);
      toast({ title: `${format} Content Exported as PDF`, description: `${pdfFilename} has been downloaded. This PDF contains the structured text and any AI-suggested placements for visuals.` });
    } else if (format === "Word Doc") { 
      const docFilename = `${filenameBase}.doc`;
      exportPlainTextFile(docFilename, textContent);
      toast({ title: `Word Doc Text Outline Downloaded`, description: `${docFilename} is a text file. Open it in Word (you may need to rename to .txt if it doesn't open easily) and copy the content to apply styling.` });
    } else if (format === "PPT") {
      const pptFilename = `${filenameBase}.doc`;
      exportPlainTextFile(pptFilename, textContent);
      toast({ title: `PPT Text Outline Downloaded`, description: `${pptFilename} is a text file. Open it in PowerPoint and copy the content to apply styling.` });
    }
  };

  const handleCopyToClipboard = (material: GenerateTrainingDeckOutput | null) => {
    if (!material || !selectedProduct || !selectedFormat) return;
    const textContent = formatMaterialForTextExport(material, selectedFormat);
    navigator.clipboard.writeText(textContent)
      .then(() => toast({ title: "Success", description: "Material content copied to clipboard!" }))
      .catch(_ => toast({ variant: "destructive", title: "Error", description: "Failed to copy material content." }));
  };

  const materialTypeDisplay = selectedFormat === "Brochure" ? "Brochure" : "Deck";
  
  const canGenerateFromAnyContext = isClient && selectedProduct && selectedFormat && 
    ( (directPrompt.trim().length >= 10) || (directUploadFiles.length > 0) || (selectedKbFileIds.length > 0) );
  const canGenerateFromEntireKb = isClient && selectedProduct && selectedFormat && knowledgeBaseFiles.filter(f => f.product === selectedProduct).length > 0;


  return (
    <div className="flex flex-col h-full">
      <PageHeader title={`Create Training ${materialTypeDisplay}`} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col items-center">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl text-primary flex items-center">
              <Settings2 className="h-6 w-6 mr-3" />
              Configure Training {materialTypeDisplay}
            </CardTitle>
            <CardDescription>
              Select product, format, and a source of context for generation. Choose one: direct prompt, direct file uploads, or select from Knowledge Base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product-select" className="mb-1.5 block flex items-center"><Briefcase className="h-4 w-4 mr-2" />Product <span className="text-destructive">*</span></Label>
                  <Select
                    value={selectedProduct}
                    onValueChange={(value) => setSelectedProduct(value)}
                  >
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProducts.map(p => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="format-select" className="mb-1.5 block flex items-center"><FileType2 className="h-4 w-4 mr-2" />Output Format</Label>
                  <Select
                    value={selectedFormat}
                    onValueChange={(value) => setSelectedFormat(value as DeckFormat)}
                  >
                    <SelectTrigger id="format-select">
                      <SelectValue placeholder="Select Output Format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DECK_FORMATS.map(format => (
                        <SelectItem key={format} value={format}>
                          {format}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
            </div>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Choose ONE Source Context</span>
              </div>
            </div>

            <div>
              <Label htmlFor="direct-prompt" className="mb-1.5 block flex items-center"><Edit3 className="h-4 w-4 mr-2" />Direct Prompt</Label>
              <Textarea
                id="direct-prompt"
                placeholder="Enter your detailed prompt here. Describe the training material you want, its purpose, key topics, target audience, desired tone, etc. (Min 10 characters)"
                value={directPrompt}
                onChange={handleDirectPromptChange}
                className="min-h-[100px]"
                disabled={isLoading}
              />
            </div>
            
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            
            <div>
              <Label htmlFor="direct-upload-files" className="mb-1.5 block flex items-center"><FileUp className="h-4 w-4 mr-2" />Directly Upload File(s)</Label>
              <Input
                id="direct-upload-files"
                type="file"
                multiple
                ref={directUploadInputRef}
                onChange={handleDirectFileChange}
                className="pt-1.5"
                disabled={isLoading}
              />
               {directUploadFiles.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{directUploadFiles.length} file(s) selected for direct upload. Total size: {(directUploadFiles.reduce((acc, file) => acc + file.size, 0) / (1024*1024)).toFixed(2)} MB.</p>
              )}
               <p className="text-xs text-muted-foreground mt-1">Max total upload size: {MAX_TOTAL_UPLOAD_SIZE / (1024*1024)}MB. PDF, DOCX, TXT, CSV etc.</p>
            </div>
            
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                 <Label htmlFor="kb-files-select" className="flex items-center"><BookOpen className="h-4 w-4 mr-2" />Select Files from Knowledge Base</Label>
                 {selectedKbFileIds.length > 0 && (
                    <Button variant="outline" size="xs" onClick={() => setIsViewKbItemsDialogOpen(true)} disabled={isLoading}>
                        <Eye className="mr-1.5 h-3.5 w-3.5"/> View Selected ({selectedKbFileIds.length})
                    </Button>
                 )}
              </div>
              <p className="text-xs text-muted-foreground mb-1">Use Ctrl/Cmd + Click to select multiple files. Filtered by selected product. View/manage KB on "Knowledge Base Management" page.</p>
              <select
                id="kb-files-select"
                multiple
                value={selectedKbFileIds}
                onChange={handleKbFileSelectionChange}
                className="w-full p-2 border rounded-md min-h-[100px] bg-background focus:ring-primary focus:border-primary"
                disabled={!isClient || !selectedProduct || knowledgeBaseFiles.filter(f => f.product === selectedProduct).length === 0 || isLoading}
              >
                {!isClient && <option disabled>Loading files...</option>}
                {isClient && (!selectedProduct || knowledgeBaseFiles.filter(f => f.product === selectedProduct).length === 0) && <option disabled>No files in knowledge base for selected product.</option>}
                {isClient && selectedProduct && knowledgeBaseFiles.filter(f => f.product === selectedProduct).length > 0 && knowledgeBaseFiles.filter(f => f.product === selectedProduct).map(file => (
                  <option key={file.id} value={file.id}>
                    {file.isTextEntry ? `(Text) ${file.name.substring(0, 50)}...` : `(File) ${file.name}`}
                  </option>
                ))}
              </select>
              {selectedKbFileIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{selectedKbFileIds.length} KB file(s) selected.</p>
              )}
            </div>

            <Separator className="my-5"/>

            <div className="space-y-3">
                <Button
                  onClick={() => handleGenerateMaterial()}
                  className="w-full py-3 text-base"
                  disabled={isLoading || !canGenerateFromAnyContext}
                >
                  <Sparkles className="mr-2 h-5 w-5" /> Generate from Provided Context
                </Button>

                <Button
                  onClick={() => handleGenerateMaterial("entire_kb")}
                  variant="outline"
                  className="w-full"
                  disabled={isLoading || !canGenerateFromEntireKb}
                >
                  <BookOpen className="mr-2 h-4 w-4" /> Generate from Entire KB for {selectedProduct || 'Product'}
                </Button>
            </div>

          </CardContent>
        </Card>

        {isLoading && (
            <div className="mt-6 flex flex-col items-center gap-2">
                <LoadingSpinner size={32} />
                <p className="text-muted-foreground">Generating training {materialTypeDisplay.toLowerCase()}, this may take a moment...</p>
            </div>
        )}

        {error && !isLoading && (
          <UiAlert variant="destructive" className="mt-6 max-w-2xl w-full">
            <InfoIconLucide className="h-4 w-4" />
            <UiAlertTitle>Generation Error</UiAlertTitle>
            <UiAlertDescription>{error}</UiAlertDescription>
          </UiAlert>
        )}

        {generatedMaterial && !isLoading && (
          <Card className="w-full max-w-3xl shadow-xl mt-6">
            <CardHeader>
              <div className="flex justify-between items-start flex-wrap gap-y-2">
                <div>
                    <CardTitle className="text-xl text-primary flex items-center">
                       {selectedFormat === "Brochure" ? <LayoutList className="mr-2 h-5 w-5"/> : <BookOpen className="mr-2 h-5 w-5"/>}
                       {generatedMaterial.deckTitle}
                    </CardTitle>
                    <CardDescription>Generated for: {selectedProduct}, Format: {selectedFormat}</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleCopyToClipboard(generatedMaterial)}>
                        <Copy className="mr-2 h-4 w-4" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportMaterial(generatedMaterial, selectedFormat)}>
                        <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" defaultValue={generatedMaterial.sections.map((_, index) => `section-${index}`)} className="w-full space-y-1">
                  {generatedMaterial.sections.map((section, index) => (
                    <AccordionItem value={`section-${index}`} key={index}>
                      <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 bg-muted/10 px-3 rounded-t-md [&_svg]:mr-2">
                          <div className="flex items-center">
                            {selectedFormat === "Brochure" ? <LayoutList className="mr-2 h-4 w-4 text-accent"/> : <BookOpen className="mr-2 h-4 w-4 text-accent"/>}
                            {selectedFormat === "Brochure" ? "Section/Panel" : "Slide"} {index + 1}: {section.title}
                          </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 text-sm bg-muted/20 p-3 rounded-b-md">
                          <p className="text-sm text-foreground whitespace-pre-line">{section.content}</p>
                          {section.notes && (
                            <div className="mt-2 p-2 bg-accent/10 rounded-md border border-accent/20">
                                <p className="text-xs font-semibold text-accent-foreground/80">
                                    {selectedFormat === "Brochure" ? "Internal Notes/Suggestions" : "Speaker Notes"}:
                                </p>
                                <p className="text-xs text-accent-foreground/70 whitespace-pre-line">{section.notes}</p>
                            </div>
                          )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {!generatedMaterial && !isLoading && !error && (
           <Card className="w-full max-w-2xl shadow-xs">
            <CardHeader>
                <CardTitle className="text-lg flex items-center">
                    <InfoIconLucide className="h-5 w-5 mr-2 text-accent"/>
                    How it Works & Output Formats
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                    This AI feature generates <strong>structured text content</strong> for your training materials based on the context you provide.
                    It assists with content creation and organization, not with full graphical design or native file formatting.
                </p>
                <ul className="list-disc list-inside space-y-1 pl-4">
                    <li><strong>PDF Format:</strong> Downloads a text-based PDF document. The content is structured as a readable document with sections. If you selected "Brochure" as the format, this PDF will contain persuasive text suitable for brochure panels, including AI's textual suggestions for visuals (e.g., "[Visual: Chart showing growth]").</li>
                    <li><strong>Word Doc Format:</strong> Downloads a <strong>plain text outline file (.doc)</strong>. Open this file (you might need to rename it to .txt if it doesn't open as text) and copy the structured content (titles, bullet points, paragraphs) into Microsoft Word. You can then apply your own styling, templates, and add graphics.</li>
                    <li><strong>PPT Format:</strong> Downloads a <strong>plain text outline file (.doc)</strong>. Similar to Word Doc, open this file and copy the structured content (slide titles, bullet points) into Microsoft PowerPoint. You can then apply your presentation themes, layouts, and add visuals.</li>
                </ul>
                 <p className="font-semibold mt-2">
                    The AI focuses on generating high-quality textual content and logical structure. The final design and formatting in tools like Word, PowerPoint, or design software for brochures remain under your creative control.
                </p>
            </CardContent>
        </Card>
        )}

        {isViewKbItemsDialogOpen && selectedKnowledgeBaseItems.length > 0 && (
            <Dialog open={isViewKbItemsDialogOpen} onOpenChange={setIsViewKbItemsDialogOpen}>
                <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-primary">Selected Knowledge Base Items ({selectedKnowledgeBaseItems.length})</DialogTitle>
                        <DialogDesc>Review the details of the KB items you've chosen for context.</DialogDesc>
                    </DialogHeader>
                    <ScrollArea className="grow p-1 pr-3 -mx-1">
                        <div className="space-y-4 p-4 rounded-md">
                            {selectedKnowledgeBaseItems.map(item => (
                                <Card key={item.id} className="bg-muted/30">
                                    <CardHeader className="pb-3 pt-4 px-4">
                                        <CardTitle className="text-md">{item.name}</CardTitle>
                                        <CardDescription className="text-xs">
                                            Type: {item.isTextEntry ? "Text Entry" : item.type} | 
                                            Size: {item.isTextEntry ? `${item.size} chars` : item.size /* formatBytes can be used here */} | 
                                            Product: {item.product || "N/A"} | 
                                            Persona: {item.persona || "N/A"} | 
                                            Uploaded: {format(parseISO(item.uploadDate), 'PPp')}
                                        </CardDescription>
                                    </CardHeader>
                                    {item.isTextEntry && item.textContent && (
                                        <CardContent className="px-4 pb-4">
                                            <Label htmlFor={`kb-view-content-${item.id}`} className="text-xs font-semibold">Content:</Label>
                                            <Textarea
                                                id={`kb-view-content-${item.id}`}
                                                value={item.textContent}
                                                readOnly
                                                className="mt-1 h-32 bg-background/50 text-xs whitespace-pre-wrap"
                                            />
                                        </CardContent>
                                    )}
                                    {!item.isTextEntry && (
                                        <CardContent className="px-4 pb-4">
                                            <p className="text-xs text-muted-foreground italic">Content of uploaded files cannot be previewed here. This entry is a file reference.</p>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="pt-4">
                        <Button onClick={() => setIsViewKbItemsDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}

      </main>
    </div>
  );
}
