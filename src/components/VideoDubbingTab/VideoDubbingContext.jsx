import { createContext, useContext } from "react";

export const VideoDubbingContext = createContext(null);

export function useVideoDubbing() {
  const context = useContext(VideoDubbingContext);
  if (!context) {
    return {};
  }
  return context;
}

export const useDubbingStage = useVideoDubbing;
export const useVideoDubbingContext = useVideoDubbing;

export function VideoDubbingProvider({ value, children }) {
  return (
    <VideoDubbingContext.Provider value={value}>
      {children}
    </VideoDubbingContext.Provider>
  );
}

export default VideoDubbingContext;
