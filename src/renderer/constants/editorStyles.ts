export const editorStyles = `
  .sql-editor-container pre {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .sql-editor-container textarea {
    caret-color: #000 !important;
    outline: none !important;
    color: transparent !important;
    background: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }
  .ai-selection-input textarea {
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  .sql-editor-container pre {
    pointer-events: none !important;
  }
  .token.keyword { color: #2563eb; font-weight: bold; }
  .token.string { color: #059669; }
  .token.comment { color: #94a3b8; font-style: italic; }
  .token.number { color: #d97706; }
  .token.punctuation { color: #64748b; }
  .token.function { color: #7c3aed; }
  .token.operator { color: #475569; }
  /* Redis 高亮 */
  .token.redis-command { color: #dc2626; font-weight: bold; text-transform: uppercase; }
  .token.redis-key { color: #7c3aed; }
`;
