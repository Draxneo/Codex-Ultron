interface Props {
  content: string;
}

export function MarkdownContent({ content }: Props) {
  // Simple markdown-like rendering: bold, links, line breaks
  const html = content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary hover:underline">$1</a>')
    .replace(/\n/g, "<br />");

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
