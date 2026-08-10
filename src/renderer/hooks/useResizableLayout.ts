import { useEffect, useState } from 'react';

export const useResizableLayout = () => {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [tableInspectorWidth, setTableInspectorWidth] = useState(390);
  const [resultsHeight, setResultsHeight] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingTableInspector, setIsResizingTableInspector] = useState(false);
  const [isResizingResults, setIsResizingResults] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(200, Math.min(600, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizingTableInspector) {
        const rightGap = 32; // 对应 right-8
        const nextWidth = window.innerWidth - e.clientX - rightGap;
        setTableInspectorWidth(Math.max(300, Math.min(760, nextWidth)));
      } else if (isResizingResults) {
        const newHeight = Math.max(100, Math.min(window.innerHeight - 200, window.innerHeight - e.clientY));
        setResultsHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingTableInspector(false);
      setIsResizingResults(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingSidebar || isResizingTableInspector || isResizingResults) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = (isResizingSidebar || isResizingTableInspector) ? 'col-resize' : 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingTableInspector, isResizingResults]);

  return {
    sidebarWidth,
    setSidebarWidth,
    tableInspectorWidth,
    setTableInspectorWidth,
    resultsHeight,
    setResultsHeight,
    isResizingSidebar,
    setIsResizingSidebar,
    isResizingTableInspector,
    setIsResizingTableInspector,
    isResizingResults,
    setIsResizingResults
  };
};
