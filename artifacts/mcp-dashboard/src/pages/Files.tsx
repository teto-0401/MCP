import { useState } from "react";
import { useListFiles, getListFilesQueryKey, useReadFile, getReadFileQueryKey, useWriteFile, useDeleteFile, useSearchFiles, getSearchFilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, File, Trash2, Save, Search, ChevronRight, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Files() {
  const [currentPath, setCurrentPath] = useState(".");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recursive, setRecursive] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: files, isLoading: filesLoading } = useListFiles(
    { path: currentPath, recursive },
    { query: { queryKey: getListFilesQueryKey({ path: currentPath, recursive }) } }
  );

  const { data: fileContent, isLoading: contentLoading } = useReadFile(
    { path: selectedFile ?? "" },
    { query: { enabled: !!selectedFile, queryKey: getReadFileQueryKey({ path: selectedFile ?? "" }) } }
  );

  const { data: searchResults, isLoading: searchLoading } = useSearchFiles(
    { query: searchQuery, path: currentPath, maxResults: 50 },
    { query: { enabled: searchQuery.length > 2, queryKey: getSearchFilesQueryKey({ query: searchQuery, path: currentPath }) } }
  );

  const writeFile = useWriteFile();
  const deleteFile = useDeleteFile();

  function handleFileClick(entry: { type: string; path: string; name: string }) {
    if (entry.type === "directory") {
      setCurrentPath(entry.path);
      setSelectedFile(null);
    } else {
      setSelectedFile(entry.path);
    }
  }

  function handleSave() {
    if (!selectedFile) return;
    writeFile.mutate(
      { data: { path: selectedFile, content: editContent } },
      {
        onSuccess: () => {
          toast({ title: "File saved" });
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ path: currentPath, recursive }) });
          queryClient.invalidateQueries({ queryKey: getReadFileQueryKey({ path: selectedFile! }) });
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      }
    );
  }

  function handleDelete(path: string) {
    deleteFile.mutate(
      { path },
      {
        onSuccess: () => {
          toast({ title: "Deleted" });
          if (selectedFile === path) setSelectedFile(null);
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ path: currentPath, recursive }) });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="p-6 h-full flex flex-col gap-4 overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">File Explorer</h1>
        <p className="text-muted-foreground text-sm">Browse and edit project files.</p>
      </div>

      <div className="flex gap-2">
        <Input
          data-testid="input-search"
          placeholder="Search file contents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs font-mono text-sm"
        />
        <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ path: currentPath, recursive }) })}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {searchQuery.length > 2 ? (
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Search Results</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {searchLoading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : searchResults?.length ? (
                <div className="divide-y divide-border">
                  {searchResults.map((r, i) => (
                    <div key={i} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => { setSearchQuery(""); setSelectedFile(r.file); }}>
                      <div className="font-mono text-xs text-primary">{r.file}:{r.line}</div>
                      <div className="font-mono text-xs text-muted-foreground mt-1 truncate">{r.context}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">No results found</div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          <Card className="w-72 flex-shrink-0 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b">
              <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground overflow-hidden">
                <span className="truncate">{currentPath}</span>
              </div>
              {currentPath !== "." && (
                <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => {
                  const parent = currentPath.split("/").slice(0, -1).join("/") || ".";
                  setCurrentPath(parent);
                }}>
                  .. (parent)
                </Button>
              )}
            </CardHeader>
            <ScrollArea className="flex-1">
              {filesLoading ? (
                <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : files?.length ? (
                <div className="p-2 space-y-0.5">
                  {files.map((f) => (
                    <div
                      key={f.path}
                      data-testid={`file-entry-${f.name}`}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer group ${selectedFile === f.path ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                      onClick={() => handleFileClick(f)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {f.type === "directory" ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" /> : <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <span className="truncate font-mono text-xs">{f.name}</span>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="w-5 h-5 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleDelete(f.path); }}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground text-xs">Empty directory</div>
              )}
            </ScrollArea>
          </Card>

          <Card className="flex-1 flex flex-col overflow-hidden">
            {selectedFile ? (
              <>
                <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground truncate">{selectedFile}</span>
                  <Button size="sm" onClick={handleSave} disabled={writeFile.isPending}>
                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                  </Button>
                </CardHeader>
                <div className="flex-1 overflow-hidden">
                  {contentLoading ? (
                    <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full" />)}</div>
                  ) : (
                    <textarea
                      data-testid="textarea-file-content"
                      className="w-full h-full p-4 bg-transparent font-mono text-xs resize-none focus:outline-none text-foreground"
                      value={editContent || fileContent?.content || ""}
                      onChange={(e) => setEditContent(e.target.value)}
                      onFocus={() => { if (!editContent && fileContent?.content) setEditContent(fileContent.content); }}
                      spellCheck={false}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Select a file to view or edit its contents
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
