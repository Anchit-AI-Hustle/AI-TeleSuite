
"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PitchCard } from '@/components/features/pitch-generator/pitch-card';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import { useToast } from '@/hooks/use-toast';
import { GeneratePitchOutput, Product, OptimizedPitchGenerationOutput } from '@/types';
import { Save, Check, Wand2, Loader2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useProductContext } from '@/hooks/useProductContext';
import { Checkbox } from '@/components/ui/checkbox';

interface OptimizedPitchesDialogProps {
    isOpen: boolean;
    onClose: () => void;
    product: string;
    optimizedPitches: OptimizedPitchGenerationOutput | null;
    onSubmit: (selectedCohorts: string[]) => void;
    isLoading: boolean;
}

export function OptimizedPitchesDialog({ isOpen, onClose, product, optimizedPitches, onSubmit, isLoading }: OptimizedPitchesDialogProps) {
    const { addFile } = useKnowledgeBase();
    const { toast } = useToast();
    const [savedCohorts, setSavedCohorts] = useState<string[]>([]);
    
    const { getProductByName } = useProductContext();
    const productObject = getProductByName(product);
    const allCohorts = productObject?.customerCohorts || [];
    const [selectedCohorts, setSelectedCohorts] = useState<string[]>(allCohorts);

    const formatPitchForKb = (pitch: GeneratePitchOutput) => {
        let content = `Title: ${pitch.pitchTitle}\n\n`;
        content += `## Full Script\n${pitch.fullPitchScript}\n\n`;
        content += `## Introduction\n${pitch.warmIntroduction}\n\n`;
        content += `## Hook\n${pitch.personalizedHook}\n\n`;
        content += `## Product Explanation\n${pitch.productExplanation}\n\n`;
        content += `## Key Benefits\n${pitch.keyBenefitsAndBundles}\n\n`;
        content += `## Offer\n${pitch.discountOrDealExplanation}\n\n`;
        content += `## Objection Previews\n${pitch.objectionHandlingPreviews}\n\n`;
        content += `## Call to Action\n${pitch.finalCallToAction}\n\n`;
        if (pitch.notesForAgent) {
            content += `## Agent Notes\n${pitch.notesForAgent}\n`;
        }
        return content;
    };

    const handleSaveToKB = (cohort: string, pitch: GeneratePitchOutput) => {
        const content = formatPitchForKb(pitch);
        const entryName = `Optimized Pitch: ${pitch.pitchTitle}`;

        addFile({
            name: entryName,
            product: product,
            persona: cohort,
            category: 'Pitch',
            textContent: content,
            isTextEntry: true,
        });

        setSavedCohorts(prev => [...prev, cohort]);
        toast({
            title: 'Pitch Saved to Knowledge Base',
            description: `"${entryName}" saved for cohort: ${cohort}.`,
        });
    };

    const allPitchesHadErrors = optimizedPitches && optimizedPitches.optimizedPitches.every(p => p.pitch.pitchTitle.includes("Error"));

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-4 pb-3 border-b sticky top-0 bg-background z-10">
                    <DialogTitle className="text-xl text-primary">Optimized Sales Pitches for '{product}'</DialogTitle>
                    <DialogDescription>
                        Based on the combined call analysis, generate and review optimized pitches for selected customer cohorts.
                    </DialogDescription>
                </DialogHeader>
                <div className="grow p-4 overflow-y-auto">
                    <div className="p-4 border rounded-lg bg-muted/20 space-y-3 mb-4">
                        <h4 className="font-semibold text-foreground flex items-center"><Users className="mr-2 h-5 w-5 text-primary" />Select Cohorts to Generate</h4>
                        <div className="flex items-center gap-2">
                             <CohortSelector allCohorts={allCohorts} selectedCohorts={selectedCohorts} onSelectionChange={setSelectedCohorts} />
                             <Button onClick={() => onSubmit(selectedCohorts)} disabled={isLoading || selectedCohorts.length === 0}>
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : <><Wand2 className="mr-2 h-4 w-4" /> Generate for ({selectedCohorts.length})</>}
                             </Button>
                        </div>
                    </div>

                    {isLoading && (
                        <div className="flex justify-center items-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    )}
                    
                    {optimizedPitches && (
                        allPitchesHadErrors ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>Could not generate optimized pitches due to an error.</p>
                                <p className="text-xs mt-1">{optimizedPitches.optimizedPitches[0]?.pitch.warmIntroduction || "Check server logs for more details."}</p>
                            </div>
                        ) : (
                            <Accordion type="multiple" defaultValue={[optimizedPitches.optimizedPitches[0]?.cohort]} className="w-full space-y-2">
                                {optimizedPitches.optimizedPitches.map(({ cohort, pitch }, index) => (
                                    <AccordionItem value={cohort} key={`${cohort}-${index}`}>
                                        <AccordionTrigger className="text-md font-semibold hover:no-underline bg-muted/30 px-4 py-2 rounded-md">
                                            <div className="flex justify-between items-center w-full pr-2">
                                                <span>Cohort: {cohort}</span>
                                                {pitch.pitchTitle.includes("Error") ? (
                                                    <Badge variant="destructive">Error</Badge>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // prevent accordion from toggling
                                                            handleSaveToKB(cohort, pitch);
                                                        }}
                                                        disabled={savedCohorts.includes(cohort)}
                                                    >
                                                        {savedCohorts.includes(cohort) ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                                                        {savedCohorts.includes(cohort) ? 'Saved' : 'Save to KB'}
                                                    </Button>
                                                )}
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-3 px-1">
                                            <PitchCard pitch={pitch} />
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        )
                    )}
                </div>
                <DialogFooter className="p-3 border-t bg-muted/50 sticky bottom-0">
                    <Button onClick={onClose} size="sm">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


// A helper component for multi-select cohort dropdown
const CohortSelector = ({ allCohorts, selectedCohorts, onSelectionChange }: { allCohorts: string[], selectedCohorts: string[], onSelectionChange: (selected: string[]) => void }) => {
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            onSelectionChange(allCohorts);
        } else {
            onSelectionChange([]);
        }
    };
    
    const handleSelectCohort = (cohort: string, checked: boolean) => {
        if (checked) {
            onSelectionChange([...selectedCohorts, cohort]);
        } else {
            onSelectionChange(selectedCohorts.filter(c => c !== cohort));
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-[250px] justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    {selectedCohorts.length > 0 ? `${selectedCohorts.length} selected` : "Select cohorts..."}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Filter cohorts..." />
                    <CommandList>
                        <CommandEmpty>No cohorts found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem onSelect={() => handleSelectAll(selectedCohorts.length !== allCohorts.length)} className="flex items-center space-x-2">
                                 <Checkbox checked={selectedCohorts.length === allCohorts.length} />
                                 <span>Select All</span>
                            </CommandItem>
                           {allCohorts.map(cohort => (
                               <CommandItem key={cohort} onSelect={() => handleSelectCohort(cohort, !selectedCohorts.includes(cohort))} className="flex items-center space-x-2">
                                  <Checkbox checked={selectedCohorts.includes(cohort)} />
                                  <span>{cohort}</span>
                               </CommandItem>
                           ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
