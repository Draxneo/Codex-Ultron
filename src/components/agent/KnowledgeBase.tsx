import { useState, useRef } from "react";
import { RagAnalytics } from "@/components/agent/RagAnalytics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, Info, Brain, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function KnowledgeBase() {
  const [uploading, setUploading] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleEmbeddings = async (mode: "full" | "incremental") => {
    setEmbedding(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-embeddings", {
        body: { source: "all", mode },
      });
      if (error) throw error;
      toast({
        title: "Knowledge base updated",
        description: `${mode === "full" ? "Full rebuild" : "Incremental update"}: ${data.total_embedded} chunks embedded from ${data.sources?.length} sources.`,
      });
    } catch (err: any) {
      toast({ title: "Embedding failed", description: err.message, variant: "destructive" });
    } finally {
      setEmbedding(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext || "")) {
      toast({ title: "Unsupported file", description: "Upload PDF, DOCX, or TXT files.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("agent-documents").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: fnErr } = await supabase.functions.invoke("extract-document-text", {
        body: { file_path: path, file_name: file.name },
      });
      if (fnErr) throw fnErr;

      qc.invalidateQueries({ queryKey: ["copilot_training"] });
      toast({ title: "Document processed", description: `"${file.name}" extracted and added to knowledge base.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>What IS</strong> — Add factual reference info here: company details, system architecture, status definitions, tool guides. The AI reads these as its encyclopedia.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Upload Document
          </CardTitle>
          <CardDescription className="text-xs">
            Upload PDF, DOCX, or TXT files. Content is extracted and added to the knowledge base automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} />
          <Button
            variant="outline"
            className="w-full border-dashed h-20"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Upload className="h-5 w-5 mr-2" /> Drop or click to upload a document</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            RAG Knowledge Base
          </CardTitle>
          <CardDescription className="text-xs">
            Vectorize training data, call transcripts, and SMS threads for semantic search. Runs automatically every night at 2 AM.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEmbeddings("incremental")}
            disabled={embedding}
          >
            {embedding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sync New Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEmbeddings("full")}
            disabled={embedding}
          >
            {embedding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
            Full Rebuild
          </Button>
        </CardContent>
      </Card>

      <RagAnalytics />

    </div>
  );
}
