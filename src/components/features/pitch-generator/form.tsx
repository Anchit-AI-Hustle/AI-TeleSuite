"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription as UiCardDescription } from "@/components/ui/card";
import React, { useMemo, useState, useEffect } from "react";
import { FileUp, InfoIcon, Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useProductContext } from "@/hooks/useProductContext";


const MAX_DIRECT_UPLOAD_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for any file type upload for context

const FormSchema = z.object({
  product: z.string().min(1, "Product must be selected."),
  customerCohort: z.string().min(1, "Customer Cohort must be selected."),
  specialPlanConfigurations: z.string().optional(),
  salesPlan: z.string().optional(),
  offer: z.string().max(200, "Offer details should be max 200 characters.").optional(),
  agentName: z.string().max(50, "Agent name should be max 50 characters.").optional(),
  userName: z.string().max(50, "Customer name should be max 50 characters.").optional(),
  directKbFile: z
    .custom<FileList>()
    .optional()
    .refine(
      (fileList) => {
        if (!fileList || fileList.length === 0) return true;
        const file = fileList[0];
        return file.size <= MAX_DIRECT_UPLOAD_FILE_SIZE;
      },
      `Direct context file size must be ${MAX_DIRECT_UPLOAD_FILE_SIZE / (1024 * 1024)}MB or less.`
    )
});

export type PitchFormValues = z.infer<typeof FormSchema>; 

interface PitchFormProps {
  onSubmit: (data: PitchFormValues, directKbContent?: string, directKbFileInfo?: {name: string, type: string}) => Promise<void>; 
  isLoading: boolean;
}

export function PitchForm({ onSubmit, isLoading }: PitchFormProps) {
  const { getProductByName, availableProducts } = useProductContext();
  const directKbFileInputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      specialPlanConfigurations: undefined,
      salesPlan: undefined,
      offer: "",
      agentName: "",
      userName: "",
      product: ""
    },
  });

  const product = form.watch("product");
  const selectedProductData = getProductByName(product);
  
  const availableCohorts = useMemo(() => selectedProductData?.customerCohorts || [], [selectedProductData]);
  const availableSalesPlans = useMemo(() => selectedProductData?.salesPlans || [], [selectedProductData]);
  const availableSpecialConfigs = useMemo(() => selectedProductData?.specialPlanConfigurations || [], [selectedProductData]);
  
  useEffect(() => {
    // Reset cohort and plan selections if they are no longer valid for the new product
    const currentCohort = form.getValues("customerCohort");
    const currentSalesPlan = form.getValues("salesPlan");

    if (availableCohorts.length > 0 && !availableCohorts.includes(currentCohort)) {
      form.setValue("customerCohort", availableCohorts[0]);
    } else if (availableCohorts.length === 0) {
      form.setValue("customerCohort", "");
    }
    
    if (availableSalesPlans.length > 0 && currentSalesPlan && !availableSalesPlans.includes(currentSalesPlan)) {
      form.setValue("salesPlan", undefined);
    } else if (availableSalesPlans.length === 0) {
        form.setValue("salesPlan", undefined);
    }
    
    if (availableSpecialConfigs.length === 0) {
        form.setValue("specialPlanConfigurations", undefined);
    }

  }, [product, form, availableCohorts, availableSalesPlans, availableSpecialConfigs]);


  const handleSubmit = async (data: z.infer<typeof FormSchema>) => {
    let directKbContent: string | undefined = undefined;
    let directKbFileInfo: {name: string, type: string} | undefined = undefined;
    
    if (data.directKbFile && data.directKbFile.length > 0) {
      const file = data.directKbFile[0];
      directKbFileInfo = { name: file.name, type: file.type || "unknown" };
      
      const TEXT_READABLE_TYPES = ["text/plain", "text/markdown", "text/csv"];
      const MAX_CONTENT_READ_SIZE = 100 * 1024; // 100KB for reading content

      const isReadableTextType = TEXT_READABLE_TYPES.includes(file.type) || 
                                 file.name.match(/\.(txt|md|csv)$/i);

      if (isReadableTextType) {
        if (file.size <= MAX_CONTENT_READ_SIZE) {
          try {
            directKbContent = await file.text();
          } catch (e) {
            console.warn(`Could not read text content from file ${file.name}:`, e);
          }
        } else {
          console.warn(`File ${file.name} is too large (${(file.size/1024).toFixed(1)}KB) to read its content directly. Max for reading: ${MAX_CONTENT_READ_SIZE/1024}KB.`);
        }
      } else {
        console.log(`File ${file.name} (type: ${file.type}) is not a directly readable text type. AI will be instructed to attempt processing.`);
      }
    }
    await onSubmit(data, directKbContent, directKbFileInfo);
  };

  return (
    <Card className="w-full max-w-lg shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center"><Lightbulb className="mr-2 h-6 w-6 text-primary" />Generate Sales Pitch</CardTitle>
        <UiCardDescription>
          Select a product and cohort. Optionally provide a direct file for primary knowledge context.
        </UiCardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product <span className="text-destructive">*</span></FormLabel>
                   <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableProducts.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerCohort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Cohort <span className="text-destructive">*</span></FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!product || availableCohorts.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={!product ? "Select a product first" : "Select a customer cohort"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableCohorts.map((cohort) => (
                        <SelectItem key={cohort} value={cohort}>
                          {cohort}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="directKbFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><FileUp className="mr-2 h-4 w-4"/>Direct Context File (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="file"
                      accept="*" 
                      ref={directKbFileInputRef}
                      onChange={(e) => field.onChange(e.target.files)}
                      className="pt-1.5"
                    />
                  </FormControl>
                  <FormDescription>
                    Upload a file (PDF, DOCX, TXT, etc.). If provided, this becomes the primary knowledge source. If not, the general Knowledge Base for the product will be used.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="optional-details">
                <AccordionTrigger className="text-sm py-2 hover:no-underline">
                  Optional Personalization Details
                </AccordionTrigger>
                <AccordionContent className="pt-3 space-y-4">
                  <FormField
                    control={form.control}
                    name="specialPlanConfigurations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Special Plan Configuration</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={!product || availableSpecialConfigs.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select special plan config" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableSpecialConfigs.map((config) => (
                              <SelectItem key={config} value={config}>
                                {config}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesPlan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sales Plan</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={!product || availableSalesPlans.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={!product ? "Select product first" : "Select sales plan"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableSalesPlans.map((plan) => (
                              <SelectItem key={plan} value={plan}>
                                {plan}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="offer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specific Offer Details</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 20% off, TimesPrime bundle" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                      control={form.control}
                      name="agentName"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Agent Name</FormLabel>
                          <FormControl>
                              <Input placeholder="Agent's name" {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                      <FormField
                      control={form.control}
                      name="userName"
                      render={({ field }) => (
                          <FormItem>
                          <FormLabel>Customer Name</FormLabel>
                          <FormControl>
                              <Input placeholder="Customer's name" {...field} />
                          </FormControl>
                          <FormMessage />
                          </FormItem>
                      )}
                      />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            <Button type="submit" className="w-full mt-6!" disabled={isLoading || !product}>
              {isLoading ? "Generating Pitch..." : "Generate Pitch"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
