import React from "react";

// Provides access to the scrollable workspace viewport element so pages can
// store/restore scroll position for resume.

type WorkspaceViewportValue = {
  element: HTMLElement | null;
};

const WorkspaceViewportContext = React.createContext<WorkspaceViewportValue>({
  element: null
});

export function useWorkspaceViewport(): WorkspaceViewportValue {
  return React.useContext(WorkspaceViewportContext);
}

export const WorkspaceViewportProvider: React.FC<{ element: HTMLElement | null; children: React.ReactNode }> = ({
  element,
  children
}) => {
  return <WorkspaceViewportContext.Provider value={{ element }}>{children}</WorkspaceViewportContext.Provider>;
};
