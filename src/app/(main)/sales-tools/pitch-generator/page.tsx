"use client";

import { useState } from 'react';
import { PitchForm, PitchFormValues } from '@/components/features/pitch-generator/pitch-form'; 
import { PitchCard } from '@/components/features/pitch-generator/pitch-card';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, Lightbulb, InfoIcon } from 'lucide-react'; // Added Lightbulb
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { PageHeader } from '@/components/layout/page-header';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import type { GeneratePitchInput, GeneratePitchOutput } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription as UiCardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useProductContext } from '@/hooks/useProductContext';
import { buildProductKnowledgeBaseContext } from '@/lib/knowledge-base-context';
import { useAppVersion } from '@/context/app-version-context';


export default function PitchGeneratorPage() {
  const [pitch, setPitch] = useState<GeneratePitchOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const { files: knowledgeBaseFiles } = useKnowledgeBase();
  const { getProductByName } = useProductContext();
  const { appVersion } = useAppVersion();
  const isOpenSourceVersion = appVersion === 'open-source';

  const handleGeneratePitch = async (formData: PitchFormValues, directKbContent?: string, directKbFileInfo?: {name: string, type: string}) => {
    setIsLoading(true);
    setError(null);
    setPitch(null);

    const productToUse = formData.product;

    if (!productToUse) {
      toast({ variant: "destructive", title: "Error", description: "Product must be selected."});
      setIsLoading(false);
      return;
    }
    
    const productObject = getProductByName(productToUse);
    if (!productObject) {
      toast({ variant: "destructive", title: "Error", description: "Selected product details not found."});
      setIsLoading(false);
      return;
    }

    let knowledgeBaseContextToUse: string;
    let contextSourceMessage: string;
    let usedDirectFileContext = false;
    
    const generalKbContent = buildProductKnowledgeBaseContext(knowledgeBaseFiles, productObject, {
      customerCohort: formData.customerCohort,
    });

    if (directKbFileInfo) { 
        usedDirectFileContext = true;
        let directFileInstructions = `--- START OF USER-SELECTED KB CONTEXT (PRIMARY SOURCE) ---\n`;
        directFileInstructions += `File Name: ${directKbFileInfo.name}\n`;
        directFileInstructions += `File Type: ${directKbFileInfo.type}\n`;
        directFileInstructions += `Instruction to AI: This uploaded file ('${directKbFileInfo.name}') is the PRIMARY knowledge source for this pitch. `;
        
        if (directKbContent) {
            directFileInstructions += `Its plain text content is provided below. Utilize this content directly.\n`;
            directFileInstructions += `--- BEGIN UPLOADED FILE CONTENT ---\n${directKbContent}\n--- END UPLOADED FILE CONTENT ---\n`;
            contextSourceMessage = `Pitch generated using content from directly uploaded file: ${directKbFileInfo.name}.`;
        } else { 
            directFileInstructions += `The full content of this file (type: ${directKbFileInfo.type}) was not readable on the client. Infer context from its name, type, and any other available information.`;
            contextSourceMessage = `Pitch context from uploaded file: ${directKbFileInfo.name}. AI will attempt processing based on file name/type.`;
        }
        directFileInstructions += `--- END OF USER-SELECTED KB CONTEXT ---\n\n`;
        knowledgeBaseContextToUse = directFileInstructions + "\n--- FALLBACK GENERAL KNOWLEDGE BASE ---\n" + generalKbContent;

    } else { 
      knowledgeBaseContextToUse = generalKbContent;
      contextSourceMessage = "Pitch generated using general Knowledge Base.";
       if (knowledgeBaseContextToUse.includes("No specific knowledge base files or text entries were found")) {
          toast({
            variant: "default",
            title: "Knowledge Base Incomplete",
            description: `No KB content for ${productToUse}. AI generation will be based on general knowledge.`,
            duration: 7000,
          });
       }
    }
    
    const fullInput: GeneratePitchInput = {
      product: productToUse,
      brandName: productObject.brandName,
      brandUrl: productObject.brandUrl,
      customerCohort: formData.customerCohort,
      salesPlan: formData.salesPlan,
      offer: formData.offer,
      agentName: formData.agentName,
      userName: formData.userName,
      knowledgeBaseContext: knowledgeBaseContextToUse,
    };

    try {
      const endpoint = isOpenSourceVersion ? '/api/oss/pitch-generator' : '/api/pitch-generator';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fullInput),
      });
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      const result = await response.json();
      
      if (result.pitchTitle?.startsWith("Pitch Generation Failed")) {
         setError(result.warmIntroduction);
         setPitch(null);
         toast({
            variant: "destructive",
            title: "Pitch Generation Failed",
            description: result.warmIntroduction || "The AI model encountered an issue. See error details below.",
            duration: 10000, 
          });
      } else {
        setPitch(result);
        toast({
            title: "Pitch Generated!",
            description: contextSourceMessage,
        });
      }

      const { knowledgeBaseContext, ...inputForLogging } = fullInput;
      
      logActivity({
        module: "Pitch Generator",
        product: productToUse,
        details: { 
          pitchOutput: result,
          inputData: { 
            ...inputForLogging,
            knowledgeBaseContextProvided: !knowledgeBaseContext.includes("No specific knowledge base content found"),
            usedDirectFile: usedDirectFileContext,
            directFileName: directKbFileInfo?.name,
          }
        }
      });
    } catch (e) { 
      const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred. Check console for details.";
      setError(errorMessage); 
      toast({
        variant: "destructive",
        title: "Client Error Generating Pitch",
        description: errorMessage,
        duration: 10000,
      });

      const { knowledgeBaseContext, ...inputForLoggingOnError } = fullInput;

      logActivity({
        module: "Pitch Generator",
        product: productToUse,
        details: {
          error: `Client-side error: ${errorMessage}`,
           inputData: { 
            ...inputForLoggingOnError,
            knowledgeBaseContextProvided: !knowledgeBaseContext.includes("No specific knowledge base content found"),
            usedDirectFile: usedDirectFileContext,
            directFileName: directKbFileInfo?.name,
          }
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Pitch Generator" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col items-center space-y-6">
        <PitchForm onSubmit={handleGeneratePitch} isLoading={isLoading} />
        {isLoading && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <LoadingSpinner size={32} />
            <p className="text-muted-foreground">Generating your pitch...</p>
          </div>
        )}
        {error && !isLoading && ( 
          <Alert variant="destructive" className="mt-4 max-w-lg">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Pitch Generation Error</AlertTitle>
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1" className="border-b-0">
                    <AccordionTrigger className="p-0 hover:no-underline text-sm [&_svg]:ml-1">A generation error occurred. Click to view details.</AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <pre className="text-xs whitespace-pre-wrap break-all bg-destructive/10 p-2 rounded-md font-mono">{error}</pre>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
          </Alert>
        )}
        {pitch && !isLoading && <PitchCard pitch={pitch} />}
        {!pitch && !isLoading && !error && (
          <Card className="w-full max-w-lg shadow-xs">
            <CardHeader>
                <CardTitle className="text-lg flex items-center">
                    <Lightbulb className="h-5 w-5 mr-2 text-accent"/>
                    How to Use the Pitch Generator
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                    1. Select the <strong>Product</strong> you are creating a pitch for.
                </p>
                <p>
                    2. Choose the <strong>Customer Cohort</strong> to tailor the pitch.
                </p>
                <p>
                    3. Optionally, expand "Optional Personalization Details" to specify plan, offer, and names.
                </p>
                <p>
                    4. For knowledge context:
                </p>
                   <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                        <li><strong>Default:</strong> If no "Direct Context File" is uploaded, the AI uses relevant entries from your main <strong>Knowledge Base</strong> for the selected product.</li>
                        <li><strong>Direct File:</strong> Upload a single file (PDF, DOCX, TXT, etc.). This file becomes the primary knowledge source. The AI will prioritize its contents.</li>
                    </ul>
                <p>
                    5. Click <strong>Generate Pitch</strong>. The AI will craft a pitch based on the provided context.
                </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
